import { canAccessModule } from "../middleware/team.permissions.js";

// The only places inside Ohnix the assistant can send someone (navigate_to)
// or point at (highlight). The model picks a key from these enums; the
// path/state the frontend actually navigates with always comes from here,
// never from model output - so a hallucinated or prompt-injected route can't
// turn into a real navigation, it just gets dropped by sanitizeRespondArgs.
//
// `description` doubles as the assistant's map of the app (it's rendered
// into the system prompt), so keep it about what the person does on that
// screen, in plain Spanish. `labelKey` is a frontend i18n key the widget
// uses for the button text, so labels stay translated without the backend
// knowing the UI copy.
//
// Accounting tabs are opened via router state ({ tab }), same contract as
// Accounting.jsx's existing deep links from other modules.

const accountingTab = (tab, labelKey, description) => ({
    path: "/accounting",
    state: { tab },
    labelKey,
    anchor: `accounting-tab-${tab}`,
    description,
});

export const NAVIGATION_TARGETS = {
    dashboard: { path: "/dashboard", labelKey: "assistant.nav.dashboard", description: "Panel principal con el resumen del negocio." },
    products: { path: "/products", labelKey: "assistant.nav.products", description: "Crear y editar productos, variantes, imágenes y stock." },
    categories: { path: "/categories", labelKey: "assistant.nav.categories", description: "Categorías y unidades de medida de productos." },
    orders: { path: "/orders", labelKey: "assistant.nav.orders", description: "Registrar y consultar ventas." },
    quotations: { path: "/quotations", labelKey: "assistant.nav.quotations", description: "Cotizaciones de venta y compra." },
    purchases: { path: "/purchases", labelKey: "assistant.nav.purchases", description: "Registrar compras a proveedores." },
    customers: { path: "/customers", labelKey: "assistant.nav.customers", description: "Clientes, su información y cartera." },
    suppliers: { path: "/suppliers", labelKey: "assistant.nav.suppliers", description: "Proveedores y cuentas por pagar." },
    finance: { path: "/finance", labelKey: "assistant.nav.finance", description: "Caja, bancos, pagos, cobros y cuentas por pagar." },
    "finance.reconciliation": { path: "/finance/reconciliation", labelKey: "assistant.nav.reconciliation", description: "Conciliación bancaria." },
    reports: { path: "/reports", labelKey: "assistant.nav.reports", description: "Reportes del negocio." },
    "electronic-invoices": { path: "/electronic-invoices", labelKey: "assistant.nav.electronic_invoices", description: "Facturas y documentos electrónicos DIAN emitidos." },
    "purchase-support-documents": { path: "/purchase-support-documents", labelKey: "assistant.nav.support_documents", description: "Documento soporte de compras a no obligados a facturar." },
    "fiscal-setup": { path: "/fiscal-setup", labelKey: "assistant.nav.fiscal_setup", description: "Configuración DIAN de la empresa (habilitación, certificado, resoluciones)." },
    "production-orders": { path: "/production-orders", labelKey: "assistant.nav.production", description: "Órdenes de producción y costeo de productos fabricados." },
    team: { path: "/team", labelKey: "assistant.nav.team", description: "Equipo, roles, permisos y puntos de venta." },
    integrations: { path: "/integrations", labelKey: "assistant.nav.integrations", description: "Llaves API, webhooks, Shopify y WooCommerce." },
    billing: { path: "/billing", labelKey: "assistant.nav.billing", description: "Plan y suscripción de Ohnix." },
    discoveries: { path: "/discoveries", labelKey: "assistant.nav.discoveries", description: "Hallazgos del Discovery Engine sobre el negocio." },

    "accounting.overview": accountingTab("overview", "accounting.tab_overview", "Resumen contable del mes y accesos a cartera, IVA y conciliación."),
    "accounting.chart": accountingTab("chart", "accounting.tab_chart_of_accounts", "Plan de cuentas (PUC). Ohnix crea uno base automáticamente; aquí se agregan cuentas propias."),
    "accounting.journal": accountingTab("journal", "accounting.tab_journal", "Libro diario: todos los asientos automáticos y manuales con débito y crédito. Aquí se consultan y se anulan con contraasiento."),
    "accounting.vouchers": accountingTab("vouchers", "accounting.tab_vouchers", "Comprobantes manuales para ajustes y reclasificaciones. Borrador no afecta estados; contabilizado queda inmutable."),
    "accounting.opening_balance": accountingTab("opening_balance", "accounting.tab_opening_balance", "Apertura contable: cargar los saldos iniciales con los que la empresa empieza en Ohnix."),
    "accounting.audit": accountingTab("audit", "accounting.tab_audit", "Auditoría de cambios contables y de configuración."),
    "accounting.third_parties": accountingTab("third_parties", "accounting.tab_third_parties", "Auxiliares por tercero: movimientos y saldo por cliente, proveedor u otro tercero."),
    "accounting.cost_centers": accountingTab("cost_centers", "accounting.tab_cost_centers", "Centros de costo para separar resultados por área, sede o unidad."),
    "accounting.recurring_expenses": accountingTab("recurring_expenses", "accounting.tab_recurring_expenses", "Gastos que se repiten cada mes (arriendo, servicios) y se contabilizan solos."),
    "accounting.fixed_assets": accountingTab("fixed_assets", "accounting.tab_fixed_assets", "Activos fijos y su depreciación mensual automática en línea recta."),
    "accounting.prepaid_expenses": accountingTab("prepaid_expenses", "accounting.tab_prepaid_expenses", "Gastos diferidos (pagados por anticipado) que se amortizan mes a mes."),
    "accounting.financial_obligations": accountingTab("financial_obligations", "accounting.tab_financial_obligations", "Préstamos y obligaciones financieras: desembolso, cuotas e intereses."),
    "accounting.receivable_impairment": accountingTab("receivable_impairment", "accounting.tab_receivable_impairment", "Deterioro y castigo de cartera de clientes."),
    "accounting.inventory_valuation": accountingTab("inventory_valuation", "accounting.tab_inventory_valuation", "Valor contable del inventario."),
    "accounting.recurring_journals": accountingTab("recurring_journals", "accounting.tab_recurring_journals", "Asientos de varias líneas que se repiten cada mes (provisiones, causaciones)."),
    "accounting.budgets": accountingTab("budgets", "accounting.tab_budgets", "Presupuestos por cuenta y centro de costo contra la ejecución real."),
    "accounting.trial_balance": accountingTab("trial_balance", "accounting.tab_trial_balance", "Balance de comprobación: saldo inicial, movimientos y saldo final de cada cuenta; para revisar que todo cuadre antes de cerrar."),
    "accounting.periods": accountingTab("periods", "accounting.tab_periods", "Cierre y reapertura de periodos mensuales y del año fiscal."),
    "accounting.statements": accountingTab("statements", "accounting.tab_financial_statements", "Estados financieros: estado de resultados, balance general, cambios en el patrimonio, flujo de efectivo y notas."),
    "accounting.taxes": accountingTab("taxes", "accounting.tab_taxes", "Impuestos y retenciones: responsabilidades, conceptos de retención, liquidación de IVA, ICA y renta."),
};

