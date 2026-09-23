import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout, Card, Button, Table, Tag, Popconfirm, Tooltip, Modal, Typography } from "antd";
import { PlusOutlined, BuildOutlined, CheckOutlined, CloseOutlined, EyeOutlined, QuestionCircleOutlined, ArrowRightOutlined } from "@ant-design/icons";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import { useProducts } from "../hooks/products/useProducts";
import { useProductionOrders } from "../hooks/products/useProductionOrders";
import CreateProductionOrderModal from "../components/products/CreateProductionOrderModal";
import EmptyState from "../components/common/EmptyState";
import SectionGuide from "../components/common/SectionGuide";

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
    const { products, loading: productsLoading, fetchProducts } = useProducts();
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
    const needsSetup = !productsLoading && manufacturedProducts.length === 0;

    const helpLabel = (label, help) => (
        <span className="inline-flex items-center gap-1.5">
            {label}
            <Tooltip title={help}><QuestionCircleOutlined className="text-[var(--ohnix-text-dim)] cursor-help" /></Tooltip>
        </span>
    );

    const goToProductsButton = (
        <Link to="/products">
            <Button icon={<ArrowRightOutlined />} iconPosition="end" className="rounded-md">
                {t("products.production_setup_cta")}
            </Button>
        </Link>
    );

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
                    <Tooltip title={t(`products.production_status_${record.status}_help`)}>
                        <span className="status-pill" style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}>
                            <span className="status-dot" style={{ background: color }} />
                            {t(`products.production_status_${record.status}`)}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: helpLabel(t("products.unit_cost_applied"), t("products.production_unit_cost_help")),
            key: "unit_cost_applied",
            render: (_, record) => (record.unit_cost_applied != null ? formatCurrency(record.unit_cost_applied) : "—"),
        },
        {
            title: t("common.date"),
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
                                        : t("products.production_cancel_draft_confirm_content")
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

                    <SectionGuide
                        storageKey="ohnix:production-guide"
                        title={t("products.production_guide_title")}
                        summary={t("products.production_guide_summary")}
                        steps={[t("products.production_guide_step_1"), t("products.production_guide_step_2"), t("products.production_guide_step_3")]}
                        result={t("products.production_guide_result")}
                        concepts={[
                            { label: t("products.production_concept_raw_material"), help: t("products.production_concept_raw_material_help") },
                            { label: t("products.production_concept_recipe"), help: t("products.production_concept_recipe_help") },
                            { label: t("products.labor_cost"), help: t("products.production_labor_help") },
                            { label: t("products.production_concept_overhead"), help: t("products.production_overhead_help") },
                            { label: t("products.unit_cost_applied"), help: t("products.production_unit_cost_help") },
                        ]}
                    />

                    {needsSetup && (
                        <div className="mb-4 sm:mb-6 p-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="m-0 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("products.production_setup_title")}</p>
                                <p className="m-0 mt-1 text-xs sm:text-sm text-[var(--ohnix-text-muted)]">{t("products.production_setup_body")}</p>
                            </div>
                            <div className="flex-shrink-0">{goToProductsButton}</div>
                        </div>
                    )}

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
                                        action={
                                            needsSetup ? null : (
                                                <Button icon={<PlusOutlined />} disabled={!canEdit} onClick={() => setIsCreateVisible(true)} className="rounded-md">
                                                    {t("products.new_production_order")}
                                                </Button>
                                            )
                                        }
                                    />
                                ),
                            }}
                        />
                    </Card>

                    <CreateProductionOrderModal
                        visible={isCreateVisible}
                        manufacturedProducts={manufacturedProducts}
                        setupAction={goToProductsButton}
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
                                    <Text className="font-semibold">
                                        {detailOrder.status === "draft" ? t("products.production_cost_pending") : formatCurrency(detailOrder.materials_cost)}
                                    </Text>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <Text className="text-[var(--ohnix-text-muted)]">{helpLabel(t("products.labor_cost"), t("products.production_labor_help"))}</Text>
                                    <Text className="font-semibold">{formatCurrency(detailOrder.labor_cost)}</Text>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <Text className="text-[var(--ohnix-text-muted)]">{helpLabel(t("products.overhead_cost"), t("products.production_overhead_help"))}</Text>
                                    <Text className="font-semibold">{formatCurrency(detailOrder.overhead_cost)}</Text>
                                </div>
                                <div className="flex justify-between text-sm pt-2 border-t border-[var(--ohnix-line-3)]">
                                    <Text className="text-[var(--ohnix-text-muted)]">
                                        {helpLabel(t("products.unit_cost_applied"), t("products.production_unit_cost_help"))}
                                    </Text>
                                    <Text className="font-semibold">
                                        {detailOrder.unit_cost_applied != null ? formatCurrency(detailOrder.unit_cost_applied) : t("products.production_cost_pending")}
                                    </Text>
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
