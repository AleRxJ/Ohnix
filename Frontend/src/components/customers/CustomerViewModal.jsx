import React from "react";
import { Modal, Button, Avatar, Tag, Typography, Row, Col, Divider } from "antd";
import {
    UserOutlined,
    EditOutlined,
    MailOutlined,
    PhoneOutlined,
    HomeOutlined,
    ShopOutlined,
    BankOutlined,
    IdcardOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Title, Text } = Typography;

const CustomerViewModal = ({ visible, onCancel, customer, onEdit }) => {
    const { t } = useI18n();

    if (!customer) return null;

    const getTypeColor = (type) => {
        const colors = {
            regular: "cyan",
            wholesale: "green",
            retail: "orange",
        };
        return colors[type] || "cyan";
    };

    const InfoItem = ({ icon, label, value, copyable = false }) => {
        if (!value) return null;

        return (
            <div className="flex items-start space-x-3 py-3">
                <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full bg-[var(--ohnix-line-2)] flex items-center justify-center border border-[var(--ohnix-line-4)]">
                        {React.cloneElement(icon, {
                            className: "text-sm text-[#44F3F0]",
                        })}
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--ohnix-text-muted)] mb-1">
                        {label}
                    </div>
                    <div className="text-base text-[var(--ohnix-text-primary)]">
                        <Text copyable={copyable ? { text: value } : false}>
                            {value}
                        </Text>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Modal
            title={null}
            open={visible}
            onCancel={onCancel}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        onClick={onCancel}
                        className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                    >
                        {t("common.close")}
                    </Button>
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => {
                            onCancel();
                            onEdit(customer);
                        }}
                        className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                    >
                        {t("customers.edit_customer")}
                    </Button>
                </div>
            }
            width={700}
            className="customer-view-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                body: { padding: 0 },
            }}
        >
            <div className="px-6 py-6 text-[var(--ohnix-text-primary)]">
                {/* Header Section */}
                <div className="text-center mb-8">
                    <Avatar
                        size={120}
                        src={
                            customer.photo !== "default-customer.png"
                                ? customer.photo
                                : null
                        }
                        icon={<UserOutlined />}
                        className="shadow-lg mb-4 border-4 border-[var(--ohnix-line-4)]"
                        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                    />
                    <Title level={2} className="mb-2 !text-[var(--ohnix-text-primary)]">
                        {customer.name}
                    </Title>
                    <Tag
                        color={getTypeColor(customer.type)}
                        className="text-sm px-4 py-1 rounded-full font-medium"
                    >
                        {t("customers.customer_tag", {
                            type: (customer.type ? t(`customers.type_${customer.type}`) : "").toUpperCase(),
                        })}
                    </Tag>
                </div>

                <Row gutter={[32, 0]}>
                    {/* Contact Information */}
                    <Col xs={24} md={12}>
                        <div className="mb-6">
                            <Title
                                level={4}
                                className="!text-[var(--ohnix-text-primary)] mb-4 flex items-center"
                            >
                                <MailOutlined className="mr-2 text-[#44F3F0]" />
                                {t("customers.contact_details")}
                            </Title>
                            <div className="space-y-2">
                                <InfoItem
                                    icon={<MailOutlined />}
                                    label={t("customers.email_address")}
                                    value={customer.email}
                                    copyable
                                />
                                <InfoItem
                                    icon={<PhoneOutlined />}
                                    label={t("customers.phone_number")}
                                    value={customer.phone}
                                    copyable
                                />
                                <InfoItem
                                    icon={<HomeOutlined />}
                                    label={t("common.address")}
                                    value={customer.address}
                                />
                            </div>
                        </div>
                    </Col>

                    {/* Business Information */}
                    <Col xs={24} md={12}>
                        {(customer.store_name ||
                            customer.account_holder ||
                            customer.account_number) && (
                            <div className="mb-6">
                                <Title
                                    level={4}
                                    className="!text-[var(--ohnix-text-primary)] mb-4 flex items-center"
                                >
                                        <ShopOutlined className="mr-2 text-[#29D8D5]" />
                                    {t("customers.business_details")}
                                </Title>
                                <div className="space-y-2">
                                    <InfoItem
                                        icon={<ShopOutlined />}
                                        label={t("customers.store_name")}
                                        value={customer.store_name}
                                    />
                                    <InfoItem
                                        icon={<IdcardOutlined />}
                                        label={t("customers.account_holder")}
                                        value={customer.account_holder}
                                    />
                                    <InfoItem
                                        icon={<BankOutlined />}
                                        label={t("customers.account_number")}
                                        value={customer.account_number}
                                        copyable
                                    />
                                </div>
                            </div>
                        )}

                        {!customer.store_name &&
                            !customer.account_holder &&
                            !customer.account_number && (
                                <div className="text-center py-8">
                                    <div className="text-[var(--ohnix-text-dim)] mb-2">
                                        <ShopOutlined className="text-3xl text-[#44F3F0]" />
                                    </div>
                                    <Text className="text-[var(--ohnix-text-muted)]">
                                        {t("customers.no_business_information")}
                                    </Text>
                                </div>
                            )}
                    </Col>
                </Row>
            </div>

        </Modal>
    );
};

export default CustomerViewModal;
