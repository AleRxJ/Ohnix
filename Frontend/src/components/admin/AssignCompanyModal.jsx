import React from "react";
import { Modal, Form, Select } from "antd";
import useI18n from "../../hooks/useI18n";

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

const AssignCompanyModal = ({ user, onCancel, onSubmit, submitting, form, companyOptions }) => {
    const { t } = useI18n();

    return (
        <Modal
            title={
                <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                    {t("admin.assign_company_title", { username: user?.username || t("admin.assign_company_default_user") })}
                </span>
            }
            open={Boolean(user)}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("admin.assign_company_save")}
            cancelText={t("common.cancel")}
            destroyOnClose
            styles={darkModalStyles}
        >
            <p className="mb-4 text-sm text-[var(--ohnix-text-muted)]">{t("admin.assign_company_hint")}</p>
            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item name="companyId" label={t("admin.company_field")}>
                    <Select
                        size="large"
                        allowClear
                        placeholder={t("admin.assign_company_placeholder")}
                        options={companyOptions}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default AssignCompanyModal;
