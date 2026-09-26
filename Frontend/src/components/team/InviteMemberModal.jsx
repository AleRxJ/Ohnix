import React, { useState } from "react";
import { Modal, Form, Input, Select, Tag } from "antd";
import { UserAddOutlined, MailOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import usePermissionCatalog from "../../hooks/usePermissionCatalog";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid rgba(41,216,213,0.18)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(41,216,213,0.06)",
        borderRadius: "28px",
    },
    header: { background: "transparent", borderBottom: "none", padding: "28px 28px 0" },
    body: { padding: "16px 28px 28px" },
    footer: { padding: "0 28px 24px" },
};

const InviteMemberModal = ({ open, onCancel, onSubmit, submitting, form, roles }) => {
    const { t } = useI18n();
    const [selectedRoleId, setSelectedRoleId] = useState(null);
    const { moduleKeys } = usePermissionCatalog();
    const selectedRole = (roles || []).find((r) => r.id === selectedRoleId);
    const grantedModules = (selectedRole?.permissions || []).filter(
        (p) => p.level !== "none" && moduleKeys.includes(p.moduleKey)
    );

    const handleCancel = () => {
        setSelectedRoleId(null);
        onCancel();
    };

    return (
        <Modal
            title={null}
            open={open}
            onCancel={handleCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("team.invite_cta")}
            cancelText={t("common.cancel")}
            okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
            cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
            destroyOnClose
            afterClose={() => setSelectedRoleId(null)}
            styles={darkModalStyles}
        >
            <div className="mb-6 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))] shadow-[0_0_24px_rgba(41,216,213,0.18)]">
                    <UserAddOutlined className="text-2xl text-[#44F3F0]" />
                </div>
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--ohnix-text-muted)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#44F3F0] shadow-[0_0_10px_rgba(68,243,240,0.9)]" />
                        {t("team.tab_members")}
                    </div>
                    <h3 className="mt-2 text-xl font-bold text-[var(--ohnix-text-primary)]">{t("team.invite_modal_title")}</h3>
                </div>
            </div>

            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item
                    name="email"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("team.invite_email_label")}</span>}
                    rules={[
                        { required: true, message: t("validation.required_field") },
                        { type: "email", message: t("validation.invalid_email") },
                    ]}
                >
                    <Input
                        size="large"
                        className="auth-ohnix-input"
                        prefix={<MailOutlined className="text-slate-400" />}
                        placeholder={t("team.invite_email_placeholder")}
                    />
                </Form.Item>
                <Form.Item
                    name="roleId"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("team.invite_role_label")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Select
                        size="large"
                        options={(roles || []).map((r) => ({ value: r.id, label: r.name }))}
                        onChange={setSelectedRoleId}
                    />
                </Form.Item>

                {selectedRole && (
                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-dim)]">
                            {t("team.roles_description")}
                        </p>
                        {grantedModules.length === 0 ? (
                            <span className="text-sm text-[var(--ohnix-text-dim)]">{t("team.permission_none")}</span>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {grantedModules.map((p) => (
                                    <Tag key={p.moduleKey} className="border-[#29D8D5]/20 bg-[#29D8D5]/8 text-[#CFE8E8] text-[11px]">
                                        {t(`team.module_${p.moduleKey}`)}: {t(`team.permission_${p.level}`)}
                                    </Tag>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Form>
        </Modal>
    );
};

export default InviteMemberModal;
