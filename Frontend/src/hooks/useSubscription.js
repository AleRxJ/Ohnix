import { useState, useEffect, useContext } from "react";
import AuthContext from "../context/AuthContext";
import { subscriptionService } from "../services/subscriptionService";

// Mirror of Backend PLAN_FEATURES — keep in sync with pricing.middleware.js
export const PLAN_FEATURES = {
    starter: {
        reportSales:        false,
        reportPurchases:    false,
        reportTopProducts:  false,
        exportCsv:          false,
        bulkUpload:         false,
        autoEmailAlerts:    false,
        configurableAlerts: false,
        apiAccess:          false,
    },
    growth: {
        reportSales:        true,
        reportPurchases:    true,
        reportTopProducts:  true,
        exportCsv:          true,
        bulkUpload:         true,
        autoEmailAlerts:    true,
        configurableAlerts: false,
        apiAccess:          false,
    },
    scale: {
        reportSales:        true,
        reportPurchases:    true,
        reportTopProducts:  true,
        exportCsv:          true,
        bulkUpload:         true,
        autoEmailAlerts:    true,
        configurableAlerts: true,
        apiAccess:          true,
    },
    enterprise: {
        reportSales:        true,
        reportPurchases:    true,
        reportTopProducts:  true,
        exportCsv:          true,
        bulkUpload:         true,
        autoEmailAlerts:    true,
        configurableAlerts: true,
        apiAccess:          true,
    },
};

// The minimum plan that unlocks each feature (used for "upgrade to X" messages)
export const FEATURE_MINIMUM_PLAN = {
    reportSales:        "growth",
    reportPurchases:    "growth",
    reportTopProducts:  "growth",
    exportCsv:          "growth",
    bulkUpload:         "growth",
    autoEmailAlerts:    "growth",
    configurableAlerts: "scale",
    apiAccess:          "scale",
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
            .then((res) => setPlan(res?.data?.plan ?? "starter"))
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