// Specific controls inside a screen. Each anchor must exist in the UI as
// data-assistant-anchor="<key>" (see Accounting.jsx); `target` is the screen
// it lives on, so the widget can navigate there first and then spotlight it.
// Every NAVIGATION_TARGETS entry with an `anchor` (the accounting tab
// headers) is highlightable too - see HIGHLIGHT_ANCHORS below.
const CONTROL_ANCHORS = {
    "accounting-chart-new-account": { target: "accounting.chart", labelKey: "accounting.new_account_button", description: "Botón para crear una cuenta contable nueva." },
    "accounting-vouchers-new": { target: "accounting.vouchers", labelKey: "accounting.voucher_new", description: "Botón para crear un comprobante manual." },
    "accounting-opening-balance-post": { target: "accounting.opening_balance", labelKey: "accounting.opening_balance_post", description: "Botón para contabilizar la apertura (se habilita cuando débitos y créditos cuadran)." },
    "accounting-fixed-assets-new": { target: "accounting.fixed_assets", labelKey: "accounting.fixed_asset_new", description: "Botón para registrar un activo fijo." },
    "accounting-cost-centers-new": { target: "accounting.cost_centers", labelKey: "accounting.cost_center_new", description: "Botón para crear un centro de costo." },
    "accounting-recurring-expenses-new": { target: "accounting.recurring_expenses", labelKey: "accounting.recurring_expense_new", description: "Botón para crear un gasto recurrente." },
    "accounting-recurring-journals-new": { target: "accounting.recurring_journals", labelKey: "accounting.recurring_journal_new", description: "Botón para crear un asiento recurrente." },
    "accounting-periods-close-year": { target: "accounting.periods", labelKey: "assistant.anchor_close_year", description: "Botón para revisar y cerrar el año fiscal seleccionado." },
};

export const HIGHLIGHT_ANCHORS = {
    ...Object.fromEntries(
        Object.entries(NAVIGATION_TARGETS)
            .filter(([, target]) => target.anchor)
            .map(([key, target]) => [
                target.anchor,
                { target: key, labelKey: target.labelKey, description: `Pestaña: ${target.description}` },
            ])
    ),
    ...CONTROL_ANCHORS,
};

// Resolves a target key into what the frontend needs to act on it, or null
// for anything not in the registry.
// What each screen needs, mirroring the frontend route guards (App.jsx):
// a module key (view), a list = any of them, "owner" = hard owner-only
// surfaces, null = open to everyone signed in. Sub-screens ("accounting.x")
// inherit their parent's rule.
const TARGET_ACCESS = {
    dashboard: null,
    team: null,
    products: "products",
    categories: "categories",
    orders: "orders",
    quotations: ["purchases", "orders"],
    purchases: "purchases",
    customers: "customers",
    suppliers: "suppliers",
    finance: "finance",
    reports: "reports",
    discoveries: "discoveries",
    "electronic-invoices": "einvoicing",
    "purchase-support-documents": "purchases",
    "production-orders": "inventory",
    accounting: "accounting",
    billing: "billing",
    "fiscal-setup": "owner",
    integrations: "owner",
};

