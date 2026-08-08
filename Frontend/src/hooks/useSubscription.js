import { useState, useEffect, useContext } from "react";
import AuthContext from "../context/AuthContext";
import { subscriptionService } from "../services/subscriptionService";

// Mirror of Backend PLAN_FEATURES — keep in sync with pricing.middleware.js
export const PLAN_FEATURES = {
    starter: {
        reportSales:         false,
        reportPurchases:     false,
        reportTopProducts:   false,
        exportCsv:           false,
        exportExcel:         false,
        exportPdf:           false,
        bulkUpload:          false,
        autoEmailAlerts:     false,
        configurableAlerts:  false,
        apiAccess:           false,
        electronicInvoicing: false,
        advancedReports:     false,
    },
    growth: {
        reportSales:         true,
        reportPurchases:     true,
        reportTopProducts:   true,
        exportCsv:           true,
        exportExcel:         false,
        exportPdf:           true,
        bulkUpload:          true,
        autoEmailAlerts:     true,
        configurableAlerts:  false,
        apiAccess:           false,
        electronicInvoicing: true,
        advancedReports:     false,
    },
    scale: {
        reportSales:         true,
        reportPurchases:     true,
        reportTopProducts:   true,
        exportCsv:           true,
        exportExcel:         true,
        exportPdf:           true,
        bulkUpload:          true,
        autoEmailAlerts:     true,
        configurableAlerts:  true,
        apiAccess:           true,
        electronicInvoicing: true,
        advancedReports:     true,
    },
    enterprise: {
        reportSales:         true,
        reportPurchases:     true,
        reportTopProducts:   true,
        exportCsv:           true,
        exportExcel:         true,
        exportPdf:           true,
        bulkUpload:          true,
        autoEmailAlerts:     true,
        configurableAlerts:  true,
        apiAccess:           true,
        electronicInvoicing: true,
        advancedReports:     true,
    },
};

// Mirror of Backend TEAM_SEAT_LIMITS (pricing.middleware.js) — null = unlimited.
export const TEAM_SEAT_LIMITS = {
    starter: 0,
    growth: 3,
    scale: 10,
    enterprise: null,
};

// The minimum plan that unlocks each feature (used for "upgrade to X" messages)
export const FEATURE_MINIMUM_PLAN = {
    reportSales:         "growth",
    reportPurchases:     "growth",
    reportTopProducts:   "growth",
    exportCsv:           "growth",
    exportExcel:         "scale",
    exportPdf:           "growth",
    bulkUpload:          "growth",
    autoEmailAlerts:     "growth",
    configurableAlerts:  "scale",
    apiAccess:           "scale",
    electronicInvoicing: "growth",
    advancedReports:     "scale",
};

const useSubscription = () => {
    const { user } = useContext(AuthContext);
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        // Admins bypass all feature gates
        if (user.role === "admin") {
            setPlan("enterprise");
            setLoading(false);
            return;
        }
        subscriptionService
            .getMyUsage()
            // effectivePlan (not plan) reflects an active trial's temporary
            // Negocio-level access - using the raw stored plan here hid
            // trial users' own trial features behind PlanGate even though
            // the backend already granted them (pricing.middleware.js's
            // getEffectivePlan), contradicting "full access during trial".
            .then((res) => setPlan(res?.data?.effectivePlan ?? res?.data?.plan ?? "starter"))
            .catch(() => setPlan("starter"))
            .finally(() => setLoading(false));
    }, [user?.id]);

    /**
     * Returns true if the current user's plan includes the given feature.
     * Admins always return true.
     */
    const can = (featureKey) => {
        if (user?.role === "admin") return true;
        if (!plan) return false;
        return PLAN_FEATURES[plan]?.[featureKey] ?? false;
    };

    return { plan, loading, can };
};

export default useSubscription;
