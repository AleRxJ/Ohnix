import React, { useContext, useEffect } from "react";
import { Modal } from "antd";
import { TeamOutlined } from "@ant-design/icons";
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
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <TeamOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {editingCustomer ? t("customers.edit_customer") : t("customers.add_new_customer")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={Math.min(900, window.innerWidth * 0.94)}
            centered
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
                body: { padding: "24px", maxHeight: "78vh", overflowY: "auto" },
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
