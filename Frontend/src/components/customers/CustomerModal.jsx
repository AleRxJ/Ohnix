import React from "react";
import { Modal } from "antd";
import CustomerForm from "./CustomerForm";
import useI18n from "../../hooks/useI18n";

const CustomerModal = ({
    visible,
    onCancel,
    form,
    onSubmit,
    loading,
    fileList,
    setFileList,
    editingCustomer,
}) => {
    const { t } = useI18n();

    return (
        <Modal
            title={editingCustomer ? t("customers.edit_customer") : t("customers.add_new_customer")}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={800}
            destroyOnClose
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "24px" },
            }}
        >
            <CustomerForm
                form={form}
                onSubmit={onSubmit}
                onCancel={onCancel}
                loading={loading}
                fileList={fileList}
                setFileList={setFileList}
                editingCustomer={editingCustomer}
            />
        </Modal>
    );
};

export default CustomerModal;
