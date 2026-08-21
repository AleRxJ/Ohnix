import React, { useEffect, useState } from "react";
import { Modal, Table, Alert, Button, Tag, Typography, InputNumber } from "antd";
import { ExclamationCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";

const { Text, Title } = Typography;

// Mirrors Frontend/src/components/Purchase/ReturnPreview.jsx - same
// per-line editable form, but a sales return always *increases* stock (the
// customer hands the goods back), so there's no stock-availability column
// to cap against - the only ceiling is what's still pending on the line.
// Also adds the `requires_credit_note` blocked state: once an order has an
// issued electronic invoice, the backend refuses this endpoint outright and
// expects a credit note instead (see order.service.js#processReturn).
const OrderReturnPreview = ({ visible, onCancel, onSubmit, returnPreviewData, submitting }) => {
    const { formatCurrency } = useCurrency();
    const { t } = useI18n();
    const [quantities, setQuantities] = useState({});

    useEffect(() => {
        if (visible && returnPreviewData) {
            setQuantities({});
        }
    }, [visible, returnPreviewData]);

    const lines = returnPreviewData?.return_preview || [];
    const blocked = Boolean(returnPreviewData?.requires_credit_note);
    const hasPendingLines = lines.some((line) => line.pending_quantity > 0);

    const setLineQuantity = (orderDetailId, value) => {
        setQuantities((prev) => ({ ...prev, [orderDetailId]: value || 0 }));
    };

    const totalToRefund = lines.reduce((sum, line) => {
        const qty = quantities[line.order_detail_id] || 0;
        return sum + qty * line.unit_cost;
    }, 0);

    const hasAnyQuantity = Object.values(quantities).some((qty) => qty > 0);

    const columns = [
        {
            title: t("products.product"),
            dataIndex: "product_name",
            key: "product_name",
            render: (name) => (
                <div className="font-medium text-[var(--ohnix-text-primary)]">{name}</div>
            ),
            width: 180,
            ellipsis: true,
        },
        {
            title: t("orders.return_col_sold_qty"),
            dataIndex: "sold_quantity",
            key: "sold_quantity",
            render: (qty) => <div className="text-center">{qty}</div>,
            width: 90,
            align: "center",
        },
        {
            title: t("purchases.return_col_already_returned"),
            dataIndex: "already_returned_quantity",
            key: "already_returned_quantity",
            render: (qty) => (
                <div className="text-center text-[var(--ohnix-text-soft)]">{qty}</div>
            ),
            width: 100,
            align: "center",
        },
        {
            title: t("purchases.return_col_pending"),
            dataIndex: "pending_quantity",
            key: "pending_quantity",
            render: (qty) => (
                <div className="text-center font-medium text-[#44F3F0]">{qty}</div>
            ),
            width: 90,
            align: "center",
        },
        {
            title: t("purchases.return_col_qty_to_return"),
            key: "quantity_to_return",
            render: (_, record) =>
                !blocked && record.pending_quantity > 0 ? (
                    <div className="text-center">
                        <InputNumber
                            min={0}
                            max={record.pending_quantity}
                            value={quantities[record.order_detail_id] || 0}
                            onChange={(value) => setLineQuantity(record.order_detail_id, value)}
                            size="small"
                            className="w-20"
                        />
                    </div>
                ) : (
                    <div className="text-center">
                        <Tag color="cyan" icon={<CheckCircleOutlined />}>
                            {t(blocked ? "orders.return_blocked_tag" : "purchases.returned")}
                        </Tag>
                    </div>
                ),
            width: 140,
            align: "center",
        },
        {
            title: t("purchases.return_preview_col_unit_cost"),
            dataIndex: "unit_cost",
            key: "unit_cost",
            render: (cost) => (
                <div className="text-right text-[var(--ohnix-text-soft)]">{formatCurrency(cost)}</div>
            ),
            width: 110,
            align: "right",
        },
        {
            title: t("purchases.return_preview_col_potential_refund"),
            key: "line_refund",
            render: (_, record) => {
                const qty = quantities[record.order_detail_id] || 0;
                return (
                    <div className="text-right font-semibold text-[#44F3F0]">
                        {formatCurrency(qty * record.unit_cost)}
                    </div>
                );
            },
            width: 120,
            align: "right",
        },
    ];

    const handleSubmit = async () => {
        const linesToSubmit = lines
            .map((line) => ({
                order_detail_id: line.order_detail_id,
                quantity: quantities[line.order_detail_id] || 0,
            }))
            .filter((line) => line.quantity > 0);

        if (linesToSubmit.length === 0 || !returnPreviewData) return;

        const result = await onSubmit(returnPreviewData.order_id, linesToSubmit);
        if (result?.success) {
            onCancel();
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center space-x-3">
                    <ExclamationCircleOutlined className="text-[#FFCF70]" />
                    <Title level={4} className="mb-0 !text-[var(--ohnix-text-primary)]">
                        {t("orders.process_return")}
                    </Title>
                    <Tag color="cyan" className="text-sm">
                        #{returnPreviewData?.invoice_no}
                    </Tag>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button
                    key="cancel"
                    onClick={onCancel}
                    disabled={submitting}
                    className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                >
                    {t("common.cancel")}
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    danger
                    onClick={handleSubmit}
                    loading={submitting}
                    disabled={blocked || !hasAnyQuantity}
                    className="h-10 px-6 rounded-md font-medium transition-all duration-200"
                >
                    {t("orders.process_return")}
                </Button>,
            ]}
            width="95%"
            style={{ maxWidth: 1200 }}
            className="return-preview-modal"
        >
            {returnPreviewData && (
                <div className="space-y-6">
                    {blocked ? (
                        <Alert
                            message={t("orders.return_requires_credit_note_title")}
                            description={t("orders.return_requires_credit_note_desc")}
                            type="warning"
                            showIcon
                        />
                    ) : hasPendingLines ? (
                        <Alert
                            message={t("purchases.return_preview_summary_title")}
                            description={t("purchases.return_preview_summary_desc")}
                            type="info"
                            showIcon
                        />
                    ) : (
                        <Alert message={t("orders.return_nothing_pending")} type="success" showIcon />
                    )}

                    <Table
                        columns={columns}
                        dataSource={lines}
                        rowKey="order_detail_id"
                        pagination={false}
                        scroll={{ x: 900 }}
                        size="small"
                        className="return-preview-table module-dark-table"
                        summary={() => (
                            <Table.Summary fixed>
                                <Table.Summary.Row className="bg-white/[0.03]">
                                    <Table.Summary.Cell index={0} colSpan={5}>
                                        <div className="text-right">
                                            <Text strong className="!text-[var(--ohnix-text-primary)]">
                                                {t("purchases.total_refund_label")}
                                            </Text>
                                        </div>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={5} colSpan={2}>
                                        <div className="text-right">
                                            <Text strong className="text-lg !text-[#44F3F0]">
                                                {formatCurrency(totalToRefund)}
                                            </Text>
                                        </div>
                                    </Table.Summary.Cell>
                                </Table.Summary.Row>
                            </Table.Summary>
                        )}
                    />
                </div>
            )}
        </Modal>
    );
};

export default OrderReturnPreview;
