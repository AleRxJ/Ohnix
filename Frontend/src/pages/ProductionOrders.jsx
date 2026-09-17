import React, { useEffect, useMemo, useState } from "react";
import { Layout, Card, Button, Table, Tag, Popconfirm, Tooltip, Modal, Typography } from "antd";
import { PlusOutlined, BuildOutlined, CheckOutlined, CloseOutlined, EyeOutlined } from "@ant-design/icons";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import { useProducts } from "../hooks/products/useProducts";
import { useProductionOrders } from "../hooks/products/useProductionOrders";
import CreateProductionOrderModal from "../components/products/CreateProductionOrderModal";
import EmptyState from "../components/common/EmptyState";

const { Content } = Layout;
const { Text } = Typography;

const STATUS_COLORS = {
    draft: "#8b98a0",
    completed: "#44f3f0",
    cancelled: "#fb7185",
};

const ProductionOrders = () => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("products", "edit");
    const { products, fetchProducts } = useProducts();
    const { orders, loading, createOrder, completeOrder, cancelOrder } = useProductionOrders();
    const [isCreateVisible, setIsCreateVisible] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [detailOrder, setDetailOrder] = useState(null);

    useEffect(() => {
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const manufacturedProducts = useMemo(() => (products || []).filter((p) => p.is_manufactured), [products]);

    const handleCreate = async (payload) => {
        setCreateLoading(true);
        const result = await createOrder(payload);
        setCreateLoading(false);
        if (result.success) setIsCreateVisible(false);
    };

    const handleComplete = async (id) => {
        setActionLoadingId(id);
        await completeOrder(id);
        setActionLoadingId(null);
    };

    const handleCancel = async (id) => {
        setActionLoadingId(id);
        await cancelOrder(id);
        setActionLoadingId(null);
    };

    const columns = [
        {
            title: t("products.manufactured_product"),
            key: "product",
            render: (_, record) => (
                <div className="flex flex-col">
                    <Text strong className="text-sm text-[var(--ohnix-text-primary)]">{record.product_name}</Text>
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">{record.point_of_sale_name}</Text>
                </div>
            ),
        },
        {
            title: t("products.quantity_to_produce"),
            dataIndex: "quantity",
            key: "quantity",
            align: "center",
        },
        {
            title: t("common.status"),
            key: "status",
            render: (_, record) => {
                const color = STATUS_COLORS[record.status] || STATUS_COLORS.draft;
                return (
                    <span className="status-pill" style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}>
                        <span className="status-dot" style={{ background: color }} />
                        {t(`products.production_status_${record.status}`)}
                    </span>
                );
            },
        },
        {
            title: t("products.unit_cost_applied"),
            key: "unit_cost_applied",
            render: (_, record) => (record.unit_cost_applied != null ? formatCurrency(record.unit_cost_applied) : "—"),
        },
        {
            title: t("common.created_at"),
            key: "createdAt",
            render: (_, record) =>
                new Date(record.createdAt).toLocaleDateString(currentLanguage, { year: "numeric", month: "short", day: "numeric" }),
            responsive: ["md"],
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, record) => (
                <div className="flex gap-1 justify-end">
                    <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => setDetailOrder(record)}
                        className="text-[var(--ohnix-text-dim)] hover:text-[#44F3F0]"
                    />
                    {record.status === "draft" && (
                        <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                            <Popconfirm
                                title={t("products.complete_production_order_confirm_title")}
                                description={t("products.complete_production_order_confirm_content")}
                                okText={t("common.yes")}
                                cancelText={t("common.no")}
                                onConfirm={() => handleComplete(record._id)}
                                disabled={!canEdit}
                            >
                                <Button
                                    size="small"
                                    icon={<CheckOutlined />}
                                    loading={actionLoadingId === record._id}
                                    disabled={!canEdit}
                                    className="h-8 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                                >
                                    {t("products.complete_production_order")}
                                </Button>
                            </Popconfirm>
                        </Tooltip>
                    )}
                    {["draft", "completed"].includes(record.status) && (
                        <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                            <Popconfirm
                                title={t("products.cancel_production_order_confirm_title")}
                                description={
                                    record.status === "completed"
                                        ? t("products.cancel_completed_production_order_confirm_content")
                                        : t("common.warning")
                                }
                                okText={t("common.yes")}
                                cancelText={t("common.no")}
                                onConfirm={() => handleCancel(record._id)}
                                disabled={!canEdit}
                            >
                                <Button
                                    size="small"
                                    danger
                                    icon={<CloseOutlined />}
                                    loading={actionLoadingId === record._id}
                                    disabled={!canEdit}
                                    className="h-8 rounded-md"
                                >
                                    {t("common.cancel")}
                                </Button>
                            </Popconfirm>
                        </Tooltip>
                    )}
                </div>
            ),
        },
    ];

    return (
        <Layout className="bg-transparent">
            <Content className="p-2 sm:p-4 lg:p-6 bg-transparent text-[var(--ohnix-text-primary)]">
                <div className="max-w-full lg:max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="truncate mb-1 text-3xl sm:text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                {t("common.production_orders_nav")}
                                <BuildOutlined className="text-[#44F3F0] inline-block ml-2" />
                            </h1>
                            <p className="text-[var(--ohnix-text-muted)] text-base md:text-sm hidden sm:block">
                                {t("products.production_orders_subtitle")}
                            </p>
                        </div>
                        <div className="flex-shrink-0">
                            <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    size="large"
                                    disabled={!canEdit}
                                    onClick={() => setIsCreateVisible(true)}
                                    className="w-full sm:w-auto rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                                >
                                    {t("products.new_production_order")}
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    <Card className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
                        <Table
                            rowKey="_id"
                            columns={columns}
                            dataSource={orders}
                            loading={loading}
                            pagination={{ pageSize: 20 }}
                            locale={{
                                emptyText: (
                                    <EmptyState
                                        icon={<BuildOutlined />}
                                        title={t("products.no_production_orders")}
                                        subtitle={t("products.no_production_orders_hint")}
                                    />
                                ),
                            }}
                        />
                    </Card>

                    <CreateProductionOrderModal
                        visible={isCreateVisible}
                        manufacturedProducts={manufacturedProducts}
                        loading={createLoading}
                        onSubmit={handleCreate}
                        onCancel={() => setIsCreateVisible(false)}
                    />

                    <Modal
                        title={detailOrder?.product_name}
                        open={Boolean(detailOrder)}
                        onCancel={() => setDetailOrder(null)}
                        footer={null}
                        width={520}
                    >
                        {detailOrder && (
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <Text className="text-[var(--ohnix-text-muted)]">{t("products.quantity_to_produce")}</Text>
                                    <Text className="font-semibold">{detailOrder.quantity}</Text>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <Text className="text-[var(--ohnix-text-muted)]">{t("products.materials_cost")}</Text>
                                    <Text className="font-semibold">{formatCurrency(detailOrder.materials_cost)}</Text>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <Text className="text-[var(--ohnix-text-muted)]">{t("products.labor_cost")}</Text>
                                    <Text className="font-semibold">{formatCurrency(detailOrder.labor_cost)}</Text>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <Text className="text-[var(--ohnix-text-muted)]">{t("products.overhead_cost")}</Text>
                                    <Text className="font-semibold">{formatCurrency(detailOrder.overhead_cost)}</Text>
                                </div>
                                {detailOrder.notes && (
                                    <div className="text-sm">
                                        <Text className="text-[var(--ohnix-text-muted)] block mb-1">{t("products.production_notes_label")}</Text>
                                        <Text>{detailOrder.notes}</Text>
                                    </div>
                                )}
                                <div className="pt-3 border-t border-[var(--ohnix-line-3)]">
                                    <Text className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] block mb-2">
                                        {t("products.recipe_preview")}
                                    </Text>
                                    <div className="space-y-1">
                                        {(detailOrder.lines || []).map((line) => (
                                            <div key={line.product_id} className="flex items-center justify-between text-sm">
                                                <span>{line.product_name}</span>
                                                <span className="text-[var(--ohnix-text-muted)]">
                                                    {line.quantity_required}
                                                    {line.unit_cost_applied != null ? ` · ${formatCurrency(line.unit_cost_applied)}` : ""}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {detailOrder.status === "cancelled" && (
                                    <Tag color="#fb7185">{t("products.production_status_cancelled")}</Tag>
                                )}
                            </div>
                        )}
                    </Modal>
                </div>
            </Content>
        </Layout>
    );
};

export default ProductionOrders;
