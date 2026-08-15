import React, { useEffect, useState } from "react";
import { Drawer, Image, Typography, Divider, Tag, Spin } from "antd";
import {
    TagOutlined,
    InboxOutlined,
    DollarOutlined,
    CalendarOutlined,
    AppstoreOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    CloseCircleOutlined,
    PercentageOutlined,
    HistoryOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
} from "@ant-design/icons";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "../../utils/productUtils";
import { ELECTRONIC_INVOICING_ENABLED } from "../../config/features";

const SOURCE_LABEL_KEYS = {
    purchase: "products.movement_purchase",
    purchase_return: "products.movement_purchase_return",
    order: "products.movement_order",
    order_cancellation: "products.movement_order_cancellation",
    adjustment: "products.movement_adjustment",
};

const { Text, Title } = Typography;

const ProductDetailsDrawer = ({
    visible,
    product,
    onClose,
    onFetchStockMovements,
    placement = "right",
    width,
    height,
}) => {
    const { formatCurrency } = useCurrency();
    const { t, currentLanguage } = useI18n();
    const [movements, setMovements] = useState([]);
    const [movementsLoading, setMovementsLoading] = useState(false);

    useEffect(() => {
        if (!visible || !product?._id || !onFetchStockMovements) {
            setMovements([]);
            return;
        }
        let cancelled = false;
        setMovementsLoading(true);
        onFetchStockMovements(product._id).then((data) => {
            if (!cancelled) {
                setMovements(data || []);
                setMovementsLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, product?._id]);

    if (!product) return null;

    const getStockStatus = (stock) => {
        if (stock === 0) {
            return {
                text: t("products.out_of_stock"),
                color: "#ef4444",
                bg: "rgba(239,68,68,0.12)",
                border: "rgba(239,68,68,0.25)",
                icon: <CloseCircleOutlined />,
            };
        }

        if (stock <= (product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD)) {
            return {
                text: t("products.low_stock"),
                color: "#f59e0b",
                bg: "rgba(245,158,11,0.12)",
                border: "rgba(245,158,11,0.25)",
                icon: <WarningOutlined />,
            };
        }

        return {
            text: t("products.in_stock"),
            color: "#29D8D5",
            bg: "rgba(41,216,213,0.12)",
            border: "rgba(41,216,213,0.25)",
            icon: <CheckCircleOutlined />,
        };
    };

    const stockStatus = getStockStatus(product.stock);
    const profitMargin = (product.selling_price - product.buying_price)?.toFixed(2);
    const profitPercentage =
        product.selling_price > 0
            ? (
                  ((product.selling_price - product.buying_price) /
                      product.selling_price) *
                  100
              ).toFixed(1)
            : 0;

    const drawerWidth =
        width || (typeof window !== "undefined" && window.innerWidth < 768 ? "100vw" : "480px");

    return (
        <Drawer
            title={
                <div className="flex items-center justify-between">
                    <Text className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("products.product_details")}</Text>
                </div>
            }
            placement={placement}
            onClose={onClose}
            open={visible}
            width={drawerWidth}
            height={height}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                header: {
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px",
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                },
                body: {
                    padding: "24px",
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                },
            }}
        >
            <div className="space-y-5">
                <div className="module-shell rounded-3xl p-5 reveal-card">
                    <div className="flex gap-5">
                        <div className="flex-shrink-0">
                            <div className="w-28 h-full rounded-lg overflow-hidden bg-white/[0.04] border border-[var(--ohnix-line-4)] flex items-center justify-center">
                                <Image
                                    src={product.product_image}
                                    alt={product.product_name}
                                    className="w-full h-full object-cover"
                                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6U"
                                    preview={{
                                        mask: <div className="text-[var(--ohnix-text-primary)] text-xs font-medium">{t("products.preview")}</div>,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <Title level={4} className="!text-[var(--ohnix-text-primary)] !mb-2 !text-lg !font-semibold">
                                {product.product_name}
                            </Title>
                            <div className="flex items-center gap-2 mb-3">
                                <TagOutlined className="text-[var(--ohnix-text-dim)] text-xs" />
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{product.product_code}</Text>
                            </div>
                            <div
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border"
                                style={{
                                    backgroundColor: stockStatus.bg,
                                    color: stockStatus.color,
                                    borderColor: stockStatus.border,
                                }}
                            >
                                {stockStatus.icon}
                                <span>{stockStatus.text}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="module-shell rounded-3xl p-4">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-lg bg-[#29D8D5]/10 flex items-center justify-center mb-2">
                                <InboxOutlined className="text-[#29D8D5] text-lg" />
                            </div>
                            <Text className="text-xs text-[var(--ohnix-text-muted)] mb-1 font-bold">{t("products.stock")}</Text>
                            <Text className="text-xl font-bold text-[var(--ohnix-text-primary)]">{product.stock}</Text>
                        </div>
                    </div>

                    <div className="module-shell rounded-3xl p-4">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-lg bg-[#44F3F0]/10 flex items-center justify-center mb-2">
                                <DollarOutlined className="text-[#44F3F0] text-lg" />
                            </div>
                            <Text className="text-xs text-[var(--ohnix-text-muted)] mb-1 font-bold">{t("products.profit")}</Text>
                            <Text className="text-xl font-bold text-[#44F3F0]">{formatCurrency(Number(profitMargin))}</Text>
                        </div>
                    </div>

                    <div className="module-shell rounded-3xl p-4">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-lg bg-[#29D8D5]/10 flex items-center justify-center mb-2">
                                <PercentageOutlined className="text-[#29D8D5] text-lg" />
                            </div>
                            <Text className="text-xs text-[var(--ohnix-text-muted)] mb-1 font-bold">{t("products.margin")}</Text>
                            <Text className="text-xl font-bold text-[var(--ohnix-text-primary)]">{profitPercentage}%</Text>
                        </div>
                    </div>
                </div>

                <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
                    <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)]">
                        <div className="flex items-center gap-2">
                            <HistoryOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.movement_history")}</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        {movementsLoading ? (
                            <div className="flex justify-center py-6">
                                <Spin size="small" />
                            </div>
                        ) : movements.length === 0 ? (
                            // Not antd's <Empty/> - its default illustration + text use
                            // antd's light-theme colors (no dark algorithm is configured
                            // app-wide, see AntdConfigProvider.jsx), which render as a
                            // near-invisible light-gray image and dark-gray text against
                            // this app's near-black background.
                            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                                <HistoryOutlined className="text-2xl text-[var(--ohnix-text-dim)]" />
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">
                                    {t("products.no_movements")}
                                </Text>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {movements.map((m) => (
                                    <div
                                        key={m._id}
                                        className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--ohnix-line-3)] last:border-0 last:pb-0"
                                    >
                                        <div className="flex items-start gap-2 min-w-0">
                                            {m.delta > 0 ? (
                                                <ArrowUpOutlined className="text-[#44F3F0] mt-0.5" />
                                            ) : (
                                                <ArrowDownOutlined className="text-red-400 mt-0.5" />
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Tag color={m.delta > 0 ? "cyan" : "red"} className="!m-0">
                                                        {t(SOURCE_LABEL_KEYS[m.source_type] || m.source_type)}
                                                    </Tag>
                                                    <Text className="text-xs text-[var(--ohnix-text-dim)]">
                                                        {new Date(m.createdAt).toLocaleString(currentLanguage, {
                                                            year: "numeric",
                                                            month: "short",
                                                            day: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </Text>
                                                </div>
                                                {m.reason && (
                                                    <Text className="text-xs text-[var(--ohnix-text-muted)] block mt-1">
                                                        {m.reason}
                                                    </Text>
                                                )}
                                                {m.created_by?.username && (
                                                    <Text className="text-xs text-[var(--ohnix-text-dim)] block mt-0.5">
                                                        {m.created_by.username}
                                                    </Text>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <Text
                                                className={`text-sm font-bold block ${
                                                    m.delta > 0 ? "text-[#44F3F0]" : "text-red-400"
                                                }`}
                                            >
                                                {m.delta > 0 ? "+" : ""}
                                                {m.delta}
                                            </Text>
                                            <Text className="text-xs text-[var(--ohnix-text-dim)]">
                                                {t("products.balance")}: {m.balance_after}
                                            </Text>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
                    <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)]">
                        <div className="flex items-center gap-2">
                            <DollarOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.pricing_info")}</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.buying_price")}</Text>
                                <Text className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                    {formatCurrency(product.buying_price)}
                                </Text>
                            </div>
                            <Divider className="!my-0" style={{ borderColor: "var(--ohnix-line-3)" }} />
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.selling_price")}</Text>
                                <Text className="text-base font-semibold text-[#44F3F0]">
                                    {formatCurrency(product.selling_price)}
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                {typeof product.low_stock_threshold === "number" && (
                    <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
                        <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)] flex items-center gap-2">
                            <WarningOutlined className="text-[#44F3F0]" />
                            <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.low_stock_alert")}</Text>
                        </div>
                        <div className="p-5">
                            <div className="flex justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.low_stock_threshold")}</Text>
                                <Text className="text-sm text-[var(--ohnix-text-primary)]">{product.low_stock_threshold}</Text>
                            </div>
                        </div>
                    </div>
                )}

                {ELECTRONIC_INVOICING_ENABLED && (product.unit_measure_code || product.standard_code) && (
                    <div className="module-shell rounded-3xl border border-[#29D8D5]/15">
                        <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircleOutlined className="text-[#44F3F0]" />
                                <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.dian_classification")}</Text>
                            </div>
                            <Text className="text-xs text-[#44F3F0]">DIAN</Text>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="flex justify-between"><Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.unit")}</Text><Text className="text-sm text-[var(--ohnix-text-primary)]">{product.unit_measure_code || "—"}</Text></div>
                            <div className="flex justify-between"><Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.dian_standard_code")}</Text><Text className="text-sm text-[var(--ohnix-text-primary)]">{product.standard_code || "—"}</Text></div>
                            <div className="flex justify-between"><Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.tax_treatment")}</Text><Text className="text-sm text-[var(--ohnix-text-primary)]">{t(`products.tax_treatment_${product.tax_treatment || "taxed"}`)}</Text></div>
                            <div className="flex justify-between"><Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.dian_tax")}</Text><Text className="text-sm text-[var(--ohnix-text-primary)]">{product.tax_treatment === "excluded" ? t("products.dian_excluded") : product.tax_treatment === "exempt" ? `${product.tax_code || "01"} · ${t("products.dian_exempt")}` : `${product.tax_code || "01"} · ${product.tax_rate ?? 0}%`}</Text></div>
                        </div>
                    </div>
                )}

                <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
                    <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)]">
                        <div className="flex items-center gap-2">
                            <AppstoreOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.classification")}</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.category")}</Text>
                                <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                    {product.category_id?.category_name || "N/A"}
                                </Text>
                            </div>
                            <Divider className="!my-0" style={{ borderColor: "var(--ohnix-line-3)" }} />
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.unit")}</Text>
                                <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                    {product.unit_id?.unit_name || "N/A"}
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
                    <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)]">
                        <div className="flex items-center gap-2">
                            <CalendarOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.product_timeline")}</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.created")}</Text>
                                <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                    {new Date(product.createdAt).toLocaleDateString(currentLanguage, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </Text>
                            </div>
                            <Divider className="!my-0" style={{ borderColor: "var(--ohnix-line-3)" }} />
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.last_updated")}</Text>
                                <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                    {new Date(product.updatedAt).toLocaleDateString(currentLanguage, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Drawer>
    );
};

export default ProductDetailsDrawer;
