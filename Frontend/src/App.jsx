import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config.js";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import AntdConfigProvider from "./components/common/AntdConfigProvider";
import ProtectedRoute, { GuestRoute } from "./components/ProtectedRoute";
import ErrorPage from "./components/error/ErrorPage";

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

const RouteLoadingFallback = () => (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-sm text-[#A9B3B8]">
        Cargando pagina...
    </div>
);

function App() {
    return (
        <I18nextProvider i18n={i18n}>
            <CurrencyProvider>
                <AuthProvider>
                    <AntdConfigProvider>
                    <BrowserRouter>
                        <Toaster />
                        <Suspense fallback={<RouteLoadingFallback />}>
                        <div>
                            <Routes>
                            {/* Public routes */}
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/precios" element={<Precios />} />
                            <Route path="/blog" element={<Blog />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/software-inventario-pymes" element={<SoftwareInventarioPymes />} />
                            <Route path="/comparativa/ohnix-vs-alegra" element={<OhnixVsAlegra />} />
                            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
                            <Route path="/demo" element={<Demo />} />
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
                                    <ProtectedRoute>
                                        <DashboardLayout />
                                    </ProtectedRoute>
                                }
                            >
                                <Route path="dashboard" element={<Dashboard />} />
                                <Route path="products" element={<Products />} />
                                <Route path="orders" element={<Orders />} />
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

                            {/* catch all */}
                            <Route path="/*" element={<ErrorPage />} />
                            </Routes>
                        </div>
                        </Suspense>
                    </BrowserRouter>
                    </AntdConfigProvider>
                </AuthProvider>
            </CurrencyProvider>
        </I18nextProvider>
    );
}

export default App;
