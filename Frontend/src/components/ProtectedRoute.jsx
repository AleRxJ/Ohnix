import React, { useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import AuthContext from "../context/AuthContext";

// Plain CSS spinner instead of antd's <Spin> - this file is imported
// eagerly (not React.lazy, since it wraps route elements directly) by
// App.jsx, so any antd import here would bundle antd into the app's
// always-loaded entry chunk, defeating the "vendor-antd" split in
// vite.config.js that keeps it out of the marketing pages' initial load.
//
// The backend's free Render plan spins down after ~15 min idle, so the
// initial auth check this gates on can take 30-50s to come back on a cold
// start - a bare spinner with no explanation looks like the page is stuck
// or broken during that window. Swapping in a "still working" hint after a
// few seconds keeps that wait from reading as a crash.
const LoadingSpinner = () => {
    const [isSlow, setIsSlow] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsSlow(true), 4000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center text-[var(--ohnix-text-muted)]">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ohnix-line-6)] border-t-[#29D8D5]" />
                <span className="text-sm">Cargando...</span>
            </div>
            {isSlow && (
                <p className="max-w-xs text-xs">
                    El servidor estaba inactivo y se está reactivando, esto puede tardar unos segundos.
                </p>
            )}
        </div>
    );
};

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
