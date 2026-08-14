import React from "react";
import { Modal, Button, Avatar, Tag, Descriptions } from "antd";
import { UserOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const SupplierViewModal = ({ visible, onCancel, supplier, onEdit }) => {
    const { t } = useI18n();
    if (!supplier) return null;

    return (
        <Modal
            title={t("suppliers.supplier_details")}
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="close" onClick={onCancel}>
                    {t("common.close")}
                </Button>,
                <Button
                    key="edit"
                    type="primary"
                    onClick={() => {
                        onCancel();
                        onEdit(supplier);
                    }}
                >
                    {t("suppliers.edit_supplier")}
                </Button>,
            ]}
            width={600}
            className="supplier-view-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "20px",
                },
                header: { background: "transparent", borderBottom: "1px solid var(--ohnix-line-3)" },
            }}
        >
            <div>
                <div className="text-center mb-4">
                    <Avatar
                        size={80}
                        src={
                            supplier.photo !== "default-supplier.png"
                                ? supplier.photo
                                : null
                        }
                        icon={<UserOutlined />}
                    />
                    <h3 className="mt-2 mb-0 text-[var(--ohnix-text-primary)]">{supplier.name}</h3>
                    <Tag color={supplier.type === "company" ? "cyan" : "green"}>
                        {supplier.type?.toUpperCase() || t("common.na")}
                    </Tag>
                </div>

                <Descriptions column={1} bordered>
                    <Descriptions.Item label={t("suppliers.email")}>
                        {supplier.email}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("suppliers.phone")}>
                        {supplier.phone}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("common.address")}>
                        {supplier.address}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("suppliers.shop_name")}>
                        {supplier.shopname || t("common.dash")}
                    </Descriptions.Item>
                    {supplier.bank_name && (
                        <>
                            <Descriptions.Item label={t("suppliers.bank_name")}>
                                {supplier.bank_name}
                            </Descriptions.Item>
                            <Descriptions.Item label={t("suppliers.account_holder")}>
                                {supplier.account_holder || t("common.dash")}
                            </Descriptions.Item>
                            <Descriptions.Item label={t("suppliers.account_number")}>
                                {supplier.account_number || t("common.dash")}
                            </Descriptions.Item>
                        </>
                    )}
                    <Descriptions.Item label={t("common.created")}>
                        {new Date(supplier.createdAt).toLocaleDateString()}
                    </Descriptions.Item>
                </Descriptions>
            </div>
        </Modal>
    );
};

export default SupplierViewModal;
