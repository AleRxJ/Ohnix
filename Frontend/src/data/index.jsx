import {
    DatabaseOutlined,
    TeamOutlined,
    BarChartOutlined,
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
} from "@ant-design/icons";
import { Link } from "react-router-dom";

export const navLinks = [
    { name: "Features", path: "features" },
    { name: "Process", path: "process" },
    { name: "Testimonials", path: "testimonials" },
];

export const features = [
    {
        icon: <DatabaseOutlined />,
        title: "Inventory Tracking",
        description:
            "Real-time tracking of your inventory with automated updates and alerts.",
    },
    {
        icon: <BarChartOutlined />,
        title: "Advanced Analytics",
        description:
            "Gain insights with powerful reporting and visualization tools.",
    },
    {
        icon: <TeamOutlined />,
        title: "Team Collaboration",
        description:
            "Multiple user access with customizable permissions and roles.",
    },
];

export const testimonials = [
    {
        name: "Sarah Johnson",
        company: "Retail Solutions Inc.",
        content: `This inventory system has transformed how we track our products. We've reduced stockouts by 45% and improved order accuracy significantly.`,
        rating: 5,
    },
    {
        name: "Michael Chen",
        company: "Tech Distributors",
        content: `The analytics features have given us insights we never had before. We can now forecast inventory needs with impressive accuracy.`,
        rating: 5,
    },
    {
        name: "Jessica Martinez",
        company: "Global Logistics",
        content: `Implementation was smoother than expected, and the support team was there every step of the way. Highly recommend!`,
        rating: 4,
    },
];

export const steps = [
    {
        number: "1",
        title: "Sign Up for an Account",
        description:
            "Create your account in minutes and set up your inventory profiles.",
    },
    {
        number: "2",
        title: "Import Your Inventory",
        description:
            "Easily import your existing inventory data or start fresh.",
    },
    {
        number: "3",
        title: "Start Managing Efficiently",
        description:
            "Track, analyze, and optimize your inventory in real-time.",
    },
];

// canAccess(moduleKey) gates the module-scoped items below for invited team
// members with restricted roles (see TeamContext's hasPermission) - the
// owner and solo/independent users always pass every check, so this only
// ever hides items for someone acting on someone else's account. Defaults
// to "always visible" so callers that don't pass it (or aren't inside a
// team) see the full menu, same as before this existed.
export const getMenuItems = (t, role, showElectronicInvoicing = false, showTeam = false, canAccess = () => true, showSupportDocuments = false, showFiscalSetup = false, needsFiscalSetup = false) => {
    const items = [
        {
            key: "dashboard",
            moduleKey: "dashboard",
            icon: <DashboardOutlined />,
            label: <Link to="/dashboard">{t("common.dashboard")}</Link>,
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
            key: "orders",
            moduleKey: "orders",
            icon: <ShoppingCartOutlined />,
            label: <Link to="/orders">{t("common.orders")}</Link>,
        },
        ...(showElectronicInvoicing ? [{
            key: "electronic-invoices",
            moduleKey: "orders",
            icon: <FileTextOutlined />,
            label: <Link to="/electronic-invoices">{t("common.electronic_invoices_nav")}</Link>,
        }] : []),
        {
            key: "customers",
            moduleKey: "customers",
            icon: <TeamOutlined />,
            label: <Link to="/customers">{t("common.customers")}</Link>,
        },
        {
            key: "purchases",
            moduleKey: "purchases",
            icon: <ShoppingOutlined />,
            label: <Link to="/purchases">{t("common.purchases")}</Link>,
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
            key: "reports",
            moduleKey: "reports",
            icon: <BarChartOutlined />,
            label: <Link to="/reports">{t("common.reports")}</Link>,
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
            label: <Link to="/accounting">{t("common.accounting_nav")}</Link>,
        },
        ...(showTeam ? [{
            key: "team",
            icon: <UsergroupAddOutlined />,
            label: <Link to="/team">{t("common.team_nav")}</Link>,
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
