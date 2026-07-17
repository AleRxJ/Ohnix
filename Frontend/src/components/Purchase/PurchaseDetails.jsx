import React from "react";
import {
    Modal,
    Table,
    Descriptions,
    Divider,
    Tag,
    Typography,
    Card,
    Space,
} from "antd";
import dayjs from "dayjs";
import { getStatusColor } from "../../utils/purchaseUtils";
import { getStatusIconPurchase } from "../../data";
import useI18n from "../../hooks/useI18n";

const { Text, Title } = Typography;

const PurchaseDetails = ({ visible, onCancel, purchase, details }) => {
    const { t } = useI18n();
    const detailColumns = [
        {
            title: t("products.product"),
            dataIndex: ["product_id", "product_name"],
            key: "product_name",
            render: (_, record) => (
                <div className="font-medium text-gray-900">
                    {record.product_id?.product_name || t("common.na")}
                </div>
            ),
            width: 200,
            ellipsis: true,
        },
        {
            title: t("products.product_code"),
            dataIndex: ["product_id", "product_code"],
            key: "product_code",
            render: (_, record) => (
                <Text code className="text-xs">
                    {record.product_id?.product_code || t("common.na")}
                </Text>
            ),
            width: 120,
        },
        {
            title: t("common.quantity"),
            dataIndex: "quantity",
            key: "quantity",
            render: (quantity) => (
                <div className="text-center font-medium text-blue-600">
                    {quantity}
                </div>
            ),
            width: 100,
            align: "center",
        },
        {
            title: t("purchases.unit_price"),
            dataIndex: "unitcost",
            key: "unitcost",
            render: (cost) => (
                <div className="font-medium text-green-600">
                    ₹{cost.toFixed(2)}
                </div>
            ),
            width: 120,
            align: "right",
        },
        {
            title: t("common.total"),
            dataIndex: "total",
            key: "total",
            render: (total) => (
                <div className="font-semibold text-gray-900">
                    ₹{total.toFixed(2)}
                </div>
            ),
            width: 120,
            align: "right",
        },
        {
            title: t("purchases.return_status"),
            key: "return_status",
            render: (_, record) => {
                if (record.return_processed) {
                    return (
                        <Space
                            direction="vertical"
                            size="small"
                            className="w-full"
                        >
                            <Tag color="red" className="font-medium">{t("purchases.returned")}</Tag>
                            <div className="text-xs text-gray-500 space-y-1">
                                <div>
                                    {t("purchases.qty")}:{" "}
                                    <span className="font-medium">{record.returned_quantity || 0}</span>
                                </div>
                                <div>
                                    {t("purchases.refund")}:{" "}
                                    <span className="font-medium text-red-600">₹{(record.refund_amount || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </Space>
                    );
                }
                return <Tag color="default">{t("purchases.not_returned")}</Tag>;
            },
            width: 140,
        },
    ];

    return (
        <Modal
            title={
                <div className="flex items-center space-x-2">
                    <Title level={4} className="mb-0">{t("purchases.purchase_details")}</Title>
                    <Tag color="blue" className="text-sm">{purchase?.purchase_no}</Tag>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width="95%"
            style={{ maxWidth: 1200 }}
            className="purchase-details-modal"
        >
            {purchase && (
                <Card className="mb-6 border-0 shadow-sm">
                    <Descriptions
                        column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
                        bordered
                        size="small"
                        className="purchase-info"
                    >
                        <Descriptions.Item label={t("purchases.purchase_number")}>
                            <Text strong className="text-blue-600">{purchase.purchase_no}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.supplier")}>
                            <Text strong className="text-gray-900">{purchase.supplier_id?.name}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.purchase_date")}>
                            <Text className="text-gray-700">{dayjs(purchase.purchase_date).format("DD/MM/YYYY")}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.status")}>
                            <Tag
                                color={getStatusColor(purchase.purchase_status)}
                                icon={getStatusIconPurchase(
                                    purchase.purchase_status
                                )}
                                className="font-medium"
                            >
                                {purchase.purchase_status.toUpperCase()}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.created_by")}>
                            <Text className="text-gray-700">{purchase.created_by?.username}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.created_at")}>
                            <Text className="text-gray-700">{dayjs(purchase.createdAt).format("DD/MM/YYYY HH:mm")}</Text>
                        </Descriptions.Item>
                    </Descriptions>
                </Card>
            )}

            <Divider orientation="left" className="text-lg font-semibold text-gray-800">{t("purchases.purchase_items")}</Divider>

            <Table
                columns={detailColumns}
                dataSource={details}
                rowKey="_id"
                pagination={false}
                scroll={{ x: 800 }}
                size="small"
                className="purchase-items-table"
                rowClassName="hover:bg-blue-50 transition-colors duration-200"
                summary={(pageData) => {
                    const total = pageData.reduce(
                        (sum, record) => sum + (record.total || 0),
                        0
                    );
                    const totalRefund = pageData.reduce(
                        (sum, record) => sum + (record.refund_amount || 0),
                        0
                    );

                    return (
                        <Table.Summary fixed>
                            <Table.Summary.Row className="bg-gray-50">
                                <Table.Summary.Cell index={0} colSpan={4}>
                                    <Text strong className="text-gray-900">{t("purchases.total_amount_label")}</Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={4}>
                                    <Text
                                        strong
                                        className="text-lg text-green-600"
                                    >
                                        ₹{total.toFixed(2)}
                                    </Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={5}>
                                    {totalRefund > 0 && (
                                        <Text strong type="danger" className="text-sm">{t("purchases.total_refund_label")} ₹{totalRefund.toFixed(2)}</Text>
                                    )}
                                </Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    );
                }}
            />

            <style jsx>{`
                .purchase-details-modal .ant-modal-body {
                    padding: 24px;
                }

                .purchase-info .ant-descriptions-item-label {
                    font-weight: 600;
                    color: #374151;
                    background-color: #f9fafb;
                }

                .purchase-items-table .ant-table-thead > tr > th {
                    background-color: #f8fafc;
                    border-bottom: 2px solid #e5e7eb;
                    font-weight: 600;
                    color: #374151;
                }

                .purchase-items-table .ant-table-tbody > tr > td {
                    border-bottom: 1px solid #f3f4f6;
                }

                @media (max-width: 768px) {
                    .purchase-details-modal .ant-modal-body {
                        padding: 16px;
                    }
                }
            `}</style>
        </Modal>
    );
};

export default PurchaseDetails;
