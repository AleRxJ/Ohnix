import React from "react";
import { Table, Avatar, Tag, Select, Popconfirm, Button } from "antd";
import { UserOutlined, DeleteOutlined, ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import RolePermissionTags from "../team/RolePermissionTags";

const avatarSrc = (person) =>
    person?.avatar?.trim() ||
    `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(person?.username || "?")}`;

// Cross-tenant read/write counterpart to MembersTab.jsx's table, for the
// platform admin panel - always renders in "owner-editing" mode (an admin
// can always reassign role/scope or remove a member, unlike MembersTab
// which hides those controls from a non-owner viewer) since the caller
// already passed the isAdmin gate on the backend.
const AdminTeamMembersTable = ({ members, roles, pointsOfSale, loading, onRoleChange, onEditScope, onRemove }) => {
    const { t } = useI18n();

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
        ...(pointsOfSale.length > 1
            ? [
                  {
                      title: t("team.col_scope"),
                      key: "scope",
                      render: (_, record) => {
                          if (record.isOwner) {
                              return (
                                  <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0] text-xs">
                                      {t("team.scope_all_badge")}
                                  </Tag>
                              );
                          }
                          const badge =
                              record.scopeAll !== false ? (
                                  <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0] text-xs">
                                      {t("team.scope_all_badge")}
                                  </Tag>
                              ) : (record.pointsOfSale || []).length === 0 ? (
                                  <Tag className="border-red-500/30 bg-red-500/10 text-red-300 text-xs">
                                      {t("team.scope_none")}
                                  </Tag>
                              ) : (
                                  <Tag className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)] text-xs">
                                      {t("team.scope_count", { count: record.pointsOfSale.length })}
                                  </Tag>
                              );
                          return (
                              <div className="flex items-center gap-2">
                                  {badge}
                                  <Button
                                      size="small"
                                      type="text"
                                      icon={<ShopOutlined className="text-[var(--ohnix-text-muted)]" />}
                                      title={t("team.edit_scope")}
                                      onClick={() => onEditScope(record)}
                                  />
                              </div>
                          );
                      },
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
