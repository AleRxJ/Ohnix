import React, { Suspense, lazy, useContext, useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config.js";
import { Toaster, toast } from "react-hot-toast";
import useI18n from "./hooks/useI18n";
import { AuthProvider } from "./context/AuthContext";
import AuthContext from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ThemeProvider } from "./context/ThemeContext";
import { TeamProvider, useTeam } from "./context/TeamContext";
import { DiscoveryProvider } from "./context/DiscoveryContext";
import { InventoryTourProvider } from "./context/InventoryTourContext";
import ProtectedRoute, { GuestRoute } from "./components/ProtectedRoute";
import OfflineGate from "./components/common/OfflineGate";
import { ELECTRONIC_INVOICING_ENABLED } from "./config/features";
import { isPublicMarketingPath } from "./utils/publicPaths.js";
import { waitForStylesheets } from "./utils/waitForStylesheets.js";

// main.jsx picks exactly one CSS bundle (marketingStyles.js, no antd, for
// PUBLIC_PATHS - or the full appStyles.js otherwise) based on whichever URL
// the tab first loaded, and never revisits that choice - there's no reason
// to, for a fresh full page load. But react-router's client-side navigation
// doesn't reload the page or re-run main.jsx, so a visitor who lands on "/"
// (marketingStyles only) and then clicks through to e.g. "/login" or
// "/dashboard" keeps running with zero antd CSS loaded - every antd
// component on that route renders completely unstyled.
//
// Watching the route here and lazily loading whichever bundle wasn't picked
// at boot, the first time the visitor actually crosses into that other
// zone, fixes the missing styles - but the import (and the stylesheet
// download behind it) still takes a beat. Rendering `children` immediately
// during that beat means the new route paints once unstyled and again once
// the CSS lands - the "ugly flash then it fixes itself" this component
// exists to remove. Holding `children` back behind the same loading
// fallback already used for lazy route chunks (below) until the stylesheet
// has actually loaded avoids that second, wrong paint entirely.
const loadedStyleBundles = new Set();
const StyleBundleGate = ({ children }) => {
    const { pathname } = useLocation();
    const isFirstRun = useRef(true);
    // Starts true: main.jsx's own boot sequence already awaited
    // waitForStylesheets() for the initial bundle before React ever mounted,
    // so the very first render has nothing to wait on here.
    const [ready, setReady] = useState(true);

    useEffect(() => {
        const key = isPublicMarketingPath(pathname) ? "marketing" : "app";
        if (isFirstRun.current) {
            // main.jsx already loaded (and waited on) the right bundle for
            // this exact pathname before React even mounted.
            isFirstRun.current = false;
            loadedStyleBundles.add(key);
            return;
        }
        if (loadedStyleBundles.has(key)) return;
        let cancelled = false;
        setReady(false);
        const stylesheetReady = key === "marketing" ? import("./marketingStyles.js") : import("./appStyles.js");
        stylesheetReady.then(waitForStylesheets).then(() => {
            if (cancelled) return;
            loadedStyleBundles.add(key);
            setReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    return ready ? children : <RouteLoadingFallback />;
};

// main.jsx flags window.__ohnixSwUpdated (and fires this event) once a new
// Service Worker has taken control of the tab, instead of reloading on its
// own - an unannounced window.location.reload() could wipe out whatever the
// visitor is in the middle of (a half-filled order, an open modal). This
// shows the same kind of "new version available" toast Slack/Notion/VS Code
// web use, and only reloads when the visitor actually clicks it.
const UpdateToast = () => {
    const { t } = useI18n();
    useEffect(() => {
        const showToast = () => {
            toast((tst) => (
                <div className="flex items-center gap-3">
                    <span>{t("common.new_version_available")}</span>
                    <button
                        type="button"
                        onClick={() => {
                            toast.dismiss(tst.id);
                            window.location.reload();
                        }}
                        className="rounded-full bg-[var(--ohnix-accent,#29D8D5)] px-3 py-1 text-xs font-semibold text-black"
                    >
                        {t("common.reload")}
                    </button>
                </div>
            ), { duration: Infinity, id: "ohnix-sw-update" });
        };
        if (window.__ohnixSwUpdated) showToast();
        window.addEventListener("ohnix:sw-updated", showToast);
        return () => window.removeEventListener("ohnix:sw-updated", showToast);
    }, [t]);
    return null;
};

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
const FacturacionSinInventario = lazy(() => import("./pages/FacturacionSinInventario"));
const CertificadosDigitales = lazy(() => import("./pages/CertificadosDigitales"));
const OhnixVsAlegra = lazy(() => import("./pages/OhnixVsAlegra"));
const ColaboracionEquipo = lazy(() => import("./pages/ColaboracionEquipo"));
const DeteccionRiesgosNegocio = lazy(() => import("./pages/DeteccionRiesgosNegocio"));
const Integraciones = lazy(() => import("./pages/Integraciones"));
const ProfilePage = lazy(() => import("./components/ProfilePage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardLayout = lazy(() => import("./components/layout/DashboardLayout"));
const Products = lazy(() => import("./pages/Products"));
const ProductionOrders = lazy(() => import("./pages/ProductionOrders"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Orders = lazy(() => import("./pages/Orders"));
const Purchase = lazy(() => import("./pages/Purchase"));
const Warranties = lazy(() => import("./pages/Warranties"));
const Quotations = lazy(() => import("./pages/Quotations"));
const SalesQuotations = lazy(() => import("./pages/SalesQuotations"));
const PublicSalesQuotation = lazy(() => import("./pages/PublicSalesQuotation"));
const Customers = lazy(() => import("./pages/Customers"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Category = lazy(() => import("./pages/Category"));
const Reports = lazy(() => import("./pages/Reports"));
const Discoveries = lazy(() => import("./pages/Discoveries"));
const Billing = lazy(() => import("./pages/Billing"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Finance = lazy(() => import("./pages/Finance"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const Accounting = lazy(() => import("./pages/Accounting"));
const AdminManagement = lazy(() => import("./pages/AdminManagement"));
const AdminSubscriptions = lazy(() => import("./pages/AdminSubscriptions"));
const AdminFirmaPassValidations = lazy(() => import("./pages/AdminFirmaPassValidations"));
const AdminCertificateOrders = lazy(() => import("./pages/AdminCertificateOrders"));
const AdminApiClients = lazy(() => import("./pages/AdminApiClients"));
const AdminDianTestMatrix = lazy(() => import("./pages/AdminDianTestMatrix"));
const AdminIncomeTaxConfig = lazy(() => import("./pages/AdminIncomeTaxConfig"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const EpaycoCheckout = lazy(() => import("./pages/EpaycoCheckout"));
const CardCheckout = lazy(() => import("./pages/CardCheckout"));
const EpaycoResponseRedirect = lazy(() => import("./pages/EpaycoResponseRedirect"));
const ElectronicInvoices = lazy(() => import("./pages/ElectronicInvoices"));
const PurchaseSupportDocuments = lazy(() => import("./pages/PurchaseSupportDocuments"));
const FiscalSetup = lazy(() => import("./pages/FiscalSetup"));
const CertificateOrderCheckout = lazy(() => import("./pages/CertificateOrderCheckout"));
const CertificateOrderPaymentResponse = lazy(() => import("./pages/CertificateOrderPaymentResponse"));
const Team = lazy(() => import("./pages/Team"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const EnrollApiBilling = lazy(() => import("./pages/EnrollApiBilling"));

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
    // Unlike ColombiaInvoiceRoute/SupportDocumentRoute (which gate an action
    // on an ALREADY-Colombian company), this page's whole purpose is often to
    // set the company's country for the first time - registerUser never
    // creates a Company row, so a brand-new owner has no company yet at all.
    // Requiring countryCode === "CO" up front would permanently lock that
    // owner out of the one page that lets them set it. Only a company that
    // already exists with a DIFFERENT country blocks entry.
    const companyIsColombianOrUnset = !user?.company || user.company.countryCode === "CO";
    return !isTeamMember && companyIsColombianOrUnset
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
// Discoveries piggybacks on the "reports" module permission, same as its
// backend route (see Backend/routes/discovery.routes.js's own comment) -
// not an independently grantable module.
const RequireDiscoveriesAccess = requireModuleAccess("reports");
const RequireProductsAccess = requireModuleAccess("products");
const RequireOrdersAccess = requireModuleAccess("orders");
const RequirePurchasesAccess = requireModuleAccess("purchases");
const RequireWarrantiesAccess = requireModuleAccess("warranties");
const RequireCustomersAccess = requireModuleAccess("customers");
const RequireSuppliersAccess = requireModuleAccess("suppliers");
const RequireCategoriesAccess = requireModuleAccess("categories");
const RequireFinanceAccess = requireModuleAccess("finance");
const RequireAccountingAccess = requireModuleAccess("accounting");
const RequirePayrollAccess = requireModuleAccess("payroll");

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
                        <DiscoveryProvider>
                        <UpdateToast />
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
                        <StyleBundleGate>
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
                            {ELECTRONIC_INVOICING_ENABLED && (
                                <Route path="/facturacion-electronica-sin-inventario" element={<FacturacionSinInventario />} />
                            )}
                            {ELECTRONIC_INVOICING_ENABLED && (
                                <Route path="/certificado-digital-dian" element={<CertificadosDigitales />} />
                            )}
                            <Route path="/comparativa/ohnix-vs-alegra" element={<OhnixVsAlegra />} />
                            <Route path="/colaboracion-en-equipo" element={<ColaboracionEquipo />} />
                            <Route path="/deteccion-riesgos-oportunidades-negocio" element={<DeteccionRiesgosNegocio />} />
                            <Route path="/integraciones" element={<Integraciones />} />
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
                            <Route path="/public/sales-quotations/:token" element={<PublicSalesQuotation />} />
                            {/* Public card enrollment for an external API client's
                                automatic recurring billing - the token itself is the
                                credential, no ProtectedRoute wrapper (the enrollee has
                                no Ohnix account at all). */}
                            <Route path="/api-clients/enroll-billing/:token" element={<EnrollApiBilling />} />

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
                                <Route path="production-orders" element={<RequireProductsAccess><ProductionOrders /></RequireProductsAccess>} />
                                <Route path="payroll" element={<RequirePayrollAccess><Payroll /></RequirePayrollAccess>} />
                                <Route path="orders" element={<RequireOrdersAccess><Orders /></RequireOrdersAccess>} />
                                <Route path="electronic-invoices" element={<ColombiaInvoiceRoute><ElectronicInvoices /></ColombiaInvoiceRoute>} />
                                <Route path="purchase-support-documents" element={<SupportDocumentRoute><PurchaseSupportDocuments /></SupportDocumentRoute>} />
                                <Route path="purchases" element={<RequirePurchasesAccess><Purchase /></RequirePurchasesAccess>} />
                                <Route path="warranties" element={<RequireWarrantiesAccess><Warranties /></RequireWarrantiesAccess>} />
                                <Route path="quotations" element={<RequirePurchasesAccess><Quotations /></RequirePurchasesAccess>} />
                                <Route path="sales-quotations" element={<Navigate to="/quotations?type=sales" replace />} />
                                <Route path="customers" element={<RequireCustomersAccess><Customers /></RequireCustomersAccess>} />
                                <Route path="suppliers" element={<RequireSuppliersAccess><Suppliers /></RequireSuppliersAccess>} />
                                <Route path="categories" element={<RequireCategoriesAccess><Category /></RequireCategoriesAccess>} />
                                <Route path="reports/*" element={<RequireReportsAccess><Reports /></RequireReportsAccess>} />
                                <Route path="discoveries" element={<RequireDiscoveriesAccess><Discoveries /></RequireDiscoveriesAccess>} />
                                <Route path="finance" element={<RequireFinanceAccess><Finance /></RequireFinanceAccess>} />
                                <Route path="finance/reconciliation" element={<RequireFinanceAccess><OfflineGate><BankReconciliation /></OfflineGate></RequireFinanceAccess>} />
                                <Route path="accounting" element={<RequireAccountingAccess><OfflineGate><Accounting /></OfflineGate></RequireAccountingAccess>} />
                                <Route path="team" element={<OfflineGate><Team /></OfflineGate>} />
                                <Route path="billing" element={<RequireBillingAccess><OfflineGate><Billing /></OfflineGate></RequireBillingAccess>} />
                                {/* Same owner-only gate as Billing (see RequireBillingAccess's comment) -
                                    API keys/integrations/webhooks are account-wide credentials/config,
                                    blocked for team members at the backend too (blockTeamMembers). */}
                                <Route path="integrations" element={<RequireBillingAccess><OfflineGate><Integrations /></OfflineGate></RequireBillingAccess>} />
                                <Route path="billing/payment-success" element={<RequireBillingAccess><PaymentSuccess /></RequireBillingAccess>} />
                                <Route path="billing/epayco-checkout" element={<RequireBillingAccess><EpaycoCheckout /></RequireBillingAccess>} />
                                <Route path="billing/card-checkout" element={<RequireBillingAccess><OfflineGate><CardCheckout /></OfflineGate></RequireBillingAccess>} />
                                <Route path="billing/epayco-response" element={<RequireBillingAccess><EpaycoResponseRedirect /></RequireBillingAccess>} />
                                <Route path="admin/management" element={<AdminManagement />} />
                                <Route path="admin/subscriptions" element={<AdminSubscriptions />} />
                                <Route path="admin/firmapass-validations" element={<AdminFirmaPassValidations />} />
                                <Route path="admin/certificate-orders" element={<AdminCertificateOrders />} />
                                <Route path="admin/api-clients" element={<AdminApiClients />} />
                                <Route path="admin/dian-test-matrix" element={<AdminDianTestMatrix />} />
                                <Route path="admin/income-tax-config" element={<AdminIncomeTaxConfig />} />
                            </Route>

                            {/* Fiscal setup (including the certificate checkout) deliberately does NOT
                                require email verification: the certificate's own identity check
                                (FirmaPass/Viafirma, a real ID document) is already a stronger identity
                                proof than an email click, so gating it behind requireVerified too just
                                adds friction without adding safety. This also lets the guest-checkout
                                flow (CertificadosDigitales.jsx) land a freshly auto-logged-in,
                                not-yet-email-verified account straight on this page. Sibling route
                                group (not nested in the requireVerified block above) so every other
                                dashboard route keeps its exact existing gating. */}
                            <Route
                                path="/"
                                element={
                                    <ProtectedRoute>
                                        <DashboardLayout />
                                    </ProtectedRoute>
                                }
                            >
                                <Route path="fiscal-setup" element={<RequireFiscalSetupAccess><FiscalSetup /></RequireFiscalSetupAccess>} />
                                <Route path="fiscal-setup/certificate-checkout" element={<RequireFiscalSetupAccess><CertificateOrderCheckout /></RequireFiscalSetupAccess>} />
                                <Route path="fiscal-setup/certificate-payment-response" element={<RequireFiscalSetupAccess><CertificateOrderPaymentResponse /></RequireFiscalSetupAccess>} />
                            </Route>

                            {/* catch all - uses antd (Result/Button), stays inside AntdRoutesLayout */}
                            <Route path="/*" element={<ErrorPage />} />
                            </Route>
                            </Routes>
                        </div>
                        </StyleBundleGate>
                        </Suspense>
                        </DiscoveryProvider>
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
