import React from "react";
import { Table, Button, Space, Tag, Tooltip, Popconfirm } from "antd";
import { EyeOutlined, CheckCircleOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getStatusColor } from "../../utils/purchaseUtils";
import { getStatusIconPurchase } from "../../data";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const PurchaseTable = ({ purchases = [], loading = false, searchText = "", onViewDetails = () => {}, onUpdateStatus = () => {}, onReturnPreview = () => {} }) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    // Return preview is a read (purchases:view, matches the backend route);
    // marking completed/returned mutates status and needs purchases:edit.
    const canEdit = hasPermission("purchases", "edit");

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
                        <Tooltip title={canEdit ? t("purchases.mark_completed") : t("common.no_permission_to_edit")}>
                            <Popconfirm
                                title={t("purchases.confirm_mark_completed")}
                                description={t("purchases.confirm_mark_completed_desc")}
                                onConfirm={() => onUpdateStatus(record._id, "completed")}
                                disabled={!canEdit}
                            >
                                <Button icon={<CheckCircleOutlined />} size="small" type="primary" disabled={!canEdit} data-tour="tour-mark-completed" data-purchase-id={record._id} />
                            </Popconfirm>
                        </Tooltip>
                    )}

                    {record.purchase_status === "completed" && (
                        <Tooltip title={canEdit ? t("purchases.process_return") : t("common.no_permission_to_edit")}>
                            <Button
                                icon={<UndoOutlined />}
                                size="small"
                                danger
                                disabled={!canEdit}
                                onClick={() => onReturnPreview(record._id)}
                                data-tour="tour-return-purchase"
                            />
                        </Tooltip>
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
            locale={{ emptyText: t("common.no_data") }}
            pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => t("purchases.showing_purchases", { start: range[0], end: range[1], total }),
            }}
            scroll={{ x: 800 }}
            className="module-dark-table"
        />
    );
};

export default PurchaseTable;
