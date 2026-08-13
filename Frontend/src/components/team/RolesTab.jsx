import React, { useState } from "react";
import { Button, Tag, Popconfirm, Form } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, CrownOutlined, TeamOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";
import RoleFormModal from "./RoleFormModal";
import { VISIBLE_MODULE_KEYS } from "../../constants/teamModules";

const RolesTab = ({ roles, members = [], onRolesChanged }) => {
    const { t } = useI18n();
    const { team, isOwner } = useTeam();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm();

    const memberCountForRole = (roleId) => members.filter((m) => !m.isOwner && m.role?.id === roleId).length;

    const openCreate = () => {
        setEditingRole(null);
        setModalOpen(true);
    };

    const openEdit = (role) => {
        setEditingRole(role);
        setModalOpen(true);
    };

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            if (editingRole) {
                await teamService.updateRole(team.id, editingRole.id, values);
                toast.success(t("team.role_updated"));
            } else {
                await teamService.createRole(team.id, values);
                toast.success(t("team.role_created"));
            }
            setModalOpen(false);
            form.resetFields();
            onRolesChanged();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (role) => {
        try {
            await teamService.deleteRole(team.id, role.id);
            toast.success(t("team.role_deleted"));
            onRolesChanged();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-[var(--ohnix-text-muted)]">{t("team.roles_description")}</p>
                {isOwner && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                        {t("team.add_role")}
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(roles || []).map((role) => {
                    const memberCount = role.isOwnerRole ? 0 : memberCountForRole(role.id);
                    return (
                        <div
                            key={role.id}
                            className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {role.isOwnerRole && <CrownOutlined className="text-amber-300" />}
                                    <span className="font-semibold text-[var(--ohnix-text-primary)]">{role.name}</span>
                                    {!role.isOwnerRole && (
                                        <Tag className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-muted)] text-[10px] m-0 flex items-center gap-1">
                                            <TeamOutlined /> {memberCount}
                                        </Tag>
                                    )}
                                </div>
                                {isOwner && !role.isOwnerRole && (
                                    <div className="flex gap-1">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<EditOutlined className="text-[var(--ohnix-text-muted)]" />}
                                            onClick={() => openEdit(role)}
                                        />
                                        <Popconfirm
                                            title={t("team.delete_role_confirm_title")}
                                            description={t("team.delete_role_confirm_content")}
                                            okText={t("common.yes")}
                                            cancelText={t("common.no")}
                                            onConfirm={() => handleDelete(role)}
                                        >
                                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    </div>
                                )}
                            </div>
                            {role.isOwnerRole && (
                                <p className="mb-2 text-xs text-[var(--ohnix-text-muted)]">{t("team.role_owner_locked")}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                                {VISIBLE_MODULE_KEYS.map((moduleKey) => {
                                    const level = role.permissions?.find((p) => p.moduleKey === moduleKey)?.level ?? "none";
                                    if (level === "none") return null;
                                    return (
                                        <Tag
                                            key={moduleKey}
                                            className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-soft)] text-[11px]"
                                        >
                                            {t(`team.module_${moduleKey}`)}: {t(`team.permission_${level}`)}
                                        </Tag>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <RoleFormModal
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onSubmit={handleSubmit}
                submitting={submitting}
                form={form}
                editingRole={editingRole}
                sharedByCount={editingRole ? memberCountForRole(editingRole.id) : 0}
            />
        </div>
    );
};

export default RolesTab;
