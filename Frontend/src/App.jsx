import React, { Suspense, lazy, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config.js";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import AuthContext from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { TeamProvider, useTeam } from "./context/TeamContext";
import { InventoryTourProvider } from "./context/InventoryTourContext";
import ProtectedRoute, { GuestRoute } from "./components/ProtectedRoute";
import { ELECTRONIC_INVOICING_ENABLED } from "./config/features";

// Lazy: ErrorPage uses antd (Result/Button) - same reasoning as
// AntdConfigProvider below, a static import here would defeat the
// vendor-antd split by bundling it into App.jsx's always-loaded chunk.
const ErrorPage = lazy(() => import("./components/error/ErrorPage"));

// Lazy, not a static import: a regular `import` here would bundle antd into
// App.jsx's own chunk, which is always loaded first - defeating the point
// of splitting "vendor-antd" out in vite.config.js. Lazy-loading it means
// its module (and antd) is only fetched once AntdRoutesLayout actually
// renders, i.e. once a non-marketing route is hit.
const AntdConfigProvider = lazy(() => import("./components/common/AntdConfigProvider"));

const Login = lazy(() => import("./pages/auth/Login"));
const EmailVerify = lazy(() => import("./pages/auth/EmailVerify"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const Signup = lazy(() => import("./pages/auth/Signup"));
const SignupRequestStatus = lazy(() => import("./pages/auth/SignupRequestStatus"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Demo = lazy(() => import("./pages/Demo"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Precios = lazy(() => import("./pages/Precios"));
const SoftwareInventarioPymes = lazy(() => import("./pages/SoftwareInventarioPymes"));
const FacturacionElectronica = lazy(() => import("./pages/FacturacionElectronica"));
const OhnixVsAlegra = lazy(() => import("./pages/OhnixVsAlegra"));
const ColaboracionEquipo = lazy(() => import("./pages/ColaboracionEquipo"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardLayout = lazy(() => import("./components/layout/DashboardLayout"));
const Products = lazy(() => import("./pages/Products"));
const Orders = lazy(() => import("./pages/Orders"));
const Purchase = lazy(() => import("./pages/Purchase"));
const Customers = lazy(() => import("./pages/Customers"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Category = lazy(() => import("./pages/Category"));
const Reports = lazy(() => import("./pages/Reports"));
const Billing = lazy(() => import("./pages/Billing"));
const Finance = lazy(() => import("./pages/Finance"));
const Accounting = lazy(() => import("./pages/Accounting"));
const AdminManagement = lazy(() => import("./pages/AdminManagement"));
const AdminSubscriptions = lazy(() => import("./pages/AdminSubscriptions"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const EpaycoCheckout = lazy(() => import("./pages/EpaycoCheckout"));
const EpaycoResponseRedirect = lazy(() => import("./pages/EpaycoResponseRedirect"));
const ElectronicInvoices = lazy(() => import("./pages/ElectronicInvoices"));
const PurchaseSupportDocuments = lazy(() => import("./pages/PurchaseSupportDocuments"));
const FiscalSetup = lazy(() => import("./pages/FiscalSetup"));
const Team = lazy(() => import("./pages/Team"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));

const RouteLoadingFallback = () => (
    <div className="min-h-screen bg-[var(--ohnix-bg)] flex items-center justify-center text-sm text-[var(--ohnix-text-muted)]">
        Cargando pagina...
    </div>
);

const ColombiaInvoiceRoute = ({ children }) => {
    const { user, loading } = useContext(AuthContext);
    const { hasPermission, loading: teamLoading } = useTeam();
    if (!ELECTRONIC_INVOICING_ENABLED) return <Navigate to="/dashboard" replace />;
    if (loading || teamLoading) return <RouteLoadingFallback />;
    return user?.company?.countryCode === "CO" && hasPermission("orders", "view")
        ? children
        : <Navigate to="/dashboard" replace />;
};

// Documento Soporte is itcycle-api-dian only (no Factus/Alanube equivalent),
// unlike sales invoicing which spans all 3 providers - same gate as
// ColombiaInvoiceRoute plus electronicInvoicingProvider === "itcycle", and
// "purchases" permission instead of "orders".
const SupportDocumentRoute = ({ children }) => {
    const { user, loading } = useContext(AuthContext);
    const { hasPermission, loading: teamLoading } = useTeam();
    if (!ELECTRONIC_INVOICING_ENABLED) return <Navigate to="/dashboard" replace />;
    if (loading || teamLoading) return <RouteLoadingFallback />;
    return user?.company?.countryCode === "CO"
        && user?.company?.electronicInvoicingProvider === "itcycle"
        && hasPermission("purchases", "view")
        ? children
        : <Navigate to="/dashboard" replace />;
};

// Billing is owner-only by default (a member needs an explicit billing:view
// grant) - the nav link is already hidden for everyone else (data.jsx), this
// is the same rule enforced at the route level so a direct URL visit can't
// land on a page whose API calls will just 403.
const RequireBillingAccess = ({ children }) => {
    const { loading: authLoading } = useContext(AuthContext);
    const { isOwner, hasPermission, loading: teamLoading } = useTeam();
    if (authLoading || teamLoading) return <RouteLoadingFallback />;
    return isOwner || hasPermission("billing", "view")
        ? children
        : <Navigate to="/dashboard" replace />;
};

// Fiscal configuration is account-wide: it belongs to the business owner,
// not to a team role. Solo customers are owners too, so this deliberately
// does not require a Team to exist. Same ELECTRONIC_INVOICING_ENABLED +
// countryCode "CO" gate every other DIAN surface in this app already uses
// (ColombiaInvoiceRoute, SupportDocumentRoute) - itcycle-api-dian is a
// Colombia-only concept, and the whole DIAN surface stays dark platform-wide
// until that flag flips, this route is no exception.
const RequireFiscalSetupAccess = ({ children }) => {
    const { user, loading: authLoading } = useContext(AuthContext);
    const { isTeamMember, loading: teamLoading } = useTeam();
    if (!ELECTRONIC_INVOICING_ENABLED) return <Navigate to="/dashboard" replace />;
    if (authLoading || teamLoading) return <RouteLoadingFallback />;
    return !isTeamMember && user?.company?.countryCode === "CO"
        ? children
        : <Navigate to="/dashboard" replace />;
};

// Same reasoning as RequireBillingAccess, generalized: every module nav
// link is already hidden for a member whose role has no access to it
// (data.jsx), but nothing stopped a direct URL visit from landing on the
// page anyway - it would just fetch, get a 403 per request, and render an
// empty table full of error toasts. This closes that gap for any module.
const requireModuleAccess = (moduleKey) => ({ children }) => {
    const { loading: authLoading } = useContext(AuthContext);
    const { hasPermission, loading: teamLoading } = useTeam();
    if (authLoading || teamLoading) return <RouteLoadingFallback />;
    return hasPermission(moduleKey, "view")
        ? children
        : <Navigate to="/dashboard" replace />;
};
const RequireReportsAccess = requireModuleAccess("reports");
const RequireProductsAccess = requireModuleAccess("products");
const RequireOrdersAccess = requireModuleAccess("orders");
const RequirePurchasesAccess = requireModuleAccess("purchases");
const RequireCustomersAccess = requireModuleAccess("customers");
const RequireSuppliersAccess = requireModuleAccess("suppliers");
const RequireCategoriesAccess = requireModuleAccess("categories");
const RequireFinanceAccess = requireModuleAccess("finance");
const RequireAccountingAccess = requireModuleAccess("accounting");

// AntdConfigProvider pulls in the whole "vendor-antd" chunk (see
// vite.config.js) - the marketing pages below (LandingPage, Precios, Demo,
// SoftwareInventarioPymes, OhnixVsAlegra, Blog, BlogPost, and their shared
// Navbar/Footer) don't use any antd components anymore, so this layout
// route wraps only the routes that still do (auth pages, the authenticated
// app). Marketing routes are siblings outside it and never fetch that chunk.
const AntdRoutesLayout = () => (
    <AntdConfigProvider>
        <Outlet />
    </AntdConfigProvider>
);

function App() {
    return (
        <I18nextProvider i18n={i18n}>
            <CurrencyProvider>
                <AuthProvider>
                    <ThemeProvider>
                    <InventoryTourProvider>
                    <BrowserRouter>
                        <TeamProvider>
                        <Toaster
                            position="top-right"
                            toastOptions={{
                                duration: 4000,
                                style: {
                                    background: "var(--ohnix-surface-card)",
                                    color: "var(--ohnix-text-primary)",
                                    border: "1px solid var(--ohnix-line-4)",
                                    borderRadius: "12px",
                                    boxShadow: "var(--ohnix-shadow-elevated)",
                                    fontSize: "14px",
                                    padding: "12px 16px",
                                },
                                success: {
                                    iconTheme: { primary: "#29D8D5", secondary: "#021314" },
                                    style: { border: "1px solid rgba(41,216,213,0.35)" },
                                },
                                error: {
                                    iconTheme: { primary: "#fb7185", secondary: "#ffffff" },
                                    style: { border: "1px solid rgba(251,113,133,0.35)" },
                                },
                                loading: {
                                    iconTheme: { primary: "#7C6AF7", secondary: "var(--ohnix-surface)" },
                                },
                            }}
                        />
                        <Suspense fallback={<RouteLoadingFallback />}>
                        <div>
                            <Routes>
                            {/* Public marketing routes - no antd usage, kept outside AntdRoutesLayout */}
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/precios" element={<Precios />} />
                            <Route path="/blog" element={<Blog />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/software-inventario-pymes" element={<SoftwareInventarioPymes />} />
                            {ELECTRONIC_INVOICING_ENABLED && (
                                <Route path="/facturacion-electronica-dian" element={<FacturacionElectronica />} />
                            )}
                            <Route path="/comparativa/ohnix-vs-alegra" element={<OhnixVsAlegra />} />
                            <Route path="/colaboracion-en-equipo" element={<ColaboracionEquipo />} />
                            <Route path="/demo" element={<Demo />} />

                            {/* Everything below uses antd components (Form, Table, etc.) */}
                            <Route element={<AntdRoutesLayout />}>
                            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
                            <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
                            <Route path="/signup/request-status" element={<SignupRequestStatus />} />
                            <Route
                                path="/reset-password"
                                element={<ResetPassword />}
                            />
                            {/* Public onboarding for an invited teammate - the token
                                itself is the credential, no ProtectedRoute wrapper. */}
                            <Route path="/team/invite/:token" element={<AcceptInvitation />} />

                            {/* Email verification route (protected, but doesn't require verification) */}
                            <Route
                                path="/email-verify"
                                element={
                                    <ProtectedRoute requireVerified={false}>
                                        <EmailVerify />
                                    </ProtectedRoute>
                                }
                            />
                            {/* Profile page (protected) */}
                            <Route
                                path="/profile"
                                element={
                                    <ProtectedRoute>
                                        <ProfilePage />
                                    </ProtectedRoute>
                                }
                            />

                            {/* Dashboard and related routes */}
                            <Route
                                path="/"
                                element={
                                    <ProtectedRoute requireVerified>
                                        <DashboardLayout />
                                    </ProtectedRoute>
                                }
                            >
                                <Route path="dashboard" element={<Dashboard />} />
                                <Route path="products" element={<RequireProductsAccess><Products /></RequireProductsAccess>} />
                                <Route path="orders" element={<RequireOrdersAccess><Orders /></RequireOrdersAccess>} />
                                <Route path="electronic-invoices" element={<ColombiaInvoiceRoute><ElectronicInvoices /></ColombiaInvoiceRoute>} />
                                <Route path="purchase-support-documents" element={<SupportDocumentRoute><PurchaseSupportDocuments /></SupportDocumentRoute>} />
                                <Route path="purchases" element={<RequirePurchasesAccess><Purchase /></RequirePurchasesAccess>} />
                                <Route path="customers" element={<RequireCustomersAccess><Customers /></RequireCustomersAccess>} />
                                <Route path="suppliers" element={<RequireSuppliersAccess><Suppliers /></RequireSuppliersAccess>} />
                                <Route path="categories" element={<RequireCategoriesAccess><Category /></RequireCategoriesAccess>} />
                                <Route path="reports/*" element={<RequireReportsAccess><Reports /></RequireReportsAccess>} />
                                <Route path="finance" element={<RequireFinanceAccess><Finance /></RequireFinanceAccess>} />
                                <Route path="accounting" element={<RequireAccountingAccess><Accounting /></RequireAccountingAccess>} />
                                <Route path="fiscal-setup" element={<RequireFiscalSetupAccess><FiscalSetup /></RequireFiscalSetupAccess>} />
                                <Route path="team" element={<Team />} />
                                <Route path="billing" element={<RequireBillingAccess><Billing /></RequireBillingAccess>} />
                                <Route path="billing/payment-success" element={<RequireBillingAccess><PaymentSuccess /></RequireBillingAccess>} />
                                <Route path="billing/epayco-checkout" element={<RequireBillingAccess><EpaycoCheckout /></RequireBillingAccess>} />
                                <Route path="billing/epayco-response" element={<RequireBillingAccess><EpaycoResponseRedirect /></RequireBillingAccess>} />
                                <Route path="admin/management" element={<AdminManagement />} />
                                <Route path="admin/subscriptions" element={<AdminSubscriptions />} />
                            </Route>

                            {/* catch all - uses antd (Result/Button), stays inside AntdRoutesLayout */}
                            <Route path="/*" element={<ErrorPage />} />
                            </Route>
                            </Routes>
                        </div>
                        </Suspense>
                        </TeamProvider>
                    </BrowserRouter>
                    </InventoryTourProvider>
                    </ThemeProvider>
                </AuthProvider>
            </CurrencyProvider>
        </I18nextProvider>
    );
}

export default App;
