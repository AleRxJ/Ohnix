import React from "react";
import { Modal, Button, Avatar, Tag, Descriptions } from "antd";
import { UserOutlined, ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const SupplierViewModal = ({ visible, onCancel, supplier, onEdit }) => {
    const { t } = useI18n();
    if (!supplier) return null;

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ShopOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("suppliers.supplier_details")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={600}
            className="supplier-view-modal"
            styles={{
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
                body: { padding: "20px 24px 24px" },
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
                        {supplier.type ? t(`suppliers.${supplier.type}`) : t("common.na")}
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

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 mt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        onClick={onCancel}
                        className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                    >
                        {t("common.close")}
                    </Button>
                    <Button
                        type="primary"
                        onClick={() => {
                            onCancel();
                            onEdit(supplier);
                        }}
                        className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                    >
                        {t("suppliers.edit_supplier")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default SupplierViewModal;
