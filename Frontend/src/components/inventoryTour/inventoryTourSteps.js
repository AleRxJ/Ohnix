// Ten steps mirroring the corrected inventory flow (create -> stock in via
// purchase -> stock out via sale -> return -> manual adjustment -> history ->
// alerts). Steps 5, 7, 8 and 9 point at elements that only exist once real
// data exists (a pending purchase, a completed purchase, at least one
// product) - `soft: true` marks those so InventoryTour.jsx falls back to a
// centered (targetless) card instead of failing when the element isn't
// mounted, per the "adapt to elements that actually exist" requirement.
export const INVENTORY_TOUR_STEPS = [
    {
        id: "welcome",
        titleKey: "inventory_tour.step_welcome_title",
        descKey: "inventory_tour.step_welcome_desc",
    },
    {
        id: "create-product",
        path: "/products",
        selector: '[data-tour="tour-add-product"]',
        titleKey: "inventory_tour.step_create_product_title",
        descKey: "inventory_tour.step_create_product_desc",
    },
    {
        id: "initial-stock",
        path: "/products",
        selector: '[data-tour="tour-add-product"]',
        titleKey: "inventory_tour.step_initial_stock_title",
        descKey: "inventory_tour.step_initial_stock_desc",
    },
    {
        id: "purchase-create",
        path: "/purchases",
        selector: '[data-tour="tour-add-purchase"]',
        titleKey: "inventory_tour.step_purchase_create_title",
        descKey: "inventory_tour.step_purchase_create_desc",
    },
    {
        id: "purchase-complete",
        path: "/purchases",
        selector: '[data-tour="tour-mark-completed"]',
        soft: true,
        titleKey: "inventory_tour.step_purchase_complete_title",
        descKey: "inventory_tour.step_purchase_complete_desc",
    },
    {
        id: "order-create",
        path: "/orders",
        selector: '[data-tour="tour-add-order"]',
        titleKey: "inventory_tour.step_order_create_title",
        descKey: "inventory_tour.step_order_create_desc",
    },
    {
        id: "purchase-return",
        path: "/purchases",
        selector: '[data-tour="tour-return-purchase"]',
        soft: true,
        titleKey: "inventory_tour.step_purchase_return_title",
        descKey: "inventory_tour.step_purchase_return_desc",
    },
    {
        id: "adjust-stock",
        path: "/products",
        selector: '[data-tour="tour-adjust-stock"]',
        soft: true,
        titleKey: "inventory_tour.step_adjust_stock_title",
        descKey: "inventory_tour.step_adjust_stock_desc",
    },
    {
        id: "movement-history",
        path: "/products",
        selector: '[data-tour="tour-view-product"]',
        soft: true,
        titleKey: "inventory_tour.step_movement_history_title",
        descKey: "inventory_tour.step_movement_history_desc",
    },
    {
        id: "low-stock-alerts",
        path: "/products",
        selector: '[data-tour="tour-add-product"]',
        titleKey: "inventory_tour.step_low_stock_alerts_title",
        descKey: "inventory_tour.step_low_stock_alerts_desc",
    },
];
