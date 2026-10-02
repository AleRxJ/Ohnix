import React from "react";
import { CheckCircleFilled, WarningFilled, CloseCircleFilled } from "@ant-design/icons";
import useI18n from "../../../hooks/useI18n";
import OverviewCard from "./OverviewCard";

const MiniStat = ({ label, value, tone }) => (
    <div className="min-w-0 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2.5">
        <div className="truncate text-[11px] text-[var(--ohnix-text-muted)]">{label}</div>
        <div className={`text-lg font-bold tabular-nums ${tone || "text-[var(--ohnix-text-primary)]"}`}>{value}</div>
    </div>
);

const InventoryCard = ({ totalProducts, totalStock, outOfStockCount, lowStockProducts, formatNumber }) => {
    const { t } = useI18n();
    const restock = lowStockProducts.slice(0, 5);

    return (
        <OverviewCard
            title={t("dashboard.inventory_title")}
            subtitle={t("dashboard.inventory_subtitle")}
            linkTo="/reports/low-stock-alerts"
            linkLabel={t("dashboard.view_all")}
        >
            <div className="grid grid-cols-3 gap-2">
                <MiniStat label={t("dashboard.total_products")} value={formatNumber(totalProducts)} />
                <MiniStat label={t("dashboard.units_in_stock")} value={formatNumber(totalStock)} />
                <MiniStat
                    label={t("dashboard.out_of_stock")}
                    value={formatNumber(outOfStockCount)}
                    tone={outOfStockCount > 0 ? "text-[#F28B82]" : "text-[#34D399]"}
                />
            </div>

            <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-[var(--ohnix-text-muted)]">
                {t("dashboard.needs_restock")}
            </div>

            {restock.length === 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#34D399]/25 bg-[#34D399]/8 px-3 py-3 text-sm text-[var(--ohnix-text-primary)]">
                    <CheckCircleFilled className="text-[#34D399]" />
                    {t("dashboard.inventory_all_good")}
                </div>
            ) : (
                <ul className="m-0 mt-2 list-none divide-y divide-[var(--ohnix-line-3)] p-0">
                    {restock.map((product) => {
                        const isOut = product.stock <= 0;
                        return (
                            <li key={product._id} className="flex items-center justify-between gap-3 py-2.5">
                                <span className="min-w-0 truncate text-sm text-[var(--ohnix-text-primary)]" title={product.product_name}>
                                    {product.product_name}
                                </span>
                                <span
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        isOut ? "bg-[#F28B82]/12 text-[#F28B82]" : "bg-[#FFCF70]/12 text-[#FFCF70]"
                                    }`}
                                >
                                    {isOut ? <CloseCircleFilled /> : <WarningFilled />}
                                    {isOut
                                        ? t("products.out_of_stock")
                                        : t("dashboard.units_left", { count: product.stock })}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </OverviewCard>
    );
};

export default InventoryCard;
