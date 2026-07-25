import React from "react";
import { Modal, Table, Alert, Button, Tag, Typography, Card, Space, Statistic, Row, Col } from "antd";
import { 
    ExclamationCircleOutlined, 
    CheckCircleOutlined, 
    WarningOutlined,
    DollarOutlined 
} from "@ant-design/icons";

const { Text, Title } = Typography;

const ReturnPreview = ({
    visible,
    onCancel,
    onProceed,
    returnPreviewData,
    purchases,
}) => {
    const returnPreviewColumns = [
        {
            title: "Product",
            dataIndex: "product_name",
            key: "product_name",
            render: (name) => (
                <div className="font-medium text-white">
                    {name}
                </div>
            ),
            width: 200,
            ellipsis: true,
        },
        {
            title: "Purchased Qty",
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
            title: "Current Stock",
            dataIndex: "current_stock",
            key: "current_stock",
            render: (stock) => (
                <div className="text-center font-medium text-[#D4DBDF]">
                    {stock}
                </div>
            ),
            width: 120,
            align: 'center',
        },
        {
            title: "Returnable Qty",
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
            title: "Unit Cost",
            dataIndex: "unit_cost",
            key: "unit_cost",
            render: (cost) => (
                <div className="text-right font-medium text-[#D4DBDF]">
                    ₹{cost.toFixed(2)}
                </div>
            ),
            width: 120,
            align: 'right',
        },
        {
            title: "Potential Refund",
            dataIndex: "potential_refund",
            key: "potential_refund",
            render: (refund) => (
                <div className="text-right font-semibold text-[#44F3F0]">
                    ₹{refund.toFixed(2)}
                </div>
            ),
            width: 140,
            align: 'right',
        },
        {
            title: "Status",
            key: "status",
            render: (_, record) => (
                <Tag 
                    color={record.can_fully_return ? "cyan" : "gold"}
                    icon={record.can_fully_return ? <CheckCircleOutlined /> : <WarningOutlined />}
                    className="font-medium px-3 py-1"
                >
                    {record.can_fully_return ? "Full Return" : "Partial Return"}
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
                    <Title level={4} className="mb-0 !text-white">
                        Return Preview
                    </Title>
                    <Tag color="blue" className="text-sm">
                        {returnPreviewData?.purchase_no}
                    </Tag>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="cancel" onClick={onCancel} size="large">
                    Cancel
                </Button>,
                <Button
                    key="proceed"
                    type="primary"
                    danger
                    onClick={handleProceed}
                    size="large"
                    className="bg-red-500 hover:bg-red-600"
                >
                    Proceed with Return
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
                            <Card className="text-center border border-white/10 bg-[#0B0B0B]/92">
                                <Statistic
                                    title="Total Potential Refund"
                                    value={returnPreviewData.total_potential_refund}
                                    precision={2}
                                    prefix="₹"
                                    valueStyle={{ color: '#44F3F0', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                            <Card className="text-center border border-white/10 bg-[#0B0B0B]/92">
                                <Statistic
                                    title="Total Items"
                                    value={totalItems}
                                    valueStyle={{ color: '#44F3F0', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                            <Card className="text-center border border-white/10 bg-[#0B0B0B]/92">
                                <Statistic
                                    title="Full Returns"
                                    value={fullReturns}
                                    valueStyle={{ color: '#44F3F0', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                            <Card className="text-center border border-white/10 bg-[#0B0B0B]/92">
                                <Statistic
                                    title="Partial Returns"
                                    value={partialReturns}
                                    valueStyle={{ color: '#FFCF70', fontWeight: 'bold' }}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {/* Alert Messages */}
                    <Space direction="vertical" className="w-full" size="middle">
                        <Alert
                            message="Return Summary"
                            description={
                                <div className="space-y-2">
                                    <p>Review the return details below before proceeding.</p>
                                    <div className="flex flex-wrap gap-4 text-sm">
                                        <span>💰 Total Refund: <strong>₹{returnPreviewData.total_potential_refund.toFixed(2)}</strong></span>
                                        <span>✅ Full Returns: <strong>{fullReturns}</strong></span>
                                        {partialReturns > 0 && (
                                            <span>⚠️ Partial Returns: <strong>{partialReturns}</strong></span>
                                        )}
                                    </div>
                                </div>
                            }
                            type="info"
                            showIcon
                        />

                        {partialReturns > 0 && (
                            <Alert
                                message="Partial Return Notice"
                                description="Some items have insufficient stock and will be partially returned. Only the available stock quantity will be processed for return."
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
                                                <Text strong className="text-gray-900">
                                                    Total Potential Refund: 
                                                </Text>
                                            </div>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={5}>
                                            <div className="text-right">
                                                <Text strong className="text-lg text-green-600">
                                                    ₹{totalRefund.toFixed(2)}
                                                </Text>
                                            </div>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={6}>
                                            <div className="text-center">
                                                <Space>
                                                    <Tag color="success" className="text-xs">
                                                        Full: {fullReturns}
                                                    </Tag>
                                                    {partialReturns > 0 && (
                                                        <Tag color="warning" className="text-xs">
                                                            Partial: {partialReturns}
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

            <style jsx>{`
                .return-preview-modal .ant-modal-body {
                    padding: 24px;
                }
                
                .return-preview-table .ant-table-thead > tr > th {
                    background-color: #f8fafc;
                    border-bottom: 2px solid #e5e7eb;
                    font-weight: 600;
                    color: #374151;
                }
                
                .return-preview-table .ant-table-tbody > tr > td {
                    border-bottom: 1px solid #f3f4f6;
                }
                
                .return-preview-table .ant-table-tbody > tr:hover > td {
                    background-color: #eff6ff !important;
                }
                
                @media (max-width: 768px) {
                    .return-preview-modal .ant-modal-body {
                        padding: 16px;
                    }
                    
                    .return-preview-table .ant-table-thead > tr > th,
                    .return-preview-table .ant-table-tbody > tr > td {
                        padding: 8px 12px;
                    }
                }
                
                @media (max-width: 576px) {
                    .return-preview-table .ant-table-thead > tr > th,
                    .return-preview-table .ant-table-tbody > tr > td {
                        padding: 6px 8px;
                    }
                }
            `}</style>
        </Modal>
    );
};

export default ReturnPreview;