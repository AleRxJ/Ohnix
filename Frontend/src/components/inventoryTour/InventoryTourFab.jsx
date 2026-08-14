import React from "react";
import { CompassOutlined, CloseOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";

// App-wide, not scoped to any one module - the tour now walks through the
// whole first-time flow (categories, products, purchases, sales,
// customers, plus a look at Team/Billing/Reports), so the entry point has
// to be reachable from anywhere in the dashboard, not just Products.
const InventoryTourFab = () => {
    const { t } = useI18n();
    const { isOpen, completed, fabDismissed, start, dismissFab } = useInventoryTour();

    if (isOpen || completed || fabDismissed) return null;

    return (
        <div className="no-print fixed bottom-6 right-6 z-[1050] group">
            <button
                type="button"
                onClick={start}
                aria-label={t("inventory_tour.trigger_button")}
                className="inventory-tour-fab flex items-center gap-2 h-12 pl-4 pr-5 rounded-full border-0 cursor-pointer"
                style={{
                    background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)",
                    color: "#021314",
                    boxShadow: "0 8px 28px rgba(41,216,213,0.4)",
                }}
            >
                <CompassOutlined className="text-lg" />
                <span className="text-sm font-semibold whitespace-nowrap hidden sm:inline">
                    {t("inventory_tour.trigger_button")}
                </span>
            </button>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    dismissFab();
                }}
                aria-label={t("inventory_tour.dismiss_fab")}
                title={t("inventory_tour.dismiss_fab")}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 border-0 cursor-pointer"
                style={{
                    background: "var(--ohnix-surface-card)",
                    border: "1px solid var(--ohnix-line-4)",
                    color: "var(--ohnix-text-muted)",
                }}
            >
                <CloseOutlined style={{ fontSize: 10 }} />
            </button>

            <style>{`
                .inventory-tour-fab {
                    animation: ohnix-tour-fab-pulse 2.4s ease-in-out infinite;
                    transition: transform 160ms ease, box-shadow 160ms ease;
                }
                .inventory-tour-fab:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 34px rgba(41,216,213,0.55);
                }
                @keyframes ohnix-tour-fab-pulse {
                    0%, 100% { box-shadow: 0 8px 28px rgba(41,216,213,0.4), 0 0 0 0 rgba(41,216,213,0.35); }
                    50% { box-shadow: 0 8px 28px rgba(41,216,213,0.4), 0 0 0 8px rgba(41,216,213,0); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .inventory-tour-fab { animation: none; }
                }
            `}</style>
        </div>
    );
};

export default InventoryTourFab;
