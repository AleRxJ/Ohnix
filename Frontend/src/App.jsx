import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config.js";
import Login from "./pages/auth/Login";
import EmailVerify from "./pages/auth/EmailVerify";
import ResetPassword from "./pages/auth/ResetPassword";
import Signup from "./pages/auth/Signup";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorPage from "./components/error/ErrorPage";
import LandingPage from "./pages/LandingPage";
import Demo from "./pages/Demo";
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

function App() {
    return (
        <I18nextProvider i18n={i18n}>
            <AuthProvider>
                <BrowserRouter>
                    <Toaster />
                    <div>
                        <Routes>
                            {/* Public routes */}
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/demo" element={<Demo />} />
                            <Route path="/signup" element={<Signup />} />
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
                            </Route>

                            {/* catch all */}
                            <Route path="/*" element={<ErrorPage />} />
                        </Routes>
                    </div>
                </BrowserRouter>
            </AuthProvider>
        </I18nextProvider>
    );
}

export default App;
