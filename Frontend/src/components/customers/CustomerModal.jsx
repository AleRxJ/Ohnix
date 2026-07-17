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
