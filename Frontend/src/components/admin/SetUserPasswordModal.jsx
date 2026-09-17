import React from "react";
import { Modal, Form, Input, Alert } from "antd";
import { LockOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";

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

const SetUserPasswordModal = ({ user, onCancel, onSubmit, submitting, form }) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();

    return (
        <Modal
            width={isMobile ? "92%" : undefined}
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <LockOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("admin.set_password_title", { username: user?.username || "" })}
                    </span>
                </div>
            }
            open={Boolean(user)}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("admin.set_password_save")}
            cancelText={t("common.cancel")}
            okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
            cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
            destroyOnClose
            styles={darkModalStyles}
        >
            <Alert
                className="dark-alert dark-alert-amber mb-4"
                type="warning"
                showIcon
                message={t("admin.set_password_hint")}
            />
            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item
                    name="password"
                    label={t("admin.new_password_label")}
                    rules={[
                        { required: true, message: t("admin.new_password_required") },
                        { min: 8, message: t("admin.new_password_min_length") },
                    ]}
                >
                    <Input.Password size="large" autoComplete="new-password" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default SetUserPasswordModal;
