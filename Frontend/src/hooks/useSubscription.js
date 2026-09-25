import { useState, useEffect, useContext } from "react";
import AuthContext from "../context/AuthContext";
import { subscriptionService } from "../services/subscriptionService";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";
import { subscribeConnectivity } from "../offline/connectivity.js";

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
        accounting:          false,
        teamRoles:           false,
        teamLivePresence:    false,
        teamActivityLog:     false,
        multiLocation:       false,
        salesQuotations:     false,
        discoveryEngine:     false,
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
        accounting:          false,
        teamRoles:           true,
        teamLivePresence:    true,
        teamActivityLog:     true,
        multiLocation:       false,
        salesQuotations:     true,
        discoveryEngine:     true,
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
        accounting:          true,
        teamRoles:           true,
        teamLivePresence:    true,
        teamActivityLog:     true,
        multiLocation:       true,
        salesQuotations:     true,
        discoveryEngine:     true,
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
        accounting:          true,
        teamRoles:           true,
        teamLivePresence:    true,
        teamActivityLog:     true,
        multiLocation:       true,
        salesQuotations:     true,
        discoveryEngine:     true,
    },
};

// Display name per plan (es/en) — single source of truth for PlanGate's
// upsell copy and the sidebar's locked-module badges, so both always agree.
export const PLAN_DISPLAY = {
    starter:    { es: "Starter",    en: "Starter"   },
    growth:     { es: "Negocio",    en: "Business"  },
    scale:      { es: "Escala",     en: "Scale"     },
    enterprise: { es: "Enterprise", en: "Enterprise" },
};

// Mirror of Backend TEAM_SEAT_LIMITS (pricing.middleware.js) — null = unlimited.
export const TEAM_SEAT_LIMITS = {
    starter: 0,
    growth: 3,
    scale: 10,
    enterprise: null,
};

// Feature labels (key → i18n label), shared by SubscriptionPlanCard's
// feature list and PlanComparisonCard's "what you'd gain" list - every
// boolean flag in PLAN_FEATURES above needs a row here. This used to be
// defined only inside SubscriptionPlanCard.jsx and listed just 8 of the 12
// flags, silently hiding reportPurchases, reportTopProducts, exportExcel
// and exportPdf from a user auditing what their plan actually includes.
// electronicInvoicing is filtered out while ELECTRONIC_INVOICING_ENABLED is
// false (see config/features.js) - the feature isn't actually offered yet,
// so it shouldn't be advertised as something a plan includes. Every other
// consumer of that flag (nav, routes, product forms) already hides it the
// same way; this list was the one place still listing it unconditionally.
export const FEATURE_LABELS = [
    { key: "reportSales",       es: "Reportes de ventas",              en: "Sales reports"                },
    { key: "reportPurchases",   es: "Reportes de compras",             en: "Purchase reports"              },
    { key: "reportTopProducts", es: "Reporte de productos más vendidos", en: "Top-selling products report" },
    { key: "exportCsv",         es: "Exportación CSV",                 en: "CSV export"                   },
    { key: "exportExcel",       es: "Exportación Excel",               en: "Excel export"                 },
    { key: "exportPdf",         es: "Exportación PDF",                 en: "PDF export"                   },
    { key: "bulkUpload",        es: "Carga masiva de productos",       en: "Bulk product upload"          },
    { key: "autoEmailAlerts",   es: "Alertas email automáticas",       en: "Automatic email alerts"       },
    { key: "configurableAlerts",es: "Alertas por umbral configurable", en: "Configurable stock thresholds" },
    { key: "apiAccess",         es: "API REST + integraciones Shopify/WooCommerce", en: "REST API + Shopify/WooCommerce integrations" },
    { key: "electronicInvoicing", es: "Facturación electrónica DIAN",  en: "DIAN electronic invoicing"    },
    { key: "advancedReports",   es: "Reportes avanzados (margen, clientes, equipo)", en: "Advanced reports (margin, customers, team)" },
    { key: "accounting",        es: "Contabilidad automática (asientos, PUC, cierres)", en: "Automated accounting (journal entries, chart of accounts, closes)" },
    { key: "teamRoles",         es: "Roles y permisos por módulo",     en: "Per-module roles & permissions" },
    { key: "teamLivePresence",  es: "Presencia en vivo y bloqueo de registros", en: "Live presence & record locking" },
    { key: "teamActivityLog",   es: "Log de actividad del equipo",     en: "Team activity log"            },
    { key: "multiLocation",     es: "Múltiples puntos de venta",       en: "Multiple points of sale"      },
    { key: "salesQuotations",   es: "Cotizaciones para clientes",       en: "Customer sales quotations"    },
    { key: "discoveryEngine",   es: "Detección automática de riesgos y oportunidades (Discovery Engine)", en: "Automatic risk & opportunity detection (Discovery Engine)" },
].filter((feature) => ELECTRONIC_INVOICING_ENABLED || feature.key !== "electronicInvoicing");

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
    accounting:          "scale",
    teamRoles:           "growth",
    teamLivePresence:    "growth",
    teamActivityLog:     "growth",
    multiLocation:       "scale",
    salesQuotations:     "growth",
    discoveryEngine:     "growth",
};

