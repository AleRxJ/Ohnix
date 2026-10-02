import React from "react";
import useI18n from "../../../hooks/useI18n";
import { useCurrency } from "../../../context/CurrencyContext";
import OverviewCard from "./OverviewCard";

// Ranked list instead of a pie: bar length = revenue relative to the #1
// product, single hue (it's magnitude, not identity).
const TopProductsCard = ({ topProducts, available }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const rows = topProducts.slice(0, 5);
    const maxRevenue = Math.max(...rows.map((row) => Number(row.total_sales) || 0), 1);

    return (
        <OverviewCard
            title={t("dashboard.top_selling_products")}
            subtitle={t("dashboard.top_products_subtitle")}
            linkTo={available ? "/reports/top-products" : undefined}
            linkLabel={t("dashboard.view_all")}
        >
            {rows.length === 0 ? (
                <p className="m-auto py-10 text-center text-sm text-[var(--ohnix-text-muted)]">
                    {t(available ? "dashboard.no_top_products" : "dashboard.top_products_locked")}
                </p>
            ) : (
                <ol className="m-0 list-none space-y-4 p-0">
                    {rows.map((product, index) => {
                        const revenue = Number(product.total_sales) || 0;
                        return (
                            <li key={product._id || index} className="min-w-0">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="flex min-w-0 items-baseline gap-2">
                                        <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-[var(--ohnix-text-muted)]">
                                            {index + 1}
                                        </span>
                                        <span className="truncate text-sm font-medium text-[var(--ohnix-text-primary)]" title={product.product_name}>
                                            {product.product_name}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ohnix-text-primary)]">
                                        {formatCurrency(revenue)}
                                    </span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-3 pl-6">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ohnix-line-2)]">
                                        <div
                                            className="h-full rounded-full bg-[#29D8D5]"
                                            style={{ width: `${Math.max((revenue / maxRevenue) * 100, 2)}%` }}
                                        />
                                    </div>
                                    <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-[var(--ohnix-text-muted)]">
                                        {t("dashboard.units_sold", { count: product.quantity_sold })}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </OverviewCard>
    );
};

export default TopProductsCard;
