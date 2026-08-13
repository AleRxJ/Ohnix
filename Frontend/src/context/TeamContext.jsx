import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import AuthContext from "./AuthContext";
import useI18n from "../hooks/useI18n";
import { teamService } from "../services/teamService";
import { connectSocket, disconnectSocket, getSocket } from "../live/socketClient";

const TeamContext = createContext();

const LEVEL_ORDER = { none: 0, view: 1, edit: 2, admin: 3 };

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

    const refreshTeam = useCallback(async () => {
        setLoading(true);
        try {
            const res = await teamService.getCurrentTeam();
            setTeam(res?.data?.team ?? null);
            setIsOwner(Boolean(res?.data?.isOwner));
            setMyRole(res?.data?.myRole ?? null);
        } catch (err) {
            // 404 just means "no team yet" (solo user or hasn't created one) -
            // not an error state worth surfacing.
            setTeam(null);
            setIsOwner(false);
            setMyRole(null);
        } finally {
            setLoading(false);
        }
    }, []);

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

        const socket = connectSocket(token);
        hasWarnedSessionReplaced.current = false;

        const handleConnect = () => setSocketConnected(true);
        const handleDisconnect = () => setSocketConnected(false);
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

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("session:replaced", handleSessionReplaced);

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("session:replaced", handleSessionReplaced);
        };
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

    const value = {
        team,
        isOwner,
        isTeamMember: Boolean(team) && !isOwner,
        myRole,
        loading,
        refreshTeam,
        hasPermission,
        socketConnected,
        getSocket,
    };

    return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

export const useTeam = () => useContext(TeamContext);

export default TeamContext;
