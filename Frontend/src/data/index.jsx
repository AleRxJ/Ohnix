import {
    TeamOutlined,
    BarChartOutlined,
    RadarChartOutlined,
    DashboardOutlined,
    AppstoreOutlined,
    ShoppingCartOutlined,
    ShoppingOutlined,
    UserSwitchOutlined,
    CreditCardOutlined,
    ApartmentOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    UndoOutlined,
    FileTextOutlined,
    UsergroupAddOutlined,
    CrownOutlined,
    WalletOutlined,
    BookOutlined,
    SafetyCertificateOutlined,
    ExperimentOutlined,
    TagsOutlined,
    ApiOutlined,
    CloudServerOutlined,
    BuildOutlined,
    CalculatorOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { FEATURE_MINIMUM_PLAN, PLAN_DISPLAY } from "../hooks/useSubscription";

// "Upgrade to unlock" indicator for menu items gated by subscription plan
// (not by team role - that's canAccess below). Shown instead of hiding the
// item outright: the module stays visible for discoverability (same
// "vitrina" behavior each page's own <PlanGate> already provides once you
// click through), and the badge sets the expectation up front instead of
// letting the user navigate into a paywall with no warning. Reuses the
// exact same cyan gradient + glow as .sidebar-discovery-badge (not a
// separate color) so every "live" badge in this sidebar reads as one
// consistent system, and a crown - not a padlock - because this should
// invite curiosity about the upgrade, not read as "blocked"/an error;
// CrownOutlined already carries that "subscription/plan" meaning elsewhere
// in this same file (admin-subscriptions). Positioned absolutely (see
// index.css) so it never competes with the label for flex width - an
// earlier version that shared the row's flex space clipped long labels
// like "Integraciones y API".
const LockedPlanBadge = ({ featureKey, lang }) => {
    const planKey = FEATURE_MINIMUM_PLAN[featureKey] ?? "growth";
    const planLabel = PLAN_DISPLAY[planKey]?.[lang] ?? planKey;
    const title = lang === "es" ? `Disponible desde el plan ${planLabel}` : `Available from the ${planLabel} plan`;
    return (
        <span className="sidebar-locked-badge" title={title}>
            <CrownOutlined style={{ fontSize: 10 }} />
        </span>
    );
};

// canAccess(moduleKey) gates the module-scoped items below for invited team
// members with restricted roles (see TeamContext's hasPermission) - the
// owner and solo/independent users always pass every check, so this only
// ever hides items for someone acting on someone else's account. Defaults
// to "always visible" so callers that don't pass it (or aren't inside a
// team) see the full menu, same as before this existed.
//
// can(featureKey) is the subscription-plan check (useSubscription's `can`),
// separate from canAccess above - it drives the LockedPlanBadge, never
// hides the item. Defaults to "always unlocked" so callers that don't pass
// it (or haven't resolved the plan yet) don't flash a false "locked" badge.
export const getMenuItems = (t, role, showElectronicInvoicing = false, showTeam = false, canAccess = () => true, showSupportDocuments = false, showFiscalSetup = false, needsFiscalSetup = false, openDiscoveriesCount = 0, can = () => true, lang = "es") => {
    const items = [
        {
            key: "dashboard",
            moduleKey: "dashboard",
            icon: <DashboardOutlined />,
            label: <Link to="/dashboard">{t("common.dashboard")}</Link>,
        },
        {
            key: "quotations",
            moduleKey: "purchases",
            icon: <TagsOutlined />,
            label: (
                <Link to="/quotations" className="relative flex items-center pr-4">
                    <span className="truncate" title={t("common.quotations_nav")}>{t("common.quotations_nav")}</span>
                    {!can("salesQuotations") && <LockedPlanBadge featureKey="salesQuotations" lang={lang} />}
                </Link>
            ),
        },
        {
            key: "orders",
            moduleKey: "orders",
            icon: <ShoppingCartOutlined />,
            label: <Link to="/orders">{t("common.orders")}</Link>,
        },
        {
            key: "customers",
            moduleKey: "customers",
            icon: <TeamOutlined />,
            label: <Link to="/customers">{t("common.customers")}</Link>,
        },
        {
            key: "products",
            moduleKey: "products",
            icon: <AppstoreOutlined />,
            label: <Link to="/products">{t("common.products")}</Link>,
        },
        {
            key: "categories",
            moduleKey: "categories",
            icon: <AppstoreOutlined />,
            label: <Link to="/categories">{t("common.categories")}</Link>,
        },
        {
            key: "production-orders",
            moduleKey: "products",
            icon: <BuildOutlined />,
            label: <Link to="/production-orders">{t("common.production_orders_nav")}</Link>,
        },
        {
            key: "purchases",
            moduleKey: "purchases",
            icon: <ShoppingOutlined />,
            label: <Link to="/purchases">{t("common.purchases")}</Link>,
        },
        {
            key: "warranties",
            moduleKey: "warranties",
            icon: <SafetyCertificateOutlined />,
            label: <Link to="/warranties">{t("common.warranties_nav")}</Link>,
        },
        ...(showSupportDocuments ? [{
            key: "purchase-support-documents",
            moduleKey: "purchases",
            icon: <FileTextOutlined />,
            label: <Link to="/purchase-support-documents">{t("common.purchase_support_documents_nav")}</Link>,
        }] : []),
        {
            key: "suppliers",
            moduleKey: "suppliers",
            icon: <UserSwitchOutlined />,
            label: <Link to="/suppliers">{t("common.suppliers")}</Link>,
        },
        {
            key: "payroll",
            moduleKey: "payroll",
            icon: <WalletOutlined />,
            label: <Link to="/payroll">{t("common.payroll_nav")}</Link>,
        },
        {
            key: "finance",
            moduleKey: "finance",
            icon: <WalletOutlined />,
            label: <Link to="/finance">{t("common.finance_nav")}</Link>,
        },
        {
            key: "accounting",
            moduleKey: "accounting",
            icon: <BookOutlined />,
            label: (
                <Link to="/accounting" className="relative flex items-center pr-4">
                    <span className="truncate" title={t("common.accounting_nav")}>{t("common.accounting_nav")}</span>
                    {!can("accounting") && <LockedPlanBadge featureKey="accounting" lang={lang} />}
                </Link>
            ),
        },
        ...(showElectronicInvoicing ? [{
            key: "electronic-invoices",
            moduleKey: "orders",
            icon: <FileTextOutlined />,
            label: <Link to="/electronic-invoices">{t("common.electronic_invoices_nav")}</Link>,
        }] : []),
        {
            key: "reports",
            moduleKey: "reports",
            icon: <BarChartOutlined />,
            label: <Link to="/reports">{t("common.reports")}</Link>,
        },
        {
            key: "discoveries",
            moduleKey: "reports",
            icon: <RadarChartOutlined />,
            // A live count, not a plain nav row - this is Ohnix's own
            // headline capability (findings the engine produced on its own,
            // see components/discoveries/), not a peer of the CRUD pages
            // around it, and the badge is what says so at a glance.
            label: (
                <Link to="/discoveries" className="relative flex items-center pr-4">
                    <span className="truncate" title={t("common.discoveries_nav")}>{t("common.discoveries_nav")}</span>
                    {!can("discoveryEngine") ? (
                        <LockedPlanBadge featureKey="discoveryEngine" lang={lang} />
                    ) : (
                        openDiscoveriesCount > 0 && (
                            <span className="sidebar-discovery-badge">{openDiscoveriesCount > 9 ? "9+" : openDiscoveriesCount}</span>
                        )
                    )}
                </Link>
            ),
        },
        ...(showTeam ? [{
            key: "team",
            icon: <UsergroupAddOutlined />,
            label: <Link to="/team">{t("common.team_nav")}</Link>,
        }] : []),
        // Same gate as billing (moduleKey filter below) - API keys/
        // integrations/webhooks are account-wide, owner-only, same as
        // billing itself (see App.jsx#RequireBillingAccess).
        {
            key: "integrations",
            moduleKey: "billing",
            icon: <ApiOutlined />,
            label: (
                <Link to="/integrations" className="relative flex items-center pr-4">
                    <span className="truncate" title={t("common.integrations_nav")}>{t("common.integrations_nav")}</span>
                    {!can("apiAccess") && <LockedPlanBadge featureKey="apiAccess" lang={lang} />}
                </Link>
            ),
        },
        ...(showFiscalSetup ? [{
            key: "fiscal-setup",
            icon: <SafetyCertificateOutlined />,
            label: (
                <Link to="/fiscal-setup" className="flex items-center justify-between gap-2">
                    <span>{t("common.fiscal_setup_nav")}</span>
                    {needsFiscalSetup && (
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FFCF70] opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FFCF70]" />
                        </span>
                    )}
                </Link>
            ),
        }] : []),
        {
            key: "billing",
            moduleKey: "billing",
            icon: <CreditCardOutlined />,
            label: <Link to="/billing">{t("common.billing")}</Link>,
        },
    ]
        .filter((item) => !item.moduleKey || canAccess(item.moduleKey))
        // moduleKey is only for the permission filter above - antd's Menu
        // items don't recognize it, and any unrecognized property on an
        // items-array entry gets spread straight onto the rendered <li> as
        // a DOM attribute, which is what triggered React's "does not
        // recognize the `moduleKey` prop on a DOM element" warning.
        .map((item) => {
            const menuItem = { ...item };
            delete menuItem.moduleKey;
            return menuItem;
        });

    if (role === "admin") {
        // Keys are "admin-<second path segment>" on purpose - DashboardLayout.jsx
        // derives its selectedKeys/document-title lookup the same way for
        // every /admin/* route, so a bare "admin" key here would never
        // actually get selected (every /admin/* path collapses to that
        // prefix) and this whole submenu would silently never highlight.
        items.push({
            key: "admin-management",
            icon: <ApartmentOutlined />,
            label: <Link to="/admin/management">{t("common.admin_panel")}</Link>,
        });
        items.push({
            key: "admin-subscriptions",
            icon: <CrownOutlined />,
            label: <Link to="/admin/subscriptions">{t("common.admin_subscriptions")}</Link>,
        });
        items.push({
            key: "admin-firmapass-validations",
            icon: <SafetyCertificateOutlined />,
            label: <Link to="/admin/firmapass-validations">{t("common.admin_firmapass_validations")}</Link>,
        });
        items.push({
            key: "admin-certificate-orders",
            // Distinct from admin-firmapass-validations right above (which
            // uses SafetyCertificateOutlined too) - two adjacent identical
            // icons in the same submenu read as one item at a glance. This
            // page is about CertificateOrder payments/expirations, so the
            // billing-flavored icon (same one "billing" uses above) fits.
            icon: <CreditCardOutlined />,
            label: <Link to="/admin/certificate-orders">{t("common.admin_certificate_orders")}</Link>,
        });
        items.push({
            key: "admin-api-clients",
            // Companies with no Ohnix account calling itcycle-api-dian
            // directly via their own API key - distinct concept from every
            // other item in this submenu (all of which are about Ohnix's
            // own tenants), so it gets its own icon.
            icon: <CloudServerOutlined />,
            label: <Link to="/admin/api-clients">{t("common.admin_api_clients")}</Link>,
        });
        items.push({
            key: "admin-dian-test-matrix",
            icon: <ExperimentOutlined />,
            label: <Link to="/admin/dian-test-matrix">{t("common.admin_dian_test_matrix")}</Link>,
        });
        items.push({
            key: "admin-income-tax-config",
            icon: <CalculatorOutlined />,
            label: <Link to="/admin/income-tax-config">{t("common.admin_income_tax_config")}</Link>,
        });
    }

    return items;
};

export const getStatusIcon = (status) => {
    const icons = {
        pending: <ClockCircleOutlined />,
        processing: <ClockCircleOutlined />,
        completed: <CheckCircleOutlined />,
        cancelled: <ClockCircleOutlined />,
        returned: <UndoOutlined />,
    };
    return icons[status];
};

export const getStatusIconPurchase = (status) => {
    switch (status) {
        case "pending":
            return <ClockCircleOutlined />;
        case "completed":
            return <CheckCircleOutlined />;
        case "returned":
            return <UndoOutlined />;
        default:
            return null;
    }
};
