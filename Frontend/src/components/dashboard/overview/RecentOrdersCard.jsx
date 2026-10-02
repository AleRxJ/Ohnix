import React from "react";
import { Tag } from "antd";
import useI18n from "../../../hooks/useI18n";
import { useCurrency } from "../../../context/CurrencyContext";
import OverviewCard from "./OverviewCard";

const STATUS_COLORS = {
    completed: "success",
    processing: "processing",
    pending: "warning",
    cancelled: "error",
};

const RecentOrdersCard = ({ recentOrders }) => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const dateFormat = new Intl.DateTimeFormat(currentLanguage === "es" ? "es-CO" : "en-US", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    });
    const rows = recentOrders.slice(0, 5);

    return (
        <OverviewCard
            title={t("dashboard.recent_orders")}
            subtitle={t("dashboard.recent_orders_subtitle")}
            linkTo="/orders"
            linkLabel={t("dashboard.view_all")}
        >
            {rows.length === 0 ? (
                <p className="m-auto py-10 text-center text-sm text-[var(--ohnix-text-muted)]">
                    {t("dashboard.no_recent_orders")}
                </p>
            ) : (
                <ul className="m-0 list-none divide-y divide-[var(--ohnix-line-3)] p-0">
                    {rows.map((order) => (
                        <li key={order._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-[var(--ohnix-text-primary)]">
                                    {order.customer_id?.name || t("customers.unknown_customer")}
                                </div>
                                <div className="truncate text-xs text-[var(--ohnix-text-muted)]">
                                    <span className="font-mono">#{order.invoice_no}</span>
                                    {" · "}
                                    {dateFormat.format(new Date(order.createdAt))}
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className="text-sm font-semibold tabular-nums text-[var(--ohnix-text-primary)]">
                                    {formatCurrency(order.total)}
                                </span>
                                <Tag color={STATUS_COLORS[order.order_status] || "default"} className="m-0 text-[11px]">
                                    {t(`common.${order.order_status}`)}
                                </Tag>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </OverviewCard>
    );
};

export default RecentOrdersCard;