// Snapshot of the last confirmed plan, so a real network failure (offline,
// or a transient 5xx) doesn't masquerade as a genuine Starter account -
// every plan-gated feature (PlanGate, PointOfSaleField's multiLocation
// check, etc.) would otherwise silently show its locked/upsell state, or
// disappear entirely, for a paid account that's simply offline right now.
// Same pattern as AuthContext's user snapshot. Keyed per user id since
// impersonation/account-switching on the same device must never leak one
// account's plan into another's offline fallback.
const lastKnownPlanKey = (userId) => `ohnix:lastKnownPlan:${userId}`;
const persistPlanSnapshot = (userId, plan) => {
    try {
        localStorage.setItem(lastKnownPlanKey(userId), plan);
    } catch {
        // Storage full/unavailable - offline just won't restore the real
        // plan in that case, falls back to "starter" as before.
    }
};
const readPlanSnapshot = (userId) => {
    try {
        return localStorage.getItem(lastKnownPlanKey(userId));
    } catch {
        return null;
    }
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

        const fetchPlan = () => {
            setLoading(true);
            return subscriptionService
                .getMyUsage()
                // effectivePlan (not plan) reflects an active trial's temporary
                // Negocio-level access - using the raw stored plan here hid
                // trial users' own trial features behind PlanGate even though
                // the backend already granted them (pricing.middleware.js's
                // getEffectivePlan), contradicting "full access during trial".
                .then((res) => {
                    const resolvedPlan = res?.data?.effectivePlan ?? res?.data?.plan ?? "starter";
                    setPlan(resolvedPlan);
                    persistPlanSnapshot(user.id, resolvedPlan);
                })
                .catch((error) => {
                    console.error("useSubscription: failed to load plan", error);
                    if (!error.response) {
                        // Real network failure (see connectivity.js's
                        // reportNetworkFailure, triggered by this very
                        // error) - not proof the account downgraded, only
                        // that it couldn't be confirmed right now. Restore
                        // the last confirmed plan instead of masquerading
                        // as Starter; the effect below re-runs this for
                        // real once connectivity is confirmed back.
                        const snapshot = readPlanSnapshot(user.id);
                        if (snapshot) {
                            setPlan(snapshot);
                            return;
                        }
                    }
                    // A real error response, or no snapshot to fall back to
                    // - only now is it safe to assume Starter-level access.
                    setPlan("starter");
                })
                .finally(() => setLoading(false));
        };

        fetchPlan();
        return subscribeConnectivity((online) => {
            if (online) fetchPlan();
        });
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
