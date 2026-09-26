import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import AuthContext from "./AuthContext";
import useI18n from "../hooks/useI18n";
import { teamService } from "../services/teamService";
import { connectSocket, disconnectSocket, getSocket } from "../live/socketClient";
import { subscribeConnectivity } from "../offline/connectivity";

const TeamContext = createContext();

const LEVEL_ORDER = { none: 0, view: 1, edit: 2, admin: 3 };

const NO_TEAM_STATE = { team: null, isOwner: false, myRole: null };

// Mirror of Backend FULL_CAPABILITIES - what the owner/solo users always get.
const FULL_CAPABILITIES = { salesPriceOverride: true, salesMaxDiscountPct: 100, catalogViewCosts: true };

// Last confirmed team/role per user, so a reload while offline renders the
// member's real permissions instead of the full UI - the team half of the
// snapshot AuthContext's LAST_KNOWN_USER_KEY already keeps for the user
// (see OFFLINE_ARCHITECTURE.md section 8). Keyed by user id so a shared
// browser never hands one person's role to another. UX-only, like
// hasPermission itself: the backend re-checks every queued write on sync.
const teamSnapshotKey = (userId) => `ohnix:lastKnownTeam:${userId}`;
const persistTeamSnapshot = (userId, state) => {
    if (!userId) return;
    try {
        localStorage.setItem(teamSnapshotKey(userId), JSON.stringify(state));
    } catch {
        // Storage full/unavailable - offline reload just falls back below.
    }
};
const readTeamSnapshot = (userId) => {
    if (!userId) return null;
    try {
        const raw = localStorage.getItem(teamSnapshotKey(userId));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const TeamProvider = ({ children }) => {
    const { user, authenticated, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const { t } = useI18n();

    const [team, setTeam] = useState(null);
    const [isOwner, setIsOwner] = useState(false);
    const [myRole, setMyRole] = useState(null);
    const [loading, setLoading] = useState(true);
    const [socketConnected, setSocketConnected] = useState(false);
    const hasWarnedSessionReplaced = useRef(false);
    const pendingPosScopeReconnect = useRef(false);

    // True while team/role come from the last-known snapshot instead of the
    // server - lets the connectivity effect below re-confirm once back online.
    const restoredFromSnapshot = useRef(false);

    const applyTeamState = useCallback((state) => {
        setTeam(state.team);
        setIsOwner(state.isOwner);
        setMyRole(state.myRole);
    }, []);

    const refreshTeam = useCallback(async () => {
        setLoading(true);
        const userId = user?.id;
        try {
            const res = await teamService.getCurrentTeam();
            const state = {
                team: res?.data?.team ?? null,
                isOwner: Boolean(res?.data?.isOwner),
                myRole: res?.data?.myRole ?? null,
            };
            applyTeamState(state);
            persistTeamSnapshot(userId, state);
            restoredFromSnapshot.current = false;
        } catch (err) {
            if (err?.response?.status === 404) {
                // 404 is the server's real answer: "no team" (solo user or
                // hasn't created one) - not an error state worth surfacing.
                applyTeamState(NO_TEAM_STATE);
                persistTeamSnapshot(userId, NO_TEAM_STATE);
                restoredFromSnapshot.current = false;
                return;
            }
            // Anything else (offline, timeout, 5xx) only means "couldn't
            // confirm right now". Falling back to NO_TEAM_STATE here made
            // hasPermission pass everything, so a restricted member reloading
            // offline saw the owner's full UI. Restore their last confirmed
            // role instead. With no snapshot at all (device never loaded the
            // team online since this shipped) there is nothing better to
            // go on than the old behavior - the backend still enforces.
            const snapshot = readTeamSnapshot(userId);
            applyTeamState(snapshot || NO_TEAM_STATE);
            restoredFromSnapshot.current = true;
        } finally {
            setLoading(false);
        }
    }, [user?.id, applyTeamState]);

    // Back online after restoring from the snapshot - replace it with the
    // server's answer (the role may have changed while this device was away).
    useEffect(() => subscribeConnectivity((online) => {
        if (online && restoredFromSnapshot.current) refreshTeam();
    }), [refreshTeam]);

    useEffect(() => {
        if (!authenticated || !user) {
            setTeam(null);
            setIsOwner(false);
            setMyRole(null);
            setLoading(false);
            return;
        }
        refreshTeam();
    }, [authenticated, user?.id, refreshTeam]);

    // Live connection lifecycle: one socket per authenticated session, wired
    // to react instantly if this device's session gets replaced by a login
    // elsewhere (single active session rule - see Backend's sessionStore.js).
    useEffect(() => {
        if (!authenticated || !user) {
            disconnectSocket();
            setSocketConnected(false);
            return;
        }

        const token = localStorage.getItem("accessToken");
        if (!token) return;

        hasWarnedSessionReplaced.current = false;
        let current = connectSocket(token);
        let detachCurrent = () => {};

        const handleConnect = () => setSocketConnected(true);
        const handleDisconnect = () => {
            setSocketConnected(false);
            // A pos-scope-driven disconnect is deliberate and self-healing -
            // socket.io-client only auto-reconnects after an *unplanned*
            // disconnect, so this opens a fresh connection explicitly, then
            // re-attaches this same set of handlers to it (attach, below) -
            // otherwise the new socket instance would sit there with no
            // lifecycle listeners at all until this effect happened to
            // re-run for an unrelated reason.
            if (pendingPosScopeReconnect.current) {
                pendingPosScopeReconnect.current = false;
                const latestToken = localStorage.getItem("accessToken");
                if (latestToken) attach(connectSocket(latestToken));
            }
        };
        const handleSessionReplaced = async () => {
            if (hasWarnedSessionReplaced.current) return;
            hasWarnedSessionReplaced.current = true;
            toast.error(
                t("team.session_replaced"),
                { duration: 6000 }
            );
            await logout();
            navigate("/login", { replace: true });
        };
        // Server-side scope change (a new Point of Sale was created, or
        // this member's own scope was edited - see Backend's
        // utils/posScopeStore.js) - unlike session:replaced, this is
        // invisible on purpose: nothing about the user's own session
        // changed, only which Point of Sale rooms their connection should
        // be in. Reconnecting is deferred to handleDisconnect above rather
        // than done here, since connectSocket's own "already connected"
        // guard would otherwise race the pending close and silently no-op.
        const handlePosScopeChanged = () => {
            pendingPosScopeReconnect.current = true;
        };

        const attach = (socket) => {
            detachCurrent();
            current = socket;
            socket.on("connect", handleConnect);
            socket.on("disconnect", handleDisconnect);
            socket.on("session:replaced", handleSessionReplaced);
            socket.on("pos-scope:changed", handlePosScopeChanged);
            detachCurrent = () => {
                socket.off("connect", handleConnect);
                socket.off("disconnect", handleDisconnect);
                socket.off("session:replaced", handleSessionReplaced);
                socket.off("pos-scope:changed", handlePosScopeChanged);
            };
        };

        attach(current);

        return () => detachCurrent();
    }, [authenticated, user?.id, logout, navigate, t]);

    // moduleKey/minLevel gate mirroring the backend's requireModulePermission
    // (team.permissions.js) - the owner (isOwner) and solo users (no team at
    // all) always pass; only an invited member's role is actually checked.
    // This is UX-only - the backend enforces the real boundary.
    const hasPermission = useCallback(
        (moduleKey, minLevel = "view") => {
            if (!team || isOwner) return true;
            const level = myRole?.permissions?.find((p) => p.moduleKey === moduleKey)?.level ?? "none";
            return (LEVEL_ORDER[level] ?? 0) >= (LEVEL_ORDER[minLevel] ?? 0);
        },
        [team, isOwner, myRole]
    );

    // Action-level grants (TeamRole.capabilities - see Backend
    // team.permissions.js#CAPABILITIES). Same owner/solo rule as
    // hasPermission; for a member a missing key is denied. getCapability
    // returns the raw value (e.g. salesMaxDiscountPct as a number).
    const getCapability = useCallback(
        (key) => {
            if (!team || isOwner) return FULL_CAPABILITIES[key];
            const value = myRole?.capabilities?.[key];
            if (typeof FULL_CAPABILITIES[key] === "boolean") return value === true;
            const number = Number(value);
            return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
        },
        [team, isOwner, myRole]
    );
    const hasCapability = useCallback((key) => getCapability(key) === true, [getCapability]);

    const value = {
        team,
        isOwner,
        isTeamMember: Boolean(team) && !isOwner,
        myRole,
        loading,
        refreshTeam,
        hasPermission,
        hasCapability,
        getCapability,
        socketConnected,
        getSocket,
    };

    return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

export const useTeam = () => useContext(TeamContext);

export default TeamContext;
