import React, { useCallback, useEffect, useState } from "react";
import { Modal, Empty, Tag } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { adminTeamService } from "../../services/adminTeamService";
import AdminTeamMembersTable from "./AdminTeamMembersTable";
import MemberScopeModal from "../team/MemberScopeModal";

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

// Given ANY user (owner or member), resolves and displays their whole team:
// owner, roster, roles, and lets the platform admin reassign a member's
// role/POS scope or remove them - reusing team.service.js's own business
// rules on the backend (see adminTeam.service.js), not reimplementing them.
const UserTeamModal = ({ user, onCancel }) => {
    const { t } = useI18n();
    const [loading, setLoading] = useState(true);
    const [context, setContext] = useState(null);
    const [scopeModalFor, setScopeModalFor] = useState(null);
    const [scopeSubmitting, setScopeSubmitting] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await adminTeamService.getTeamContext(user.id);
            setContext(res?.data || { hasTeam: false });
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    }, [user, t]);

    useEffect(() => {
        load();
    }, [load]);

    const handleRoleChange = async (memberUserId, roleId) => {
        try {
            await adminTeamService.changeMemberRole(memberUserId, roleId);
            toast.success(t("team.member_role_updated"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    const handleSaveScope = async ({ scopeAll, pointOfSaleIds }) => {
        setScopeSubmitting(true);
        try {
            await adminTeamService.changeMemberScope(scopeModalFor.userId, { scopeAll, pointOfSaleIds });
            toast.success(t("team.scope_updated"));
            setScopeModalFor(null);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setScopeSubmitting(false);
        }
    };

    const handleRemove = async (memberUserId) => {
        try {
            await adminTeamService.removeMember(memberUserId);
            toast.success(t("team.member_removed"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <TeamOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("admin.view_team_title", { username: user?.username || "" })}
                    </span>
                </div>
            }
            open={Boolean(user)}
            onCancel={onCancel}
            footer={null}
            width={800}
            destroyOnClose
            styles={darkModalStyles}
        >
            {!loading && context && !context.hasTeam ? (
                <Empty description={t("admin.team_none")} />
            ) : (
                <>
                    {context?.hasTeam && (
                        <div className="mb-4 flex items-center gap-2 text-sm text-[var(--ohnix-text-muted)]">
                            <span>{t("admin.team_name_label")}:</span>
                            <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0]">{context.team.name}</Tag>
                        </div>
                    )}
                    <AdminTeamMembersTable
                        members={context?.members || []}
                        roles={context?.roles || []}
                        pointsOfSale={context?.pointsOfSale || []}
                        loading={loading}
                        onRoleChange={handleRoleChange}
                        onEditScope={setScopeModalFor}
                        onRemove={handleRemove}
                    />
                </>
            )}

            <MemberScopeModal
                open={Boolean(scopeModalFor)}
                onCancel={() => setScopeModalFor(null)}
                onSubmit={handleSaveScope}
                submitting={scopeSubmitting}
                member={scopeModalFor}
                pointsOfSale={context?.pointsOfSale || []}
            />
        </Modal>
    );
};

export default UserTeamModal;
