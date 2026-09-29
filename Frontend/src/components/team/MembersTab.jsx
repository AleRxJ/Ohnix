import React, { useCallback, useContext, useEffect, useState } from "react";
import { Button, Table, Avatar, Tag, Select, Popconfirm, Form, Empty } from "antd";
import { PlusOutlined, UserOutlined, DeleteOutlined, MailOutlined, ReloadOutlined, SettingOutlined, SafetyCertificateOutlined, ShopOutlined, DesktopOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";
import { pointOfSaleService } from "../../services/pointOfSaleService";
import useSubscription, { TEAM_SEAT_LIMITS } from "../../hooks/useSubscription";
import InviteMemberModal from "./InviteMemberModal";
import RoleFormModal from "./RoleFormModal";
import RolePermissionTags from "./RolePermissionTags";
import MemberScopeModal from "./MemberScopeModal";
import SessionsModal from "../common/SessionsModal";

const avatarSrc = (person) =>
    person?.avatar?.trim() ||
    `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(person?.username || "?")}`;

const MembersTab = ({ roles, onRolesChanged, onMembersChanged }) => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team, isOwner, hasPermission, refreshTeam } = useTeam();
    // Owner, or a co-administrador via the "team" module (hasPermission is
    // always true for the owner). The backend (teamDelegation.service.js)
    // still refuses anything above the manager's own role.
    const canViewTeam = hasPermission("team", "view");
    const canManageMembers = hasPermission("team", "edit");
    const canManageRoles = hasPermission("team", "admin");
    // A co-administrador can't change their own access.
    const canActOn = (record) => isOwner || record.userId !== user?.id;
    const { plan } = useSubscription();

    const [members, setMembers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteSubmitting, setInviteSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [permissionsRole, setPermissionsRole] = useState(null);
    const [permissionsSubmitting, setPermissionsSubmitting] = useState(false);
    const [permissionsForm] = Form.useForm();
    const [forkingFor, setForkingFor] = useState(null);
    const [permissionsSharedCount, setPermissionsSharedCount] = useState(0);
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [scopeModalFor, setScopeModalFor] = useState(null);
    const [scopeSubmitting, setScopeSubmitting] = useState(false);
    const [sessionsModalFor, setSessionsModalFor] = useState(null);

    useEffect(() => {
        pointOfSaleService
            .list()
            .then((res) => setPointsOfSale((res?.data || []).filter((pos) => pos.isActive)))
            .catch(() => {});
    }, []);

    const load = useCallback(async () => {
        if (!team) return;
        setLoading(true);
        try {
            const [membersRes, invitationsRes] = await Promise.all([
                teamService.getMembers(team.id),
                canViewTeam ? teamService.getInvitations(team.id) : Promise.resolve({ data: [] }),
            ]);
            setMembers(membersRes?.data || []);
            setInvitations((invitationsRes?.data || []).filter((i) => i.status === "pending"));
            onMembersChanged?.();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    }, [team, canViewTeam, t]);

    useEffect(() => {
        load();
    }, [load]);

    const seatLimit = TEAM_SEAT_LIMITS[plan] ?? null;
    const seatsUsed = members.length + invitations.length;

    const handleInvite = async (values) => {
        setInviteSubmitting(true);
        try {
            await teamService.createInvitation(team.id, values);
            toast.success(t("team.invitation_sent"));
            setInviteOpen(false);
            form.resetFields();
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setInviteSubmitting(false);
        }
    };

    const handleRoleChange = async (userId, roleId) => {
        try {
            await teamService.changeMemberRole(team.id, userId, roleId);
            toast.success(t("team.member_role_updated"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    const handleRemove = async (userId) => {
        try {
            await teamService.removeMember(team.id, userId);
            toast.success(t("team.member_removed"));
            load();
            refreshTeam();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    const handleSaveScope = async ({ scopeAll, pointOfSaleIds }) => {
        setScopeSubmitting(true);
        try {
            await pointOfSaleService.setMemberScope(team.id, scopeModalFor.userId, { scopeAll, pointOfSaleIds });
            toast.success(t("team.scope_updated"));
            setScopeModalFor(null);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setScopeSubmitting(false);
        }
    };

    const handleResend = async (invitationId) => {
        try {
            await teamService.resendInvitation(team.id, invitationId);
            toast.success(t("team.invitation_resent"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    const handleRevoke = async (invitationId) => {
        try {
            await teamService.revokeInvitation(team.id, invitationId);
            toast.success(t("team.invitation_revoked"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    // Roles are shared by design (that's what makes "assign the same role to
    // 5 people" useful) - but editing permissions from a specific member's
    // row reads as "change what THIS person can do", not "change what
    // everyone on this role can do". If the role is only used by this one
    // member, editing in place is safe. If others share it, fork a private
    // copy first so this edit can't silently change their access too - this
    // is the fix for "editing one member edited everyone" (root cause: they
    // were all on the same shared "Miembro" role).
    const handleOpenPermissions = (record, fullRole) => {
        const sharedCount = members.filter((m) => !m.isOwner && m.role?.id === fullRole.id).length;
        setForkingFor(sharedCount > 1 ? record : null);
        setPermissionsSharedCount(sharedCount);
        setPermissionsRole(fullRole);
    };

    const handleSavePermissions = async (values) => {
        setPermissionsSubmitting(true);
        try {
            if (forkingFor) {
                const forkedName = `${permissionsRole.name} — ${forkingFor.username}`;
                const forked = await teamService.createRole(team.id, { name: forkedName, permissions: values.permissions, capabilities: values.capabilities });
                await teamService.changeMemberRole(team.id, forkingFor.userId, forked.data.id);
                toast.success(t("team.role_forked", { name: forkingFor.username }));
                load();
            } else {
                await teamService.updateRole(team.id, permissionsRole.id, values);
                toast.success(t("team.role_updated"));
            }
            setPermissionsRole(null);
            setForkingFor(null);
            permissionsForm.resetFields();
            onRolesChanged?.();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setPermissionsSubmitting(false);
        }
    };

    const columns = [
        {
            title: t("team.col_member"),
            key: "member",
            render: (_, record) => (
                <div className="flex items-center gap-3">
                    <Avatar src={avatarSrc(record)} icon={<UserOutlined />} />
                    <div>
                        <div className="text-[var(--ohnix-text-primary)] font-medium flex items-center gap-2">
                            {record.username}
                            {record.userId === user?.id && (
                                <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0] text-[10px]">
                                    {t("team.you_badge")}
                                </Tag>
                            )}
                        </div>
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
                    return <Tag className="border-amber-500/40 bg-amber-500/10 text-[var(--ohnix-alert-amber-text)]">{t("team.owner_badge")}</Tag>;
                }
                const fullRole = roles.find((r) => r.id === record.role?.id);
                return (
                    <div>
                        <div className="flex items-center gap-2">
                            {canManageMembers && canActOn(record) ? (
                                <Select
                                    size="small"
                                    value={record.role?.id}
                                    style={{ minWidth: 140 }}
                                    options={(roles || []).filter((r) => !r.isOwnerRole).map((r) => ({ value: r.id, label: r.name }))}
                                    onChange={(value) => handleRoleChange(record.userId, value)}
                                />
                            ) : (
                                <span className="text-[var(--ohnix-text-primary)]">{record.role?.name}</span>
                            )}
                            {canManageRoles && fullRole && canActOn(record) && (
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<SettingOutlined className="text-[var(--ohnix-text-muted)]" />}
                                    title={t("team.edit_role")}
                                    onClick={() => handleOpenPermissions(record, fullRole)}
                                />
                            )}
                        </div>
                        {fullRole && <RolePermissionTags role={fullRole} t={t} />}
                    </div>
                );
            },
        },
        // Only meaningful once the account actually has more than one
        // active location - with just one, every member's scope is
        // trivially "all of it" (see pos.permissions.js), so the column
        // would just repeat the same badge on every row for nothing.
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
                                  {canManageMembers && canActOn(record) && (
                                      <Button
                                          size="small"
                                          type="text"
                                          icon={<ShopOutlined className="text-[var(--ohnix-text-muted)]" />}
                                          title={t("team.edit_scope")}
                                          onClick={() => setScopeModalFor(record)}
                                      />
                                  )}
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
        ...(canManageMembers
            ? [
                  {
                      title: t("team.col_actions"),
                      key: "actions",
                      render: (_, record) =>
                          record.isOwner || !canActOn(record) ? null : (
                              <div className="flex items-center gap-1">
                                  <Button
                                      size="small"
                                      type="text"
                                      icon={<DesktopOutlined className="text-[var(--ohnix-text-muted)]" />}
                                      title={t("team.view_sessions")}
                                      onClick={() => setSessionsModalFor(record)}
                                  />
                                  <Popconfirm
                                      title={t("team.remove_confirm_title")}
                                      description={t("team.remove_confirm_content")}
                                      okText={t("common.yes")}
                                      cancelText={t("common.no")}
                                      onConfirm={() => handleRemove(record.userId)}
                                  >
                                      <Button danger size="small" icon={<DeleteOutlined />}>
                                          {t("team.remove_member")}
                                      </Button>
                                  </Popconfirm>
                              </div>
                          ),
                  },
              ]
            : []),
    ];

    return (
        <div>
            {canManageMembers && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#29D8D5]/25 bg-[#29D8D5]/[0.06] px-4 py-3">
                    <SafetyCertificateOutlined className="mt-0.5 text-[#44F3F0]" />
                    <p className="m-0 text-xs leading-relaxed text-[#CFE8E8]">
                        {t("team.permissions_hint")}
                    </p>
                </div>
            )}

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-1.5 text-sm text-[var(--ohnix-text-muted)] w-fit">
                    <UserOutlined className="text-[#44F3F0]" />
                    {seatLimit === null
                        ? t("team.seats_unlimited", { used: seatsUsed })
                        : t("team.seats_used", { used: seatsUsed, limit: seatLimit })}
                </div>
                {canManageMembers && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setInviteOpen(true)}
                        className="hover:shadow-[0_0_26px_rgba(41,216,213,0.18)]"
                    >
                        {t("team.invite_member")}
                    </Button>
                )}
            </div>

            <Table
                className="module-dark-table"
                rowKey="userId"
                columns={columns}
                dataSource={members}
                loading={loading}
                pagination={false}
                scroll={{ x: "max-content" }}
            />

            {canViewTeam && (
                <div className="mt-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--ohnix-text-muted)]">
                        {t("team.status_pending")}
                    </h3>
                    {invitations.length === 0 ? (
                        <Empty description={t("team.no_pending_invitations")} />
                    ) : (
                        <div className="flex flex-col gap-2">
                            {invitations.map((inv) => (
                                <div
                                    key={inv.id}
                                    className="flex flex-col gap-2 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-center gap-2 text-sm text-[var(--ohnix-text-primary)]">
                                        <MailOutlined className="text-[#44F3F0]" />
                                        {inv.email}
                                        <Tag className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-muted)]">{inv.role?.name}</Tag>
                                    </div>
                                    {canManageMembers && (
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<ReloadOutlined />} onClick={() => handleResend(inv.id)}>
                                            {t("team.resend_invitation")}
                                        </Button>
                                        <Popconfirm
                                            title={t("team.revoke_confirm_title")}
                                            description={t("team.revoke_confirm_content")}
                                            okText={t("common.yes")}
                                            cancelText={t("common.no")}
                                            onConfirm={() => handleRevoke(inv.id)}
                                        >
                                            <Button size="small" danger>
                                                {t("team.revoke_invitation")}
                                            </Button>
                                        </Popconfirm>
                                    </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <InviteMemberModal
                open={inviteOpen}
                onCancel={() => setInviteOpen(false)}
                onSubmit={handleInvite}
                submitting={inviteSubmitting}
                form={form}
                roles={roles}
            />

            <RoleFormModal
                open={Boolean(permissionsRole)}
                onCancel={() => {
                    setPermissionsRole(null);
                    setForkingFor(null);
                }}
                onSubmit={handleSavePermissions}
                submitting={permissionsSubmitting}
                form={permissionsForm}
                editingRole={permissionsRole}
                forkNotice={forkingFor ? { count: permissionsSharedCount - 1, targetName: forkingFor.username } : null}
            />

            <MemberScopeModal
                open={Boolean(scopeModalFor)}
                onCancel={() => setScopeModalFor(null)}
                onSubmit={handleSaveScope}
                submitting={scopeSubmitting}
                member={scopeModalFor}
                pointsOfSale={pointsOfSale}
            />

            <SessionsModal
                target={sessionsModalFor}
                title={t("team.view_sessions_title", { username: sessionsModalFor?.username || "" })}
                onCancel={() => setSessionsModalFor(null)}
                fetchSessions={(member) => teamService.getMemberSessions(team.id, member.userId)}
                revokeSession={(member, sessionId) => teamService.revokeMemberSession(team.id, member.userId, sessionId)}
            />
        </div>
    );
};

export default MembersTab;