const ruleFor = (key) => (key in TARGET_ACCESS ? TARGET_ACCESS[key] : TARGET_ACCESS[key.split(".")[0]]);

// Set of NAVIGATION_TARGETS keys this user can actually open, so the
// assistant never offers a button that the route guard would just bounce
// back to the dashboard. Owner/solo users (not team members) get everything.
export const getAllowedTargets = async (user) => {
    const keys = Object.keys(NAVIGATION_TARGETS);
    if (!user?.isTeamMember) return new Set(keys);
    const levelCache = new Map();
    const canView = async (moduleKey) => {
        if (!levelCache.has(moduleKey)) levelCache.set(moduleKey, await canAccessModule(user, moduleKey, "view"));
        return levelCache.get(moduleKey);
    };
    const allowed = new Set();
    for (const key of keys) {
        const rule = ruleFor(key);
        if (rule === null || rule === undefined) allowed.add(key);
        else if (rule === "owner") continue;
        else if (Array.isArray(rule) ? (await Promise.all(rule.map(canView))).some(Boolean) : await canView(rule)) allowed.add(key);
    }
    return allowed;
};

// allowed: optional Set from getAllowedTargets - omitted means unrestricted.
export const resolveNavigation = (targetKey, allowed = null) => {
    const target = NAVIGATION_TARGETS[targetKey];
    if (!target || (allowed && !allowed.has(targetKey))) return null;
    return {
        target: targetKey,
        path: target.path,
        state: target.state || null,
        labelKey: target.labelKey,
        anchor: target.anchor || null,
    };
};

export const resolveHighlight = (anchorKey, allowed = null) => {
    const anchor = HIGHLIGHT_ANCHORS[anchorKey];
    if (!anchor || (allowed && !allowed.has(anchor.target))) return null;
    const screen = NAVIGATION_TARGETS[anchor.target];
    return {
        anchor: anchorKey,
        path: screen.path,
        state: screen.state || null,
        labelKey: anchor.labelKey,
    };
};

// The "where is what" section of the system prompt. Sub-screens (the
// accounting tabs) and their buttons are only described in full while the
// person is inside that module - elsewhere they collapse to a list of keys.
// Groq's free tier caps the whole org at 8,000 tokens/minute, and a turn can
// take two model calls, so every line here is paid for twice per question.
const moduleOf = (key) => key.split(".")[0];

export const describeAppMap = ({ module, allowed = null } = {}) => {
    const lines = [];
    const collapsed = {};
    for (const [key, target] of Object.entries(NAVIGATION_TARGETS)) {
        if (allowed && !allowed.has(key)) continue;
        if (!key.includes(".") || moduleOf(key) === module) {
            lines.push(`- ${key}: ${target.description}`);
        } else {
            (collapsed[moduleOf(key)] ||= []).push(key.split(".")[1]);
        }
    }
    for (const [parent, children] of Object.entries(collapsed)) {
        lines.push(`- ${parent}.<${children.join("|")}>`);
    }
    const controls = Object.entries(CONTROL_ANCHORS)
        .filter(([, anchor]) => moduleOf(anchor.target) === module && (!allowed || allowed.has(anchor.target)))
        .map(([key, anchor]) => `- ${key} (en ${anchor.target}): ${anchor.description}`);
    let map = `PANTALLAS (claves válidas para navigate_to):\n${lines.join("\n")}`;
    if (!allowed || [...allowed].some((key) => moduleOf(key) === "accounting")) {
        map += `\n\nPARA SEÑALAR (highlight): "accounting-tab-<pestaña>" señala una pestaña de Contabilidad.`;
    }
    if (controls.length) map += ` Botones de esta sección:\n${controls.join("\n")}`;
    if (allowed && allowed.size < Object.keys(NAVIGATION_TARGETS).length) {
        map += `\n\nESTA PERSONA SOLO TIENE ACCESO A LAS PANTALLAS DE ARRIBA (según su rol en el equipo). Si lo que pide se hace en otra pantalla, explícale que su rol no la incluye y que le pida acceso al dueño de la cuenta; no le ofrezcas ir allí.`;
    }
    return map;
};

// Screen key for where the person already is, so the agent doesn't hand
// them a button to the page they're looking at.
export const currentScreenKey = ({ module, tab }) => {
    if (module && tab && NAVIGATION_TARGETS[`${module}.${tab}`]) return `${module}.${tab}`;
    return module && NAVIGATION_TARGETS[module] ? module : null;
};

// Human label for the page the user is on right now, for the prompt.
export const describeCurrentPage = ({ module, tab }) => {
    if (!module) return null;
    const key = tab ? `${module}.${tab}` : module;
    const target = NAVIGATION_TARGETS[key] || NAVIGATION_TARGETS[module];
    const where = tab ? `módulo "${module}", pestaña "${tab}"` : `módulo "${module}"`;
    return target ? `${where} (${target.description})` : where;
};
