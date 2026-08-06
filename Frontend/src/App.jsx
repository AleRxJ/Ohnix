import React, { Suspense, lazy, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config.js";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import AuthContext from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import ProtectedRoute, { GuestRoute } from "./components/ProtectedRoute";

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
const OhnixVsAlegra = lazy(() => import("./pages/OhnixVsAlegra"));
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
const AdminManagement = lazy(() => import("./pages/AdminManagement"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const EpaycoCheckout = lazy(() => import("./pages/EpaycoCheckout"));
const ElectronicInvoices = lazy(() => import("./pages/ElectronicInvoices"));

const RouteLoadingFallback = () => (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-sm text-[#A9B3B8]">
        Cargando pagina...
    </div>
);

const ColombiaInvoiceRoute = ({ children }) => {
    const { user, loading } = useContext(AuthContext);
    if (loading) return <RouteLoadingFallback />;
    return user?.company?.countryCode === "CO"
        ? children
        : <Navigate to="/dashboard" replace />;
};

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
                    <BrowserRouter>
                        <Toaster />
                        <Suspense fallback={<RouteLoadingFallback />}>
                        <div>
                            <Routes>
                            {/* Public marketing routes - no antd usage, kept outside AntdRoutesLayout */}
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/precios" element={<Precios />} />
                            <Route path="/blog" element={<Blog />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/software-inventario-pymes" element={<SoftwareInventarioPymes />} />
                            <Route path="/comparativa/ohnix-vs-alegra" element={<OhnixVsAlegra />} />
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
                                <Route path="products" element={<Products />} />
                                <Route path="orders" element={<Orders />} />
                                <Route path="electronic-invoices" element={<ColombiaInvoiceRoute><ElectronicInvoices /></ColombiaInvoiceRoute>} />
                                <Route path="purchases" element={<Purchase />} />
                                <Route path="customers" element={<Customers />} />
                                <Route path="suppliers" element={<Suppliers />} />
                                <Route path="categories" element={<Category />} />
                                <Route path="reports/*" element={<Reports />} />
                                <Route path="billing" element={<Billing />} />
                                <Route path="billing/payment-success" element={<PaymentSuccess />} />
                                <Route path="billing/epayco-checkout" element={<EpaycoCheckout />} />
                                <Route path="admin/management" element={<AdminManagement />} />
                            </Route>

                            {/* catch all - uses antd (Result/Button), stays inside AntdRoutesLayout */}
                            <Route path="/*" element={<ErrorPage />} />
                            </Route>
                            </Routes>
                        </div>
                        </Suspense>
                    </BrowserRouter>
                </AuthProvider>
            </CurrencyProvider>
        </I18nextProvider>
    );
}

export default App;
