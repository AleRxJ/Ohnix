import React, { useCallback, useEffect, useState } from "react";
import { Modal, Empty, Spin, Typography, Popconfirm, Button } from "antd";
import { DesktopOutlined, MobileOutlined, GlobalOutlined, LogoutOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";

const { Text } = Typography;

const DEVICE_ICONS = {
    desktop: DesktopOutlined,
    mobile: MobileOutlined,
    web: GlobalOutlined,
};

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: {
        background: "transparent",
        borderBottom: "1px solid var(--ohnix-line-3)",
        padding: "20px 24px 16px",
    },
    body: { padding: 24 },
};

// Read-only-ish view of someone ELSE's active sessions (a team owner
// checking a member's devices, or a platform admin checking any user's) -
// same device list as the self-service "Sesiones activas" tab
// (Frontend/src/components/profile/SessionsTab.jsx), minus the "this
// device" badge since the viewer is never looking at their own session
// here. `target` is whatever record identifies whose sessions these are
// (null closes the modal); `fetchSessions`/`revokeSession` are called with
// it and may be recreated by the caller on every render.
const SessionsModal = ({ target, title, onCancel, fetchSessions, revokeSession }) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState(null);

    const load = useCallback(async () => {
        if (!target) return;
        setLoading(true);
        try {
            const res = await fetchSessions(target);
            setSessions(res?.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
        // Only re-fetch when the target itself changes (a new open), not on
        // unrelated parent re-renders that recreate fetchSessions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    useEffect(() => {
        load();
    }, [load]);

    const handleRevoke = async (sessionId) => {
        setRevokingId(sessionId);
        try {
            await revokeSession(target, sessionId);
            setSessions((prev) => prev.filter((session) => session.id !== sessionId));
            toast.success(t("profile.session_revoked_toast"));
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <DesktopOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{title}</span>
                </div>
            }
            open={Boolean(target)}
            onCancel={onCancel}
            footer={null}
            width={isMobile ? "92%" : 560}
            destroyOnClose
            styles={darkModalStyles}
        >
            {loading ? (
                <div className="flex justify-center py-10">
                    <Spin />
                </div>
            ) : sessions.length === 0 ? (
                <Empty description={t("profile.no_sessions")} />
            ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto ohnix-scrollbar-thin">
                    {sessions.map((session) => {
                        const Icon = DEVICE_ICONS[session.deviceClass] || GlobalOutlined;
                        return (
                            <div
                                key={session.id}
                                className="bg-[var(--ohnix-line-1)] rounded-2xl border border-[var(--ohnix-line-4)] p-4 flex items-center gap-4"
                            >
                                <div className="w-10 h-10 rounded-xl bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] flex items-center justify-center flex-shrink-0">
                                    <Icon className="text-[var(--ohnix-text-muted)] text-lg" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <Text className="text-sm font-semibold text-[var(--ohnix-text-primary)] truncate block">
                                        {t(`profile.device_class_${session.deviceClass}`)}
                                    </Text>
                                    <Text className="text-xs text-[var(--ohnix-text-muted)] block truncate mt-0.5">
                                        {session.deviceLabel || t("profile.unknown_device")}
                                    </Text>
                                    <Text className="text-xs text-[var(--ohnix-text-soft)] block mt-0.5">
                                        {t("profile.last_active")}: {dayjs(session.lastSeenAt).format("YYYY-MM-DD HH:mm")}
                                    </Text>
                                </div>
                                <Popconfirm
                                    title={t("profile.revoke_session_confirm_title")}
                                    description={t("profile.revoke_session_confirm_content")}
                                    okText={t("common.yes")}
                                    cancelText={t("common.no")}
                                    onConfirm={() => handleRevoke(session.id)}
                                >
                                    <Button size="small" danger icon={<LogoutOutlined />} loading={revokingId === session.id}>
                                        {t("profile.revoke_session")}
                                    </Button>
                                </Popconfirm>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
};

export default SessionsModal;
