import React from "react";
import { Table, Button, Space, Tag, Tooltip, Popconfirm } from "antd";
import { EyeOutlined, CheckCircleOutlined, InfoCircleOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getStatusColor } from "../../utils/purchaseUtils";
import { getStatusIconPurchase } from "../../data";
import useI18n from "../../hooks/useI18n";

const PurchaseTable = ({ purchases = [], loading = false, searchText = "", onViewDetails = () => {}, onUpdateStatus = () => {}, onReturnPreview = () => {} }) => {
    const { t } = useI18n();

    const columns = [
        {
            title: t("purchases.purchase_no"),
            dataIndex: "purchase_no",
            key: "purchase_no",
            filteredValue: [searchText],
            onFilter: (value, record) =>
                record.purchase_no?.toLowerCase().includes(value.toLowerCase()) ||
                record.supplier_id?.name?.toLowerCase().includes(value.toLowerCase()),
        },
        {
            title: t("purchases.supplier"),
            dataIndex: ["supplier_id", "name"],
            key: "supplier",
            render: (_, record) => record.supplier_id?.name || t("common.na"),
        },
        {
            title: t("purchases.purchase_date"),
            dataIndex: "purchase_date",
            key: "purchase_date",
            render: (date) => dayjs(date).format("DD/MM/YYYY"),
        },
        {
            title: t("common.status"),
            dataIndex: "purchase_status",
            key: "status",
            render: (status) => (
                <Tag color={getStatusColor(status)} icon={getStatusIconPurchase(status)}>
                    {t(`purchases.${status}`) || status.toUpperCase()}
                </Tag>
            ),
        },
        {
            title: t("common.created_by"),
            dataIndex: ["created_by", "username"],
            key: "created_by",
            render: (_, record) => record.created_by?.username || t("common.na"),
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, record) => (
                <Space size="middle">
                    <Tooltip title={t("purchases.view_details")}>
                        <Button icon={<EyeOutlined />} size="small" onClick={() => onViewDetails(record)} />
                    </Tooltip>

                    {record.purchase_status === "pending" && (
                        <Tooltip title={t("purchases.mark_completed")}>
                            <Popconfirm
                                title={t("purchases.confirm_mark_completed")}
                                description={t("purchases.confirm_mark_completed_desc")}
                                onConfirm={() => onUpdateStatus(record._id, "completed")}
                            >
                                <Button icon={<CheckCircleOutlined />} size="small" type="primary" />
                            </Popconfirm>
                        </Tooltip>
                    )}

                    {record.purchase_status === "completed" && (
                        <>
                            <Tooltip title={t("purchases.preview_return")}>
                                <Button icon={<InfoCircleOutlined />} size="small" onClick={() => onReturnPreview(record._id)} />
                            </Tooltip>
                            <Tooltip title={t("purchases.process_return")}>
                                <Popconfirm
                                    title={t("purchases.confirm_process_return")}
                                    description={t("purchases.confirm_process_return_desc")}
                                    onConfirm={() => onUpdateStatus(record._id, "returned")}
                                >
                                    <Button icon={<UndoOutlined />} size="small" danger />
                                </Popconfirm>
                            </Tooltip>
                        </>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Table
            columns={columns}
            dataSource={purchases}
            loading={loading}
            rowKey="_id"
            pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => t("purchases.showing_purchases", { start: range[0], end: range[1], total }),
            }}
            scroll={{ x: 800 }}
        />
    );
};

export default PurchaseTable;
