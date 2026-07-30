import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config.js";
import Login from "./pages/auth/Login";
import EmailVerify from "./pages/auth/EmailVerify";
import ResetPassword from "./pages/auth/ResetPassword";
import Signup from "./pages/auth/Signup";
import SignupRequestStatus from "./pages/auth/SignupRequestStatus";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import AntdConfigProvider from "./components/common/AntdConfigProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorPage from "./components/error/ErrorPage";
import LandingPage from "./pages/LandingPage";
import Demo from "./pages/Demo";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Precios from "./pages/Precios";
import SoftwareInventarioPymes from "./pages/SoftwareInventarioPymes";
import OhnixVsAlegra from "./pages/OhnixVsAlegra";
import ProfilePage from "./components/ProfilePage";
import Dashboard from "./pages/Dashboard";
import DashboardLayout from "./components/layout/DashboardLayout";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Purchase from "./pages/Purchase";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Category from "./pages/Category";
import Reports from "./pages/Reports";
import Billing from "./pages/Billing";
import AdminManagement from "./pages/AdminManagement";
import PaymentSuccess from "./pages/PaymentSuccess";

function App() {
    return (
        <I18nextProvider i18n={i18n}>
            <CurrencyProvider>
                <AuthProvider>
                    <AntdConfigProvider>
                    <BrowserRouter>
                        <Toaster />
                        <div>
                            <Routes>
                            {/* Public routes */}
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/precios" element={<Precios />} />
                            <Route path="/blog" element={<Blog />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/software-inventario-pymes" element={<SoftwareInventarioPymes />} />
                            <Route path="/comparativa/ohnix-vs-alegra" element={<OhnixVsAlegra />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/demo" element={<Demo />} />
                            <Route path="/signup" element={<Signup />} />
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
                                <Route path="admin/management" element={<AdminManagement />} />
                            </Route>

                            {/* catch all */}
                            <Route path="/*" element={<ErrorPage />} />
                            </Routes>
                        </div>
                    </BrowserRouter>
                    </AntdConfigProvider>
                </AuthProvider>
            </CurrencyProvider>
        </I18nextProvider>
    );
}

export default App;
