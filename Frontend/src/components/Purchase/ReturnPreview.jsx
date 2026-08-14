import React from "react";
import { Modal, Table, Alert, Button, Tag, Typography, Card, Space, Statistic, Row, Col } from "antd";
import { 
    ExclamationCircleOutlined, 
    CheckCircleOutlined, 
    WarningOutlined,
    DollarOutlined 
} from "@ant-design/icons";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";

const { Text, Title } = Typography;

const ReturnPreview = ({
    visible,
    onCancel,
    onProceed,
    returnPreviewData,
    purchases,
}) => {
    const { formatCurrency, currency } = useCurrency();
    const { t } = useI18n();
    const returnPreviewColumns = [
        {
            title: t("products.product"),
            dataIndex: "product_name",
            key: "product_name",
            render: (name) => (
                <div className="font-medium text-[var(--ohnix-text-primary)]">
                    {name}
                </div>
            ),
            width: 200,
            ellipsis: true,
        },
        {
            title: t("purchases.return_preview_col_purchased_qty"),
            dataIndex: "purchased_quantity",
            key: "purchased_quantity",
            render: (qty) => (
                <div className="text-center font-medium text-[#44F3F0]">
                    {qty}
                </div>
            ),
            width: 120,
            align: 'center',
        },
        {
            title: t("purchases.return_preview_col_current_stock"),
            dataIndex: "current_stock",
            key: "current_stock",
            render: (stock) => (
                <div className="text-center font-medium text-[var(--ohnix-text-soft)]">
                    {stock}
                </div>
            ),
            width: 120,
            align: 'center',
        },
        {
            title: t("purchases.return_preview_col_returnable_qty"),
            dataIndex: "returnable_quantity",
            key: "returnable_quantity",
            render: (qty, record) => (
                <div className="text-center">
                    <span
                        className={`font-semibold ${
                            record.can_fully_return
                                ? "text-[#44F3F0]"
                                : "text-[#FFCF70]"
                        }`}
                    >
                        {qty}
                    </span>
                </div>
            ),
            width: 120,
            align: 'center',
        },
        {
            title: t("purchases.return_preview_col_unit_cost"),
            dataIndex: "unit_cost",
            key: "unit_cost",
            render: (cost) => (
                <div className="text-right font-medium text-[var(--ohnix-text-soft)]">
                    {formatCurrency(cost)}
                </div>
            ),
            width: 120,
            align: 'right',
        },
        {
            title: t("purchases.return_preview_col_potential_refund"),
            dataIndex: "potential_refund",
            key: "potential_refund",
            render: (refund) => (
                <div className="text-right font-semibold text-[#44F3F0]">
                    {formatCurrency(refund)}
                </div>
            ),
            width: 140,
            align: 'right',
        },
        {
            title: t("common.status"),
            key: "status",
            render: (_, record) => (
                <Tag
                    color={record.can_fully_return ? "cyan" : "gold"}
                    icon={record.can_fully_return ? <CheckCircleOutlined /> : <WarningOutlined />}
                    className="font-medium px-3 py-1"
                >
                    {record.can_fully_return
                        ? t("purchases.return_preview_full_return")
                        : t("purchases.return_preview_partial_return")}
                </Tag>
            ),
            width: 140,
            align: 'center',
        },
    ];

    const handleProceed = () => {
        onCancel();
        const purchase = purchases.find(
            (p) => p._id === returnPreviewData?.purchase_id
        );
        if (purchase) {
            onProceed(purchase._id, "returned");
        }
    };

    const fullReturns = returnPreviewData?.return_preview?.filter(
        (item) => item.can_fully_return
    )?.length || 0;
    
    const partialReturns = returnPreviewData?.return_preview?.filter(
        (item) => !item.can_fully_return
    )?.length || 0;

    const totalItems = returnPreviewData?.return_preview?.length || 0;

    return (
        <Modal
            title={
                <div className="flex items-center space-x-3">
                    <ExclamationCircleOutlined className="text-[#FFCF70]" />
                    <Title level={4} className="mb-0 !text-[var(--ohnix-text-primary)]">
                        {t("purchases.return_preview")}
                    </Title>
                    <Tag color="cyan" className="text-sm">
                        {returnPreviewData?.purchase_no}
                    </Tag>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="cancel" onClick={onCancel} size="large">
                    {t("common.cancel")}
                </Button>,
                <Button
                    key="proceed"
                    type="primary"
                    danger
                    onClick={handleProceed}
                    size="large"
                    className="bg-red-500 hover:bg-red-600"
                >
                    {t("purchases.return_preview_proceed")}
                </Button>,
            ]}
            width="95%"
            style={{ maxWidth: 1200 }}
            className="return-preview-modal"
        >
            {returnPreviewData && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12} md={8}>
                            <Card className="text-center border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                                <Statistic
                                    title={t("purchases.return_preview_total_potential_refund")}
                                    value={returnPreviewData.total_potential_refund}
                                    precision={2}
                                    prefix={currency.symbol}
                                    valueStyle={{ color: '#44F3F0', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                            <Card className="text-center border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                                <Statistic
                                    title={t("purchases.return_preview_total_items")}
                                    value={totalItems}
                                    valueStyle={{ color: '#44F3F0', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                            <Card className="text-center border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                                <Statistic
                                    title={t("purchases.return_preview_full_returns")}
                                    value={fullReturns}
                                    valueStyle={{ color: '#44F3F0', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                            <Card className="text-center border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                                <Statistic
                                    title={t("purchases.return_preview_partial_returns")}
                                    value={partialReturns}
                                    valueStyle={{ color: '#FFCF70', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Alert Messages */}
                    <Space direction="vertical" className="w-full" size="middle">
                        <Alert
                            message={t("purchases.return_preview_summary_title")}
                            description={
                                <div className="space-y-2">
                                    <p>{t("purchases.return_preview_summary_desc")}</p>
                                    <div className="flex flex-wrap gap-4 text-sm">
                                        <span>💰 {t("purchases.total_refund_label")} <strong>{formatCurrency(returnPreviewData.total_potential_refund)}</strong></span>
                                        <span>{t("purchases.return_preview_full_label")} <strong>{fullReturns}</strong></span>
                                        {partialReturns > 0 && (
                                            <span>{t("purchases.return_preview_partial_label")} <strong>{partialReturns}</strong></span>
                                        )}
                                    </div>
                                </div>
                            }
                            type="info"
                            showIcon
                        />

                        {partialReturns > 0 && (
                            <Alert
                                message={t("purchases.return_preview_notice_title")}
                                description={t("purchases.return_preview_notice_desc")}
                                type="warning"
                                showIcon
                            />
                        )}
                    </Space>

                    {/* Return Preview Table */}
                    <Table
                        columns={returnPreviewColumns}
                        dataSource={returnPreviewData.return_preview}
                        rowKey="product_id"
                        pagination={false}
                        scroll={{ x: 900 }}
                        size="small"
                        className="return-preview-table module-dark-table"
                        rowClassName={(record) => 
                            `hover:bg-white/[0.05] transition-colors duration-200 ${
                                record.can_fully_return ? 'bg-white/[0.02]' : 'bg-white/[0.02]'
                            }`
                        }
                        summary={(pageData) => {
                            const totalRefund = pageData.reduce(
                                (sum, record) => sum + (record.potential_refund || 0),
                                0
                            );

                            return (
                                <Table.Summary fixed>
                                    <Table.Summary.Row className="bg-white/[0.03]">
                                        <Table.Summary.Cell index={0} colSpan={5}>
                                            <div className="text-right">
                                                <Text strong className="!text-[var(--ohnix-text-primary)]">
                                                    {t("purchases.return_preview_footer_total")}
                                                </Text>
                                            </div>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={5}>
                                            <div className="text-right">
                                                <Text strong className="text-lg !text-[#44F3F0]">
                                                    {formatCurrency(totalRefund)}
                                                </Text>
                                            </div>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={6}>
                                            <div className="text-center">
                                                <Space>
                                                    <Tag color="success" className="text-xs">
                                                        {t("purchases.return_preview_full_short", { count: fullReturns })}
                                                    </Tag>
                                                    {partialReturns > 0 && (
                                                        <Tag color="warning" className="text-xs">
                                                            {t("purchases.return_preview_partial_short", { count: partialReturns })}
                                                        </Tag>
                                                    )}
                                                </Space>
                                            </div>
                                        </Table.Summary.Cell>
                                    </Table.Summary.Row>
                                </Table.Summary>
                            );
                        }}
                    />
                </div>
            )}

        </Modal>
    );
};

export default ReturnPreview;