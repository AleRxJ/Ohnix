import React from "react";
import {
    Modal,
    Button,
    Avatar,
    Tag,
    Space,
    Typography,
    Row,
    Col,
    Divider,
} from "antd";
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
            regular: "blue",
            wholesale: "green",
            retail: "orange",
        };
        return colors[type] || "blue";
    };

    const InfoItem = ({ icon, label, value, copyable = false }) => {
        if (!value) return null;

        return (
            <div className="flex items-start space-x-3 py-3">
                <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        {React.cloneElement(icon, {
                            className: "text-sm text-gray-600",
                        })}
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-500 mb-1">
                        {label}
                    </div>
                    <div className="text-base text-gray-900">
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
                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button size="large" onClick={onCancel}>
                        {t("common.close")}
                    </Button>
                    <Button
                        type="primary"
                        size="large"
                        icon={<EditOutlined />}
                        onClick={() => {
                            onCancel();
                            onEdit(customer);
                        }}
                        className="min-w-32"
                    >
                        {t("customers.edit_customer")}
                    </Button>
                </div>
            }
            width={700}
            className="customer-view-modal"
        >
            <div className="px-6 py-6">
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
                        className="shadow-lg mb-4 border-4 border-white"
                        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                    />
                    <Title level={2} className="mb-2 text-gray-900">
                        {customer.name}
                    </Title>
                    <Tag
                        color={getTypeColor(customer.type)}
                        className="text-sm px-4 py-1 rounded-full font-medium"
                    >
                        {t("customers.customer_tag", { type: customer.type?.toUpperCase() })}
                    </Tag>
                </div>

                <Row gutter={[32, 0]}>
                    {/* Contact Information */}
                    <Col xs={24} md={12}>
                        <div className="mb-6">
                            <Title
                                level={4}
                                className="text-gray-800 mb-4 flex items-center"
                            >
                                <MailOutlined className="mr-2 text-blue-600" />
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
                                    className="text-gray-800 mb-4 flex items-center"
                                >
                                    <ShopOutlined className="mr-2 text-purple-600" />
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
                                    <div className="text-gray-400 mb-2">
                                        <ShopOutlined className="text-3xl" />
                                    </div>
                                    <Text className="text-gray-500">
                                        {t("customers.no_business_information")}
                                    </Text>
                                </div>
                            )}
                    </Col>
                </Row>
            </div>

            <style jsx>{`
                .customer-view-modal .ant-modal-body {
                    padding: 0;
                }
                .customer-view-modal .ant-modal-footer {
                    border-top: none;
                    padding: 0 24px 24px 24px;
                }
            `}</style>
        </Modal>
    );
};

export default CustomerViewModal;
