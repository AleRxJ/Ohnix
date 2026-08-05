import React from "react";
import { Modal, Form, Select } from "antd";
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

const AssignCompanyModal = ({ user, onCancel, onSubmit, submitting, form, companyOptions }) => {
    const { t } = useI18n();

    return (
        <Modal
            title={
                <span className="text-lg font-bold text-white">
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
            <p className="mb-4 text-sm text-[#A9B3B8]">{t("admin.assign_company_hint")}</p>
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
