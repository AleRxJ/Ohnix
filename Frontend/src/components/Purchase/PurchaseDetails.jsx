import React, { useContext } from "react";
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
import { useCurrency } from "../../context/CurrencyContext";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";

const { Text, Title } = Typography;

const PurchaseDetails = ({ visible, onCancel, purchase, details }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { user } = useContext(AuthContext);
    const { team } = useTeam();
    // View-only presence, same reasoning as OrderDetailsDrawer.
    const { viewers } = useResourcePresence({
        resourceType: "purchase",
        resourceId: purchase?._id,
        active: visible && Boolean(team) && Boolean(purchase?._id),
    });
    const detailColumns = [
        {
            title: t("products.product"),
            dataIndex: ["product_id", "product_name"],
            key: "product_name",
            render: (_, record) => (
                <div className="font-medium text-[var(--ohnix-text-primary)]">
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
                <div className="text-center font-medium text-[#44F3F0]">
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
                <div className="font-medium text-[#44F3F0]">
                    {formatCurrency(cost)}
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
                <div className="font-semibold text-[var(--ohnix-text-primary)]">
                    {formatCurrency(total)}
                </div>
            ),
            width: 120,
            align: "right",
        },
        {
            title: t("purchases.return_status"),
            key: "return_status",
            render: (_, record) => {
                if (!record.returned_quantity) {
                    return <Tag color="default" className="!bg-[var(--ohnix-line-1)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-muted)]">{t("purchases.not_returned")}</Tag>;
                }
                return (
                    <Space direction="vertical" size="small" className="w-full">
                        <Tag color={record.fully_returned ? "red" : "gold"} className="font-medium">
                            {t(record.fully_returned ? "purchases.returned" : "purchases.return_preview_partial_return")}
                        </Tag>
                        <div className="text-xs text-[var(--ohnix-text-muted)] space-y-1">
                            <div>
                                {t("purchases.qty")}:{" "}
                                <span className="font-medium">{record.returned_quantity}</span>
                            </div>
                            {record.pending_quantity > 0 && (
                                <div>
                                    {t("purchases.return_col_pending")}:{" "}
                                    <span className="font-medium text-[#44F3F0]">{record.pending_quantity}</span>
                                </div>
                            )}
                            <div>
                                {t("purchases.refund")}:{" "}
                                <span className="font-medium text-red-400">{formatCurrency(record.refund_amount)}</span>
                            </div>
                        </div>
                    </Space>
                );
            },
            width: 160,
        },
    ];

    return (
        <Modal
            title={
                <div className="flex items-center space-x-2">
                    <Title level={4} className="mb-0 !text-[var(--ohnix-text-primary)]">{t("purchases.purchase_details")}</Title>
                    <Tag color="cyan" className="text-sm">{purchase?.purchase_no}</Tag>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width="95%"
            style={{ maxWidth: 1200 }}
            className="purchase-details-modal"
        >
            {purchase && team && (
                <PresenceLockBar viewers={viewers} lock={null} currentUserId={user?.id} />
            )}
            {purchase && (
                <Card className="mb-6 border-0 shadow-sm">
                    <Descriptions
                        column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
                        bordered
                        size="small"
                        className="purchase-info"
                    >
                        <Descriptions.Item label={t("purchases.purchase_number")}>
                                    <Text strong className="text-[#44F3F0]">{purchase.purchase_no}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.supplier")}>
                            <Text strong className="text-[var(--ohnix-text-primary)]">{purchase.supplier_id?.name}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.purchase_date")}>
                            <Text className="text-[var(--ohnix-text-soft)]">{dayjs(purchase.purchase_date).format("DD/MM/YYYY")}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.status")}>
                            <Tag
                                color={getStatusColor(purchase.purchase_status)}
                                icon={getStatusIconPurchase(
                                    purchase.purchase_status
                                )}
                                className="font-medium"
                            >
                                {t(`purchases.${purchase.purchase_status}`) || purchase.purchase_status.toUpperCase()}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.created_by")}>
                            <Text className="text-[var(--ohnix-text-soft)]">{purchase.created_by?.username}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.created_at")}>
                            <Text className="text-[var(--ohnix-text-soft)]">{dayjs(purchase.createdAt).format("DD/MM/YYYY HH:mm")}</Text>
                        </Descriptions.Item>
                    </Descriptions>
                </Card>
            )}

            <Divider orientation="left" className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{t("purchases.purchase_items")}</Divider>

            <Table
                columns={detailColumns}
                dataSource={details}
                rowKey="_id"
                pagination={false}
                scroll={{ x: 800 }}
                size="small"
                className="purchase-items-table module-dark-table"
                rowClassName="hover:bg-[var(--ohnix-hover-overlay)] transition-colors duration-200"
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
                            <Table.Summary.Row className="bg-[var(--ohnix-line-1)]">
                                <Table.Summary.Cell index={0} colSpan={4}>
                                    <Text strong className="text-[var(--ohnix-text-primary)]">{t("purchases.total_amount_label")}</Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={4}>
                                    <Text
                                        strong
                                        className="text-lg text-[#44F3F0]"
                                    >
                                        {formatCurrency(total)}
                                    </Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={5}>
                                    {totalRefund > 0 && (
                                        <Text strong type="danger" className="text-sm">{t("purchases.total_refund_label")} {formatCurrency(totalRefund)}</Text>
                                    )}
                                </Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    );
                }}
            />

        </Modal>
    );
};

export default PurchaseDetails;
