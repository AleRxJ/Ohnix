import React from "react";
import { Modal, Form, Input, Select } from "antd";
import useI18n from "../../hooks/useI18n";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: {
        background: "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "20px 24px 16px",
    },
    body: { padding: 24 },
};

const UserFormModal = ({ open, onCancel, onSubmit, submitting, form, companyOptions }) => {
    const { t } = useI18n();

    return (
        <Modal
            title={<span className="text-lg font-bold text-white">{t("admin.add_user")}</span>}
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            destroyOnClose
            styles={darkModalStyles}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} className="mt-2">
                <Form.Item
                    name="username"
                    label={t("common.username")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item
                    name="email"
                    label={t("common.email")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input type="email" size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item
                    name="password"
                    label={t("common.password")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input.Password size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item name="role" label={t("admin.role")} initialValue="user">
                    <Select
                        size="large"
                        options={[
                            { value: "user", label: "user" },
                            { value: "admin", label: "admin" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name="companyId" label={t("admin.company_field")}>
                    <Select size="large" allowClear options={companyOptions} />
                </Form.Item>
                <Form.Item name="plan" label={t("admin.plan")} initialValue="starter">
                    <Select
                        size="large"
                        options={[
                            { value: "starter", label: "starter" },
                            { value: "growth", label: "growth" },
                            { value: "scale", label: "scale" },
                            { value: "enterprise", label: "enterprise" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name="preferredLanguage" label={t("admin.preferred_language")} initialValue="es">
                    <Select
                        size="large"
                        options={[
                            { value: "es", label: "Español" },
                            { value: "en", label: "English" },
                        ]}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default UserFormModal;
