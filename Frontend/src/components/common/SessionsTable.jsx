import React, { useMemo, useState } from "react";
import { Table, Button, Input, Tag, Popconfirm, Card, Empty, Avatar, Typography } from "antd";
import { SearchOutlined, UserOutlined, DesktopOutlined, MobileOutlined, GlobalOutlined, LogoutOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const tableShellClass = "rounded-xl shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)]";

const DEVICE_ICONS = {
    desktop: DesktopOutlined,
    mobile: MobileOutlined,
    web: GlobalOutlined,
};

const DeviceCell = ({ session, t }) => {
    const Icon = DEVICE_ICONS[session.deviceClass] || GlobalOutlined;
    return (
        <div className="flex items-center gap-2">
            <Icon className="text-[var(--ohnix-text-muted)]" />
            <div className="min-w-0">
                <div className="text-sm text-[var(--ohnix-text-primary)]">
                    {t(`profile.device_class_${session.deviceClass}`)}
                </div>
                <div className="text-xs text-[var(--ohnix-text-muted)] truncate max-w-[220px]">
                    {session.deviceLabel || t("profile.unknown_device")}
                </div>
            </div>
        </div>
    );
};

const MobileSessionCard = ({ session, onRevoke, revokingId, showCompany, t }) => (
    <Card className="mb-4 module-shell overflow-hidden hover-lift" styles={{ body: { padding: 16 } }}>
        <div className="flex items-start gap-3">
            <Avatar size={40} icon={<UserOutlined />} className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">
                    {session.user?.username || t("common.na")}
                </div>
                <div className="truncate text-xs text-[var(--ohnix-text-muted)]">{session.user?.email}</div>
                {showCompany && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Tag>{session.user?.company?.name || t("admin.company_filter_unassigned")}</Tag>
                    </div>
                )}
                <div className="mt-2">
                    <DeviceCell session={session} t={t} />
                </div>
                <Text className="text-xs text-[var(--ohnix-text-soft)] block mt-2">
                    {t("profile.last_active")}: {dayjs(session.lastSeenAt).format("YYYY-MM-DD HH:mm")}
                </Text>
                <Popconfirm
                    title={t("profile.revoke_session_confirm_title")}
                    description={t("profile.revoke_session_confirm_content")}
                    okText={t("common.yes")}
                    cancelText={t("common.no")}
                    onConfirm={() => onRevoke(session)}
                >
                    <Button className="mt-3" size="small" danger icon={<LogoutOutlined />} loading={revokingId === session.id}>
                        {t("profile.revoke_session")}
                    </Button>
                </Popconfirm>
            </div>
        </div>
    </Card>
);

// The full device list behind both the platform admin's "Sesiones" tab
// (every session, every user/company) and the team owner's "Sesiones" tab
// (every session, but only this team's active members) - same table, the
// only difference being whether a company column makes sense and which
// service call `onRevoke` ends up making. Fetched/refreshed by the parent
// (AdminManagement / Team) alongside whatever else it loads, so a revoke
// here can drop the row immediately without a second round trip.
const SessionsTable = ({ sessions, loading, onRevoke, showCompany = true }) => {
    const { t } = useI18n();
    const [search, setSearch] = useState("");
    const [revokingId, setRevokingId] = useState(null);

    const filteredSessions = useMemo(() => {
        if (!search.trim()) return sessions;
        const needle = search.trim().toLowerCase();
        return sessions.filter((session) =>
            [session.user?.username, session.user?.email, session.user?.company?.name, session.deviceLabel]
                .filter(Boolean)
                .some((field) => field.toLowerCase().includes(needle))
        );
    }, [sessions, search]);

    const handleRevoke = async (session) => {
        setRevokingId(session.id);
        try {
            await onRevoke(session);
        } finally {
            setRevokingId(null);
        }
    };

    const columns = [
        {
            title: t("common.username"),
            key: "user",
            render: (_, record) => (
                <div className="flex items-center gap-3">
                    <Avatar size={36} icon={<UserOutlined />} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">
                            {record.user?.username || t("common.na")}
                        </div>
                        <div className="truncate text-xs text-[var(--ohnix-text-muted)]">{record.user?.email}</div>
                    </div>
                </div>
            ),
        },
        ...(showCompany
            ? [
                  {
                      title: t("admin.company_field"),
                      key: "company",
                      responsive: ["md"],
                      render: (_, record) => <Tag>{record.user?.company?.name || t("admin.company_filter_unassigned")}</Tag>,
                  },
              ]
            : []),
        {
            title: t("team.col_member"),
            key: "device",
            render: (_, record) => <DeviceCell session={record} t={t} />,
        },
        {
            title: t("profile.last_active"),
            key: "lastSeenAt",
            responsive: ["sm"],
            render: (_, record) => (
                <span className="text-xs text-[var(--ohnix-text-muted)]">
                    {dayjs(record.lastSeenAt).format("YYYY-MM-DD HH:mm")}
                </span>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: 140,
            fixed: "right",
            render: (_, record) => (
                <Popconfirm
                    title={t("profile.revoke_session_confirm_title")}
                    description={t("profile.revoke_session_confirm_content")}
                    okText={t("common.yes")}
                    cancelText={t("common.no")}
                    onConfirm={() => handleRevoke(record)}
                >
                    <Button size="small" danger icon={<LogoutOutlined />} loading={revokingId === record.id}>
                        {t("profile.revoke_session")}
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                    placeholder={t("admin.search_sessions_placeholder")}
                    prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                    size="large"
                    allowClear
                />
                <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0] w-fit">
                    {t("admin.sessions_total", { count: filteredSessions.length })}
                </Tag>
            </div>

            {/* Mobile/tablet card list */}
            <div className="block lg:hidden">
                {loading ? (
                    [1, 2, 3].map((i) => <Card key={i} loading className="mb-4 module-shell" />)
                ) : filteredSessions.length === 0 ? (
                    <Empty description={t("profile.no_sessions")} />
                ) : (
                    filteredSessions.map((session) => (
                        <MobileSessionCard
                            key={session.id}
                            session={session}
                            onRevoke={handleRevoke}
                            revokingId={revokingId}
                            showCompany={showCompany}
                            t={t}
                        />
                    ))
                )}
            </div>

            {/* Desktop */}
            <div className={`hidden lg:block ${tableShellClass}`}>
                <Table
                    columns={columns}
                    dataSource={filteredSessions}
                    rowKey="id"
                    loading={loading}
                    locale={{ emptyText: t("profile.no_sessions") }}
                    scroll={{ x: showCompany ? 900 : 700 }}
                    className="custom-table module-dark-table"
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ["10", "25", "50"],
                        showTotal: (total) => t("admin.sessions_total", { count: total }),
                    }}
                />
            </div>
        </div>
    );
};

export default SessionsTable;
