import React, { useEffect, useState } from "react";
import { Table, Button, Space, Tag, Tooltip, Popconfirm, Card } from "antd";
import { EyeOutlined, CheckCircleOutlined, UndoOutlined, ShoppingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getStatusColor } from "../../utils/purchaseUtils";
import { getStatusIconPurchase } from "../../data";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import useIsMobile from "../../hooks/useIsMobile";
import EmptyState from "../common/EmptyState";

const PurchaseTable = ({ purchases = [], loading = false, searchText = "", onViewDetails = () => {}, onUpdateStatus = () => {}, updatingPurchaseId = null, returnPreviewLoadingId = null, onReturnPreview = () => {} }) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const isMobile = useIsMobile();
    // Return preview is a read (purchases:view, matches the backend route);
    // marking completed/returned mutates status and needs purchases:edit.
    const canEdit = hasPermission("purchases", "edit");

    const filteredPurchases = searchText
        ? purchases.filter(
              (p) =>
                  p.purchase_no?.toLowerCase().includes(searchText.toLowerCase()) ||
                  p.supplier_id?.name?.toLowerCase().includes(searchText.toLowerCase())
          )
        : purchases;

    const MOBILE_PAGE_SIZE = 15;
    const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);
    useEffect(() => {
        setMobileVisibleCount(MOBILE_PAGE_SIZE);
    }, [purchases, searchText]);

    const MobilePurchaseCard = ({ purchase }) => (
        <Card className="mb-3 module-shell overflow-hidden hover-lift" size="small">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#44F3F0] m-0">#{purchase.purchase_no}</p>
                    <p className="text-xs text-[var(--ohnix-text-muted)] m-0 truncate">{purchase.supplier_id?.name || t("common.na")}</p>
                </div>
                <Tag color={getStatusColor(purchase.purchase_status)} icon={getStatusIconPurchase(purchase.purchase_status)} className="shrink-0">
                    {t(`purchases.${purchase.purchase_status}`) || purchase.purchase_status.toUpperCase()}
                </Tag>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--ohnix-text-muted)] mb-3">
                <span>{dayjs(purchase.purchase_date).format("DD/MM/YYYY")}</span>
                <span>{purchase.created_by?.username || t("common.na")}</span>
            </div>
            <div className="flex gap-2">
                <Button block icon={<EyeOutlined />} onClick={() => onViewDetails(purchase)}>
                    {t("purchases.view_details")}
                </Button>
                {purchase.purchase_status === "pending" && (
                    <Popconfirm
                        title={t("purchases.confirm_mark_completed")}
                        description={t("purchases.confirm_mark_completed_desc")}
                        onConfirm={() => onUpdateStatus(purchase._id, "completed")}
                        disabled={!canEdit}
                    >
                        <Button
                            icon={<CheckCircleOutlined />}
                            type="primary"
                            disabled={!canEdit}
                            loading={updatingPurchaseId === purchase._id}
                        />
                    </Popconfirm>
                )}
                {purchase.purchase_status === "completed" && (
                    <Button
                        icon={<UndoOutlined />}
                        danger
                        disabled={!canEdit}
                        loading={returnPreviewLoadingId === purchase._id}
                        onClick={() => onReturnPreview(purchase._id)}
                    />
                )}
            </div>
        </Card>
    );

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
                                <Button
                                    icon={<CheckCircleOutlined />}
                                    size="small"
                                    type="primary"
                                    disabled={!canEdit}
                                    loading={updatingPurchaseId === record._id}
                                    data-tour="tour-mark-completed"
                                    data-purchase-id={record._id}
                                />
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
                                loading={returnPreviewLoadingId === record._id}
                                onClick={() => onReturnPreview(record._id)}
                                data-tour="tour-return-purchase"
                            />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    if (isMobile) {
        return (
            <div className="animate-fade-up">
                {loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : filteredPurchases.length === 0 ? (
                    <EmptyState icon={<ShoppingOutlined />} title={t("common.no_data")} />
                ) : (
                    <>
                        {filteredPurchases.slice(0, mobileVisibleCount).map((purchase) => (
                            <MobilePurchaseCard key={purchase._id} purchase={purchase} />
                        ))}
                        {mobileVisibleCount < filteredPurchases.length && (
                            <div className="flex justify-center pt-1 pb-2">
                                <Button block onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)} className="max-w-xs">
                                    {t("common.load_more")}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

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
