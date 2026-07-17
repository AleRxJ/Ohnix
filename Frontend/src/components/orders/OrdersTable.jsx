import React from "react";
import { Table, Button, Select, Tag, Space, Tooltip, Card } from "antd";
import { EyeOutlined, FilePdfOutlined, UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
    getStatusColor,
    ORDER_STATUSES,
    TERMINAL_STATUSES,
} from "../../utils/orderHelpers";
import { getStatusIcon } from "../../data";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const OrdersTable = ({
    orders = [],
    loading = false,
    pagination = { current: 1, pageSize: 10, total: 0 },
    onTableChange = () => {},
    onViewDetails = () => {},
    onUpdateStatus = () => {},
    onGenerateInvoice = () => {},
}) => {
    const { t } = useI18n();

    const columns = [
        {
            title: t("orders.invoice_no"),
            dataIndex: "invoice_no",
            key: "invoice_no",
            width: 130,
            render: (text) => <span className="font-semibold text-blue-600">#{text}</span>,
        },
        {
            title: t("orders.customer"),
            dataIndex: ["customer_id", "name"],
            key: "customer",
            width: 220,
            ellipsis: true,
            render: (text, record) => (
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <UserOutlined className="text-blue-500" />
                    </div>
                    <span className="font-medium text-gray-900">{record.customer_id?.name || t("common.na")}</span>
                </div>
            ),
        },
        {
            title: t("common.date"),
            dataIndex: "order_date",
            key: "order_date",
            width: 140,
            render: (date) => <span className="text-gray-600 text-sm">{dayjs(date).format("MMM DD, YYYY")}</span>,
        },
        {
            title: t("orders.order_status"),
            dataIndex: "order_status",
            key: "order_status",
            width: 140,
            render: (status) => (
                <Tag color={getStatusColor(status)} className="font-medium px-3 py-1 rounded-md">
                    {t(`orders.${status}`) || status.toUpperCase()}
                </Tag>
            ),
        },
        {
            title: t("orders.items"),
            dataIndex: "total_products",
            key: "total_products",
            width: 80,
            align: "center",
            render: (count) => <span className="font-medium text-gray-700">{count}</span>,
        },
        {
            title: t("common.total"),
            dataIndex: "total",
            key: "total",
            align: "right",
            render: (amount) => <span className="font-semibold text-green-600 text-base">₹{amount?.toFixed(2)}</span>,
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: 200,
            align: "center",
            render: (_, record) => {
                const isTerminal = TERMINAL_STATUSES.includes(record.order_status);
                return (
                    <Space size="small" className="flex justify-center">
                        <Tooltip title={t("orders.view_details")}>
                            <Button type="text" icon={<EyeOutlined />} onClick={() => onViewDetails(record)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" />
                        </Tooltip>

                        <Tooltip title={isTerminal ? t("orders.status_final") : ""}>
                            <Select
                                value={record.order_status}
                                size="small"
                                style={{ width: 140 }}
                                onChange={(value) => onUpdateStatus(record._id, value)}
                                disabled={isTerminal}
                                className="rounded"
                            >
                                {ORDER_STATUSES.map((status) => (
                                    <Option key={status.value} value={status.value}>
                                        {t(`orders.${status.value}`) || status.label || status.value}
                                    </Option>
                                ))}
                            </Select>
                        </Tooltip>

                        <Tooltip title={t("orders.download_invoice")}>
                            <Button
                                type="text"
                                icon={<FilePdfOutlined />}
                                onClick={() => onGenerateInvoice(record._id, record.invoice_no)}
                                className={`${record.order_status === "cancelled" ? "invisible" : "text-red-600 hover:text-red-700 hover:bg-red-50"}`}
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    const MobileOrderCard = ({ order }) => {
        const isTerminal = TERMINAL_STATUSES.includes(order.order_status);
        return (
            <Card className="mb-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <UserOutlined className="text-white text-base" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{order.customer_id?.name || t("common.na")}</p>
                            <p className="text-xs text-gray-500 mt-0.5">#{order.invoice_no}</p>
                        </div>
                    </div>
                    <Tag icon={getStatusIcon(order.order_status)} color={getStatusColor(order.order_status)}>{t(`orders.${order.order_status}`) || order.order_status.toUpperCase()}</Tag>
                </div>

                <div className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg mt-3">
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-500 mb-0.5">{t("common.items")}</span>
                        <span className="text-sm font-medium text-gray-900">{order.total_products}</span>
                    </div>
                    <div className="h-8 w-px bg-gray-200"></div>
                    <div className="flex flex-col items-center">
                        <span className="text-xs text-gray-500 mb-0.5">{t("common.total")}</span>
                        <span className="text-sm font-semibold text-gray-900">₹{order.total?.toFixed(2)}</span>
                    </div>
                </div>

                <div className="flex gap-2 pt-3">
                    <Button type="primary" icon={<EyeOutlined />} onClick={() => onViewDetails(order)} className="flex-1 h-9 font-medium">{t("orders.view_details")}</Button>
                    <Button
                        icon={<FilePdfOutlined />}
                        onClick={() => onGenerateInvoice(order._id, order.invoice_no)}
                        className={`${order.order_status === "cancelled" ? "invisible" : "flex-1 h-9 font-medium border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"}`}
                        size="middle"
                        disabled={isTerminal && order.order_status !== "completed"}
                    >
                        {t("orders.invoice")}
                    </Button>
                </div>
            </Card>
        );
    };

    // Desktop table
    return (
        <>
            <div className="block lg:hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        <p className="mt-3 text-gray-500 text-sm">{t("orders.loading_orders")}</p>
                    </div>
                ) : orders.length === 0 ? (
                    <Card className="text-center py-12">
                        <p className="text-gray-500">{t("orders.no_orders_found")}</p>
                        <p className="text-sm text-gray-500 mt-2">{t("orders.adjust_filters_or_create")}</p>
                    </Card>
                ) : (
                    <>
                        <div className="m-3 text-right">
                            <p className="text-sm text-gray-600 font-medium">{t("orders.orders_found", { total: pagination.total })}</p>
                        </div>
                        {orders.map((order) => (
                            <MobileOrderCard key={order._id} order={order} />
                        ))}
                        <div className="flex justify-between items-center m-4 pt-3 border-t border-gray-100">
                            <span className="text-sm text-gray-500">
                                {(pagination.current - 1) * pagination.pageSize + 1} - {Math.min(pagination.current * pagination.pageSize, pagination.total)} {t("orders.of") || "of"} {pagination.total}
                            </span>
                            <Space>
                                <Button disabled={pagination.current === 1} onClick={() => onTableChange({ current: pagination.current - 1, pageSize: pagination.pageSize })}>{t("common.previous")}</Button>
                                <Button size="small" disabled={pagination.current * pagination.pageSize >= pagination.total} onClick={() => onTableChange({ current: pagination.current + 1, pageSize: pagination.pageSize })}>{t("common.next")}</Button>
                            </Space>
                        </div>
                    </>
                )}
            </div>

            <div className="hidden lg:block">
                <Card className="border-0 shadow-sm rounded-lg overflow-hidden">
                    <Table
                        columns={columns}
                        dataSource={orders}
                        loading={loading}
                        pagination={{
                            current: pagination.current,
                            pageSize: pagination.pageSize,
                            total: pagination.total,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            showTotal: (total, range) => t("orders.showing_orders", { start: range[0], end: range[1], total }),
                            pageSizeOptions: ["10", "20", "50", "100"],
                        }}
                        onChange={onTableChange}
                        scroll={{ x: 900 }}
                        className="orders-table"
                    />
                </Card>
            </div>

            <style jsx>{`
                .orders-table :global(.ant-table) {
                    font-size: 14px;
                }
                .orders-table :global(.ant-table-thead > tr > th) {
                    background-color: #f9fafb;
                    border-bottom: 2px solid #e5e7eb;
                    font-weight: 600;
                    color: #374151;
                    padding: 14px 16px;
                }
                .orders-table :global(.ant-table-tbody > tr > td) {
                    border-bottom: 1px solid #f3f4f6;
                    padding: 16px;
                }
                .orders-table :global(.ant-table-tbody > tr:hover > td) {
                    background-color: #f9fafb;
                }
                .orders-table :global(.ant-table-tbody > tr) {
                    transition: background-color 0.2s ease;
                }
                .orders-table :global(.ant-pagination) {
                    margin-top: 20px;
                }
            `}</style>
        </>
    );
};

export default OrdersTable;
