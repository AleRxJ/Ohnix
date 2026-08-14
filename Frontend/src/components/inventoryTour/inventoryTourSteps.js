// The full "How does Ohnix work?" guided tour. This actually DRIVES the user
// through creating real practice records (tagged is_tutorial_data - see
// InventoryTourContext.jsx) instead of just pointing at things that might
// not exist yet. Because each step creates what the next step needs,
// targets are guaranteed to exist by the time the tour points at them -
// "soft" is only still needed for a couple of steps where per-row targeting
// can't guarantee it's THE practice row.
//
// kind:
//  - "info"   -> just read and continue
//  - "action" -> the user has to actually do something (create/complete).
//                `completesOn` names the event InventoryTourContext.notifyAction()
//                listens for to auto-advance the instant it happens (see
//                the create/update hooks that call it) - the card's own
//                "done, continue" button is only a manual fallback.
//                `opensDialog: true` marks steps whose target opens a real
//                antd Modal/Drawer, so the renderer knows to get its own
//                spotlight overlay out of the way while that's open instead
//                of covering it.
//  - "finish" -> handled specially by InventoryTour.jsx, not templated here
export const INVENTORY_TOUR_STEPS = [
    {
        id: "welcome",
        kind: "info",
        titleKey: "inventory_tour.step_welcome_title",
        descKey: "inventory_tour.step_welcome_desc",
    },
    {
        id: "plan",
        kind: "info",
        titleKey: "inventory_tour.step_plan_title",
        descKey: "inventory_tour.step_plan_desc",
    },
    {
        id: "create-category",
        kind: "action",
        path: "/categories",
        selector: '[data-tour="tour-add-category"]',
        opensDialog: true,
        completesOn: "category",
        titleKey: "inventory_tour.step_create_category_title",
        descKey: "inventory_tour.step_create_category_desc",
        skipIf: (counts) => counts?.categories > 0,
    },
    {
        id: "create-unit",
        kind: "action",
        path: "/categories",
        selector: '[data-tour="tour-add-unit"]',
        opensDialog: true,
        completesOn: "unit",
        titleKey: "inventory_tour.step_create_unit_title",
        descKey: "inventory_tour.step_create_unit_desc",
        skipIf: (counts) => counts?.units > 0,
    },
    {
        id: "create-product",
        kind: "action",
        path: "/products",
        selector: '[data-tour="tour-add-product"]',
        opensDialog: true,
        completesOn: "product",
        titleKey: "inventory_tour.step_create_product_title",
        descKey: "inventory_tour.step_create_product_desc",
    },
    {
        id: "why-zero",
        kind: "info",
        path: "/products",
        selector: '[data-tour="tour-add-product"]',
        titleKey: "inventory_tour.step_why_zero_title",
        descKey: "inventory_tour.step_why_zero_desc",
    },
    {
        id: "create-supplier",
        kind: "action",
        path: "/suppliers",
        selector: '[data-tour="tour-add-supplier"]',
        opensDialog: true,
        completesOn: "supplier",
        titleKey: "inventory_tour.step_create_supplier_title",
        descKey: "inventory_tour.step_create_supplier_desc",
        skipIf: (counts) => counts?.suppliers > 0,
    },
    {
        id: "create-purchase",
        kind: "action",
        path: "/purchases",
        selector: '[data-tour="tour-add-purchase"]',
        opensDialog: true,
        completesOn: "purchase",
        titleKey: "inventory_tour.step_create_purchase_title",
        descKey: "inventory_tour.step_create_purchase_desc",
    },
    {
        id: "complete-purchase",
        kind: "action",
        path: "/purchases",
        selector: '[data-tour="tour-mark-completed"]',
        soft: true,
        completesOn: "purchase-completed",
        titleKey: "inventory_tour.step_complete_purchase_title",
        descKey: "inventory_tour.step_complete_purchase_desc",
    },
    {
        id: "stock-up",
        kind: "info",
        path: "/products",
        titleKey: "inventory_tour.step_stock_up_title",
        descKey: "inventory_tour.step_stock_up_desc",
    },
    {
        id: "create-customer",
        kind: "action",
        path: "/customers",
        selector: '[data-tour="tour-add-customer"]',
        opensDialog: true,
        completesOn: "customer",
        titleKey: "inventory_tour.step_create_customer_title",
        descKey: "inventory_tour.step_create_customer_desc",
        skipIf: (counts) => counts?.customers > 0,
    },
    {
        id: "create-order",
        kind: "action",
        path: "/orders",
        selector: '[data-tour="tour-add-order"]',
        opensDialog: true,
        completesOn: "order",
        titleKey: "inventory_tour.step_create_order_title",
        descKey: "inventory_tour.step_create_order_desc",
    },
    {
        id: "complete-order",
        kind: "action",
        path: "/orders",
        selector: '[data-tour="tour-order-status-select"]',
        soft: true,
        completesOn: "order-completed",
        titleKey: "inventory_tour.step_complete_order_title",
        descKey: "inventory_tour.step_complete_order_desc",
    },
    {
        id: "stock-down",
        kind: "info",
        path: "/products",
        titleKey: "inventory_tour.step_stock_down_title",
        descKey: "inventory_tour.step_stock_down_desc",
    },
    {
        id: "adjust-stock",
        kind: "action",
        path: "/products",
        selector: '[data-tour="tour-adjust-stock"]',
        soft: true,
        opensDialog: true,
        completesOn: "adjustment",
        titleKey: "inventory_tour.step_adjust_stock_title",
        descKey: "inventory_tour.step_adjust_stock_desc",
    },
    {
        id: "view-history",
        kind: "action",
        path: "/products",
        selector: '[data-tour="tour-view-product"]',
        soft: true,
        opensDialog: true,
        completesOn: "history-viewed",
        titleKey: "inventory_tour.step_movement_history_title",
        descKey: "inventory_tour.step_movement_history_desc",
    },
    {
        id: "low-stock-alerts",
        kind: "info",
        path: "/products",
        selector: '[data-tour="tour-add-product"]',
        titleKey: "inventory_tour.step_low_stock_alerts_title",
        descKey: "inventory_tour.step_low_stock_alerts_desc",
    },
    {
        id: "team-intro",
        kind: "info",
        path: "/team",
        titleKey: "inventory_tour.step_team_intro_title",
        descKey: "inventory_tour.step_team_intro_desc",
    },
    {
        id: "billing-intro",
        kind: "info",
        path: "/billing",
        titleKey: "inventory_tour.step_billing_intro_title",
        descKey: "inventory_tour.step_billing_intro_desc",
    },
    {
        id: "reports-intro",
        kind: "info",
        path: "/reports",
        titleKey: "inventory_tour.step_reports_intro_title",
        descKey: "inventory_tour.step_reports_intro_desc",
    },
    {
        id: "finish",
        kind: "finish",
    },
];
