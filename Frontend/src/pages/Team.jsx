import React, { useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, Spin } from "antd";
import {
    UsergroupAddOutlined,
    SafetyCertificateOutlined,
    MailOutlined,
    IdcardOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import useI18n from "../hooks/useI18n";
import useSubscription, { TEAM_SEAT_LIMITS } from "../hooks/useSubscription";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { teamService } from "../services/teamService";
import CreateTeamPrompt from "../components/team/CreateTeamPrompt";
import MembersTab from "../components/team/MembersTab";
import RolesTab from "../components/team/RolesTab";
import ActivityTab from "../components/team/ActivityTab";
import SettingsTab from "../components/team/SettingsTab";
import PointsOfSaleTab from "../components/team/PointsOfSaleTab";
import MemberOverview from "../components/team/MemberOverview";
import SessionsTable from "../components/common/SessionsTable";
import { useDataInvalidation } from "../hooks/useDataInvalidation";

const StatTile = ({ icon, label, value, accent = "#29D8D5" }) => (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] p-3 sm:p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] min-w-0">
        <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: `${accent}40`, background: `${accent}14`, color: accent }}
        >
            {icon}
        </div>
        <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-xl sm:text-2xl font-bold leading-tight text-[var(--ohnix-text-primary)]" title={typeof value === "string" ? value : undefined}>
                {value}
            </p>
            <p className="m-0 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{label}</p>
        </div>
    </div>
);

const Team = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team, isOwner, loading: teamLoading } = useTeam();
    const { plan, loading: planLoading } = useSubscription();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get("tab") || "members";

    const [roles, setRoles] = useState([]);
    const [members, setMembers] = useState([]);
    const [pendingCount, setPendingCount] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);

    const loadRoles = useCallback(async () => {
        if (!team || !isOwner) return;
        try {
            const res = await teamService.getRoles(team.id);
            setRoles(res?.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    }, [team, isOwner, t]);

    const loadMembers = useCallback(async () => {
        if (!team || !isOwner) return;
        try {
            const res = await teamService.getMembers(team.id);
            setMembers(res?.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    }, [team, isOwner, t]);

    const loadSessions = useCallback(async () => {
        if (!team || !isOwner) return;
        setSessionsLoading(true);
        try {
            const res = await teamService.getTeamSessions(team.id);
            setSessions(res?.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSessionsLoading(false);
        }
    }, [team, isOwner, t]);

    useEffect(() => {
        loadRoles();
        loadMembers();
        loadSessions();
    }, [loadRoles, loadMembers, loadSessions]);

    // A member (or the owner) logging in/out elsewhere, or a revoke from
    // this same screen on another tab, refreshes this list live instead of
    // needing a manual reload (see Backend/utils/sessionStore.js).
    useDataInvalidation("sessions", loadSessions);

    const handleRevokeSession = async (session) => {
        try {
            await teamService.revokeMemberSession(team.id, session.user.id, session.id);
            setSessions((prev) => prev.filter((s) => s.id !== session.id));
            toast.success(t("profile.session_revoked_toast"));
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    useEffect(() => {
        if (!team || !isOwner) return;
        teamService
            .getInvitations(team.id)
            .then((res) => setPendingCount((res?.data || []).filter((i) => i.status === "pending").length))
            .catch(() => {});
    }, [team, isOwner]);

    if (teamLoading || planLoading) {
        return (
            <div className="flex justify-center py-16">
                <Spin size="large" />
            </div>
        );
    }

    if (!team) {
        const planSupportsTeams = TEAM_SEAT_LIMITS[plan] !== 0 && TEAM_SEAT_LIMITS[plan] !== undefined;
        return (
            <div className="p-4 sm:p-6">
                <PageHeader title={t("team.page_title")} subtitle={t("team.page_subtitle")} icon={<UsergroupAddOutlined />} />
                <div className="mt-8">
                    <CreateTeamPrompt planSupportsTeams={planSupportsTeams} />
                </div>
            </div>
        );
    }

    // Non-owners get their own read-only view (who's on the team, who owns
    // it, what their own role grants) - not the admin console below, and not
    // gated by any module permission: seeing your own team needs no special
    // grant (see team.routes.js).
    if (!isOwner) {
        return (
            <div className="p-4 sm:p-6">
                <PageHeader title={team.name} subtitle={t("team.page_subtitle")} icon={<UsergroupAddOutlined />} />
                <div className="mt-6">
                    <MemberOverview />
                </div>
            </div>
        );
    }

    const items = [
        {
            key: "members",
            label: t("team.tab_members"),
            children: <MembersTab roles={roles} onRolesChanged={loadRoles} onMembersChanged={loadMembers} />,
        },
        {
            key: "sessions",
            label: t("team.tab_sessions"),
            children: (
                <SessionsTable
                    sessions={sessions}
                    loading={sessionsLoading}
                    onRevoke={handleRevokeSession}
                    showCompany={false}
                />
            ),
        },
        {
            key: "points-of-sale",
            label: t("team.tab_points_of_sale"),
            children: <PointsOfSaleTab />,
        },
        {
            key: "roles",
            label: t("team.tab_roles"),
            children: <RolesTab roles={roles} members={members} onRolesChanged={loadRoles} />,
        },
        { key: "activity", label: t("team.tab_activity"), children: <ActivityTab /> },
        { key: "settings", label: t("team.tab_settings"), children: <SettingsTab /> },
    ];

    const seatLimit = TEAM_SEAT_LIMITS[plan] ?? null;
    const validTabKeys = items.map((item) => item.key);
    const resolvedActiveTab = validTabKeys.includes(activeTab) ? activeTab : "members";

    return (
        <div className="p-4 sm:p-6">
            <PageHeader title={team.name} subtitle={t("team.page_subtitle")} icon={<UsergroupAddOutlined />} />

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                    icon={<UsergroupAddOutlined />}
                    label={t("team.tab_members")}
                    value={seatLimit === null ? members.length : `${members.length}/${seatLimit}`}
                    accent="#29D8D5"
                />
                <StatTile
                    icon={<SafetyCertificateOutlined />}
                    label={t("team.tab_roles")}
                    value={roles.length || "—"}
                    accent="#7C6AF7"
                />
                <StatTile
                    icon={<MailOutlined />}
                    label={t("team.status_pending")}
                    value={pendingCount === null ? "—" : pendingCount}
                    accent="#f59e0b"
                />
                <StatTile
                    icon={<IdcardOutlined />}
                    label={t("team.owner_badge")}
                    value={user?.username || "—"}
                    accent="#22C55E"
                />
            </div>

            <div className="mt-6">
                <Tabs
                    items={items}
                    className="custom-tabs"
                    activeKey={resolvedActiveTab}
                    onChange={(key) => setSearchParams(key === "members" ? {} : { tab: key })}
                />
            </div>
        </div>
    );
};

export default Team;
