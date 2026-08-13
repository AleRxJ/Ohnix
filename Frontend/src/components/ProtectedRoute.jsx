import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import AuthContext from "../context/AuthContext";

// Plain CSS spinner instead of antd's <Spin> - this file is imported
// eagerly (not React.lazy, since it wraps route elements directly) by
// App.jsx, so any antd import here would bundle antd into the app's
// always-loaded entry chunk, defeating the "vendor-antd" split in
// vite.config.js that keeps it out of the marketing pages' initial load.
const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-screen gap-3 text-[var(--ohnix-text-muted)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ohnix-line-6)] border-t-[#29D8D5]" />
        <span className="text-sm">Loading...</span>
    </div>
);

const ProtectedRoute = ({ children, requireVerified = false }) => {
    const { authenticated, loading, user } = useContext(AuthContext);
    const location = useLocation();

    // If still loading, show a spinner
    if (loading) {
        return <LoadingSpinner />;
    }

    // If not authenticated, redirect to login
    if (!authenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // If verification is required but user is not verified, redirect to verification page
    if (requireVerified && user && !user.isVerified) {
        return <Navigate to="/email-verify" replace />;
    }

    // If authenticated (and verified if required), render the children
    return children;
};

export default ProtectedRoute;

/**
 * Redirects authenticated users away from guest-only pages (login, signup).
 */
export const GuestRoute = ({ children }) => {
    const { authenticated, loading } = useContext(AuthContext);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (authenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};
