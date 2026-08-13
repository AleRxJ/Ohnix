import React, { useContext, useEffect } from "react";
import { Modal } from "antd";
import CustomerForm from "./CustomerForm";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";

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
    const { user } = useContext(AuthContext);
    const { team } = useTeam();
    const { viewers, lock, acquireLock, releaseLock } = useResourcePresence({
        resourceType: "customer",
        resourceId: editingCustomer?._id,
        active: visible && Boolean(team) && Boolean(editingCustomer?._id),
    });

    useEffect(() => {
        if (visible && editingCustomer?._id && team) acquireLock();
        if (!visible) releaseLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, editingCustomer?._id]);

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
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "24px" },
            }}
        >
            {team && editingCustomer?._id && (
                <PresenceLockBar viewers={viewers} lock={lock} currentUserId={user?.id} />
            )}
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
