import React, { useEffect, useState } from "react";
import { Typography, Popconfirm, Button, Spin } from "antd";
import dayjs from "dayjs";
import {
    DesktopOutlined,
    MobileOutlined,
    GlobalOutlined,
    LogoutOutlined,
    CheckCircleFilled,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { userService } from "../../services/userService";
import { useDataInvalidation } from "../../hooks/useDataInvalidation";

const { Text } = Typography;

const DEVICE_ICONS = {
    desktop: DesktopOutlined,
    mobile: MobileOutlined,
    web: GlobalOutlined,
};

// "Sesiones activas" - every device currently logged in on this account at
// once (Web/Desktop/Mobile can all be active simultaneously now, see
// Backend/utils/sessionStore.js), with the ability to sign one out remotely
// - the same idea as Google/Netflix's device list.
const SessionsTab = () => {
    const { t } = useI18n();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState(null);

    const loadSessions = async () => {
        try {
            setLoading(true);
            const response = await userService.getSessions();
            if (response.success) {
                setSessions(response.data);
            }
        } catch {
            // userService already toasts real errors; an empty list here is
            // fine as a fallback since section still just renders "no data".
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []);

    // Another device logging in/out, or a revoke from an admin/team-owner
    // screen, should reflect here without a manual reload (see
    // Backend/utils/sessionStore.js's notifySessionsChanged).
    useDataInvalidation("sessions", loadSessions);

    const handleRevoke = async (sessionId) => {
        try {
            setRevokingId(sessionId);
            await userService.revokeSession(sessionId);
            setSessions((prev) => prev.filter((session) => session.id !== sessionId));
        } catch {
            // toasted by userService.revokeSession already.
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <div className="animate-fadeIn w-full px-3 sm:px-4 md:px-6 py-6 sm:py-8 lg:py-10">
            <div className="max-w-3xl mx-auto w-full">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#29D8D5] flex items-center justify-center shadow-[0_12px_28px_rgba(41,216,213,0.22)] flex-shrink-0">
                        <DesktopOutlined className="text-[#021314] text-lg sm:text-xl" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[var(--ohnix-text-primary)] m-0">
                        {t("profile.sessions_panel_title")}
                    </h1>
                </div>
                <Text className="text-sm sm:text-base text-[var(--ohnix-text-muted)] block mb-6 sm:mb-8">
                    {t("profile.sessions_panel_description")}
                </Text>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <Spin />
                    </div>
                ) : sessions.length === 0 ? (
                    <Text className="text-sm text-[var(--ohnix-text-muted)]">
                        {t("profile.no_sessions")}
                    </Text>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((session) => {
                            const Icon = DEVICE_ICONS[session.deviceClass] || GlobalOutlined;
                            return (
                                <div
                                    key={session.id}
                                    className="bg-[var(--ohnix-line-1)] rounded-2xl border border-[var(--ohnix-line-4)] p-4 sm:p-5 flex items-center gap-4"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] flex items-center justify-center flex-shrink-0">
                                        <Icon className="text-[var(--ohnix-text-muted)] text-lg" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Text className="text-sm font-semibold text-[var(--ohnix-text-primary)] truncate">
                                                {t(`profile.device_class_${session.deviceClass}`)}
                                            </Text>
                                            {session.isCurrent && (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                                                    <CheckCircleFilled className="text-[10px]" />
                                                    {t("profile.current_session")}
                                                </span>
                                            )}
                                        </div>
                                        <Text className="text-xs text-[var(--ohnix-text-muted)] block truncate mt-0.5">
                                            {session.deviceLabel || t("profile.unknown_device")}
                                        </Text>
                                        <Text className="text-xs text-[var(--ohnix-text-soft)] block mt-0.5">
                                            {t("profile.last_active")}: {dayjs(session.lastSeenAt).format("YYYY-MM-DD HH:mm")}
                                        </Text>
                                    </div>
                                    {!session.isCurrent && (
                                        <Popconfirm
                                            title={t("profile.revoke_session_confirm_title")}
                                            description={t("profile.revoke_session_confirm_content")}
                                            okText={t("common.yes")}
                                            cancelText={t("common.no")}
                                            onConfirm={() => handleRevoke(session.id)}
                                        >
                                            <Button
                                                size="small"
                                                danger
                                                icon={<LogoutOutlined />}
                                                loading={revokingId === session.id}
                                            >
                                                {t("profile.revoke_session")}
                                            </Button>
                                        </Popconfirm>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SessionsTab;
