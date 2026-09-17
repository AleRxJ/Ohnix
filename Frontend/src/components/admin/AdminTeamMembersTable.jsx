import React from "react";
import { Table, Avatar, Tag, Select, Popconfirm, Button, Card } from "antd";
import { UserOutlined, DeleteOutlined, ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";
import RolePermissionTags from "../team/RolePermissionTags";

const avatarSrc = (person) =>
    person?.avatar?.trim() ||
    `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(person?.username || "?")}`;

const ScopeBadge = ({ record, t }) => {
    if (record.isOwner || record.scopeAll !== false) {
        return (
            <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0] text-xs">
                {t("team.scope_all_badge")}
            </Tag>
        );
    }
    if ((record.pointsOfSale || []).length === 0) {
        return <Tag className="border-red-500/30 bg-red-500/10 text-red-300 text-xs">{t("team.scope_none")}</Tag>;
    }
    return (
        <Tag className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)] text-xs">
            {t("team.scope_count", { count: record.pointsOfSale.length })}
        </Tag>
    );
};

const MobileMemberCard = ({ record, roles, showScope, onRoleChange, onEditScope, onRemove, t }) => {
    const fullRole = roles.find((r) => r.id === record.role?.id);
    return (
        <Card className="mb-3 module-shell overflow-hidden" styles={{ body: { padding: 16 } }}>
            <div className="flex items-start gap-3">
                <Avatar src={avatarSrc(record)} icon={<UserOutlined />} size={40} className="flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">{record.username}</div>
                    <div className="truncate text-xs text-[var(--ohnix-text-muted)]">{record.email}</div>
                </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("team.col_role")}</span>
                    {record.isOwner ? (
                        <Tag className="border-amber-500/40 bg-amber-500/10 text-[var(--ohnix-alert-amber-text)]">
                            {t("team.owner_badge")}
                        </Tag>
                    ) : (
                        <Select
                            size="small"
                            value={record.role?.id}
                            style={{ minWidth: 140 }}
                            options={(roles || []).filter((r) => !r.isOwnerRole).map((r) => ({ value: r.id, label: r.name }))}
                            onChange={(value) => onRoleChange(record.userId, value)}
                        />
                    )}
                </div>
                {!record.isOwner && fullRole && <RolePermissionTags role={fullRole} t={t} />}

                {showScope && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("team.col_scope")}</span>
                        <div className="flex items-center gap-2">
                            <ScopeBadge record={record} t={t} />
                            {!record.isOwner && (
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<ShopOutlined className="text-[var(--ohnix-text-muted)]" />}
                                    onClick={() => onEditScope(record)}
                                />
                            )}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("team.col_joined")}</span>
                    <span className="text-xs text-[var(--ohnix-text-muted)]">
                        {record.joinedAt ? new Date(record.joinedAt).toLocaleDateString() : t("common.na")}
                    </span>
                </div>
            </div>

            {!record.isOwner && (
                <div className="mt-3 border-t border-[var(--ohnix-line-4)] pt-3">
                    <Popconfirm
                        title={t("team.remove_confirm_title")}
                        description={t("team.remove_confirm_content")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={() => onRemove(record.userId)}
                    >
                        <Button danger size="small" icon={<DeleteOutlined />} block>
                            {t("team.remove_member")}
                        </Button>
                    </Popconfirm>
                </div>
            )}
        </Card>
    );
};

// Cross-tenant read/write counterpart to MembersTab.jsx's table, for the
// platform admin panel - always renders in "owner-editing" mode (an admin
// can always reassign role/scope or remove a member, unlike MembersTab
// which hides those controls from a non-owner viewer) since the caller
// already passed the isAdmin gate on the backend. Switches to a card list
// on small screens (same convention as UsersTab's MobileUserCard) since the
// row's inline Select/buttons make a horizontally-scrolled table unusable
// on a phone.
const AdminTeamMembersTable = ({ members, roles, pointsOfSale, loading, onRoleChange, onEditScope, onRemove }) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const showScope = pointsOfSale.length > 1;

    if (isMobile) {
        return (
            <div>
                {members.map((record) => (
                    <MobileMemberCard
                        key={record.userId}
                        record={record}
                        roles={roles}
                        showScope={showScope}
                        onRoleChange={onRoleChange}
                        onEditScope={onEditScope}
                        onRemove={onRemove}
                        t={t}
                    />
                ))}
            </div>
        );
    }

    const columns = [
        {
            title: t("team.col_member"),
            key: "member",
            render: (_, record) => (
                <div className="flex items-center gap-3">
                    <Avatar src={avatarSrc(record)} icon={<UserOutlined />} />
                    <div>
                        <div className="text-[var(--ohnix-text-primary)] font-medium">{record.username}</div>
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{record.email}</div>
                    </div>
                </div>
            ),
        },
        {
            title: t("team.col_role"),
            key: "role",
            render: (_, record) => {
                if (record.isOwner) {
                    return (
                        <Tag className="border-amber-500/40 bg-amber-500/10 text-[var(--ohnix-alert-amber-text)]">
                            {t("team.owner_badge")}
                        </Tag>
                    );
                }
                const fullRole = roles.find((r) => r.id === record.role?.id);
                return (
                    <div>
                        <Select
                            size="small"
                            value={record.role?.id}
                            style={{ minWidth: 140 }}
                            options={(roles || []).filter((r) => !r.isOwnerRole).map((r) => ({ value: r.id, label: r.name }))}
                            onChange={(value) => onRoleChange(record.userId, value)}
                        />
                        {fullRole && <RolePermissionTags role={fullRole} t={t} />}
                    </div>
                );
            },
        },
        ...(showScope
            ? [
                  {
                      title: t("team.col_scope"),
                      key: "scope",
                      render: (_, record) => (
                          <div className="flex items-center gap-2">
                              <ScopeBadge record={record} t={t} />
                              {!record.isOwner && (
                                  <Button
                                      size="small"
                                      type="text"
                                      icon={<ShopOutlined className="text-[var(--ohnix-text-muted)]" />}
                                      title={t("team.edit_scope")}
                                      onClick={() => onEditScope(record)}
                                  />
                              )}
                          </div>
                      ),
                  },
              ]
            : []),
        {
            title: t("team.col_joined"),
            key: "joinedAt",
            render: (_, record) => (
                <span className="text-[var(--ohnix-text-muted)] text-sm">
                    {record.joinedAt ? new Date(record.joinedAt).toLocaleDateString() : t("common.na")}
                </span>
            ),
        },
        {
            title: t("team.col_actions"),
            key: "actions",
            render: (_, record) =>
                record.isOwner ? null : (
                    <Popconfirm
                        title={t("team.remove_confirm_title")}
                        description={t("team.remove_confirm_content")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={() => onRemove(record.userId)}
                    >
                        <Button danger size="small" icon={<DeleteOutlined />}>
                            {t("team.remove_member")}
                        </Button>
                    </Popconfirm>
                ),
        },
    ];

    return (
        <Table
            className="module-dark-table"
            rowKey="userId"
            columns={columns}
            dataSource={members}
            loading={loading}
            pagination={false}
            scroll={{ x: "max-content" }}
        />
    );
};

export default AdminTeamMembersTable;
