import React, { useEffect } from "react";
import { Modal, Form, Input, Select } from "antd";
import { InfoCircleOutlined, TeamOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { VISIBLE_MODULE_KEYS, PERMISSION_LEVELS } from "../../constants/teamModules";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: { background: "transparent", borderBottom: "1px solid var(--ohnix-line-3)", padding: "20px 24px 16px" },
    body: { padding: 24 },
};

// sharedByCount: this role is edited IN PLACE and is shared by N other
// members - shown as a warning (RolesTab: editing a shared role template is
// the point of that screen, but it must not be a silent surprise).
// forkNotice: { count, targetName } - saving here will NOT touch the shared
// role; a fresh independent copy is created for targetName instead (see
// MembersTab's handleOpenPermissions). Informational, not a warning, since
// nothing shared actually changes.
const RoleFormModal = ({ open, onCancel, onSubmit, submitting, form, editingRole, sharedByCount = 0, forkNotice = null }) => {
    const { t } = useI18n();

    useEffect(() => {
        if (!open) return;
        if (editingRole) {
            const permissions = {};
            for (const perm of editingRole.permissions || []) {
                permissions[perm.moduleKey] = perm.level;
            }
            form.setFieldsValue({ name: editingRole.name, permissions });
        } else {
            const permissions = {};
            for (const key of VISIBLE_MODULE_KEYS) permissions[key] = "none";
            form.setFieldsValue({ name: "", permissions });
        }
    }, [open, editingRole, form]);

    return (
        <Modal
            title={
                <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                    {editingRole ? t("team.edit_role") : t("team.add_role")}
                </span>
            }
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            destroyOnClose
            width={560}
            styles={darkModalStyles}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} className="mt-2">
                <Form.Item
                    name="name"
                    label={t("team.role_name_label")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" placeholder={t("team.role_name_placeholder")} />
                </Form.Item>

                {forkNotice ? (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 py-2.5">
                        <TeamOutlined className="mt-0.5 text-[#44F3F0]" />
                        <p className="m-0 text-xs leading-relaxed text-[#CFE8E8]">
                            {t("team.fork_notice", { count: forkNotice.count, name: forkNotice.targetName })}
                        </p>
                    </div>
                ) : (
                    sharedByCount > 1 && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                            <TeamOutlined className="mt-0.5 text-amber-300" />
                            <p className="m-0 text-xs leading-relaxed text-amber-100">
                                {t("team.shared_role_warning", { count: sharedByCount })}
                            </p>
                        </div>
                    )
                )}

                <div className="mb-3 flex items-center gap-2 text-[11px] text-[var(--ohnix-text-dim)]">
                    <InfoCircleOutlined />
                    {t("team.dashboard_follows_reports_hint")}
                </div>

                <div className="rounded-xl border border-[var(--ohnix-line-4)] divide-y divide-[var(--ohnix-line-4)] overflow-hidden">
                    {VISIBLE_MODULE_KEYS.map((moduleKey) => (
                        <div key={moduleKey} className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--ohnix-line-1)]">
                            <span className="text-sm text-[var(--ohnix-text-primary)]">{t(`team.module_${moduleKey}`)}</span>
                            <Form.Item name={["permissions", moduleKey]} className="m-0" initialValue="none">
                                <Select
                                    size="small"
                                    style={{ width: 130 }}
                                    options={PERMISSION_LEVELS.map((level) => ({
                                        value: level,
                                        label: t(`team.permission_${level}`),
                                    }))}
                                />
                            </Form.Item>
                        </div>
                    ))}
                </div>
            </Form>
        </Modal>
    );
};

export default RoleFormModal;
