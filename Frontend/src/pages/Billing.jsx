import React, { useContext, useEffect, useState } from "react";
import { Button, Typography, Modal, Form, Select, Input, List, Tag, Checkbox, Tooltip } from "antd";
import {
    ArrowLeftOutlined,
    LockOutlined,
    RocketOutlined,
    AuditOutlined,
    CloseCircleOutlined,
    ClockCircleOutlined,
    WarningOutlined,
    CheckCircleOutlined,
    CheckOutlined,
    ArrowRightOutlined,
    CopyOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import { subscriptionService } from "../services/subscriptionService";
import { pricingService } from "../services/pricingService";
import { formatCurrency } from "../utils/currency";
import { FEATURE_LABELS } from "../hooks/useSubscription";
import { useMarketPricing } from "../hooks/useMarketPricing";
import SubscriptionPlanCard, { PLAN_COLORS } from "../components/profile/SubscriptionPlanCard";
import PlanComparisonCard, { LIMIT_ROWS, formatLimit, getPlanPriceLabel } from "../components/profile/PlanComparisonCard";
import ApiKeysPanel from "../components/billing/ApiKeysPanel";
import IntegrationsPanel from "../components/billing/IntegrationsPanel";

const { Title, Text } = Typography;
const { TextArea } = Input;

const REQUEST_STATUS_COLORS = {
    open: "blue",
    reviewing: "gold",
    approved: "green",
    rejected: "red",
    closed: "default",
};

// Custom status pill for the customer's own request cards - matches the
// glow-pill treatment already used elsewhere on this page (see the
// "Completar pago" header pill below) instead of a plain antd Tag, which is
// what the admin table still uses (REQUEST_STATUS_COLORS above).
const REQUEST_STATUS_PILL_STYLES = {
    open: { wrapperClass: "border-[#38BDF8]/25 bg-[#38BDF8]/8 text-[#38BDF8]", dotClass: "bg-[#38BDF8] shadow-[0_0_5px_#38BDF8]" },
    reviewing: { wrapperClass: "border-[#F5B301]/25 bg-[#F5B301]/8 text-[#F5B301]", dotClass: "bg-[#F5B301] shadow-[0_0_5px_#F5B301]" },
    approved: { wrapperClass: "border-[#34D399]/25 bg-[#34D399]/8 text-[#34D399]", dotClass: "bg-[#34D399] shadow-[0_0_5px_#34D399]" },
    rejected: { wrapperClass: "border-[#FB7185]/25 bg-[#FB7185]/8 text-[#FB7185]", dotClass: "bg-[#FB7185] shadow-[0_0_5px_#FB7185]" },
    closed: { wrapperClass: "border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-muted)]", dotClass: "bg-[var(--ohnix-text-muted)]" },
};

const REQUEST_STATUS_OPTIONS = [
    "open",
    "reviewing",
    "approved",
    "rejected",
    "closed",
];

const UPGRADE_OPTIONS_BY_PLAN = {
    starter:    ["growth", "scale", "enterprise"],
    growth:     ["scale", "enterprise"],
    scale:      ["enterprise"],
    enterprise: [],
};

// paymentProvider is stored as a compound "stripe:card:CO" while a checkout
// is still pending (see createMyUpgradeCheckoutSession) and collapses to a
// plain "stripe"/"epayco"/"manual" once it resolves - only the part before
// the first ":" is ever meaningful to show a customer.
const PROVIDER_LABELS = { stripe: "Stripe", epayco: "ePayco", manual: "Manual" };
const formatPaymentProviderLabel = (raw) => {
    const base = `${raw || ""}`.split(":")[0];
    return PROVIDER_LABELS[base] || base;
};

// paymentSessionId starts life as our own internal placeholder
// ("OHNIX-<requestId>-<timestamp>", see generateEpaycoReference /
// createEpaycoCheckoutSession) before the provider's real transaction
// reference replaces it - showing that placeholder to a customer as "your
// payment reference" would be actively misleading, since it's not anything
// ePayco/Stripe's own support can look up.
const isRealPaymentReference = (value) => Boolean(value) && !value.startsWith("OHNIX-");

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: {
        background: "transparent",
        borderBottom: "1px solid var(--ohnix-line-3)",
        padding: "20px 24px 16px",
    },
    body: { padding: 24 },
};

// Plan picker for the upgrade-request modal - a grid of selectable cards
// (one per plan the user can move to) instead of a bare <Select> with no
// price or context. Behaves like any other antd custom form control: Form.Item
// injects `value`/`onChange(newValue)` automatically since this is its only
// child.
const PlanPickerCards = ({ value, onChange, options, catalog, priceByPlanKey, t }) => {
    const catalogByKey = (catalog || []).reduce((acc, plan) => {
        acc[plan.key] = plan;
        return acc;
    }, {});

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {options.map((planKey) => {
                const plan = catalogByKey[planKey];
                const color = PLAN_COLORS[planKey] || "#29D8D5";
                const isSelected = value === planKey;
                const priceLabel = plan ? getPlanPriceLabel(plan, priceByPlanKey, t) : null;

                return (
                    <button
                        type="button"
                        key={planKey}
                        onClick={() => onChange?.(planKey)}
                        className="relative flex flex-col items-start gap-1.5 rounded-2xl border px-4 py-3.5 text-left transition-all border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] hover:border-[var(--ohnix-line-6)]"
                        style={
                            isSelected
                                ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 0 24px ${color}33`, backgroundColor: "var(--ohnix-line-2)" }
                                : undefined
                        }
                    >
                        {isSelected && (
                            <span
                                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-[#041316]"
                                style={{ backgroundColor: color }}
                            >
                                <CheckOutlined style={{ fontSize: 10 }} />
                            </span>
                        )}
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
                            {t(`profile.subscription.plan_${planKey}`)}
                        </span>
                        <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                            {priceLabel || <span className="inline-block h-5 w-16 animate-pulse rounded bg-[var(--ohnix-line-3)] align-middle" />}
                            {priceLabel && plan?.priceUSD !== null && (
                                <span className="ml-1 text-xs font-normal text-[var(--ohnix-text-muted)]">
                                    {t("profile.subscription.comparison.per_month")}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

const SLA_HOURS_BY_TARGET_PLAN = {
    growth:     48,
    scale:      24,
    enterprise: 72,
};

const TRACKER_STEP_KEYS = ["submitted", "reviewing", "approved", "activated"];

const PAYMENT_METHOD_LABELS = {
    epayco: "Pagar con ePayco",
    card: "Tarjeta / Card",
    pse: "ACH (PSE - otros bancos)",
    bancolombia_button: "Pasarela Bancolombia",
    bizum: "Bizum",
    sepa_debit: "SEPA Débito",
};

// Friendly labels for the country selector - falls back to the raw code for
// any Eurozone country not listed here, and to "Resto del mundo" for the
// USD catch-all bucket (see COUNTRY_CONFIG.OTHER in payment.service.js).
const COUNTRY_LABELS = {
    ES: "España",
    FR: "Francia",
    DE: "Alemania",
    IT: "Italia",
    PT: "Portugal",
    NL: "Países Bajos",
    OTHER: "Resto del mundo (USD)",
};

const formatEtaDuration = (remainingMs, t) => {
    if (remainingMs <= 60 * 60 * 1000) {
        return t("profile.subscription.tracker_eta_less_than_hour");
    }

    const totalHours = Math.ceil(remainingMs / (1000 * 60 * 60));
    if (totalHours < 24) {
        return t("profile.subscription.tracker_eta_hours", { count: totalHours });
    }

    const days = Math.ceil(totalHours / 24);
    return t("profile.subscription.tracker_eta_days", { count: days });
};

const extractFirstUrl = (text) => {
    const normalizedText = typeof text === "string" ? text : "";
    const match = normalizedText.match(/https?:\/\/[^\s)]+/i);
    return match?.[0] || null;
};

const isValidHttpUrl = (value = "") => {
    try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
};

const UPGRADE_REQUEST_ERROR_I18N_MAP = {
    "You already have an upgrade request in progress":
        "profile.subscription.error_upgrade_request_in_progress",
    "You are already on this plan":
        "profile.subscription.error_already_on_target_plan",
    "A payment for this request is still being verified. It can't be cancelled until that finishes.":
        "profile.subscription.error_cancel_payment_pending",
    "This request can no longer be cancelled":
        "profile.subscription.error_cancel_not_allowed",
};

// Older upgrade requests (created before the backend stopped writing these)
// still carry these exact system-generated English sentences in `notes` /
// `adminResponse` - hardcoded because they were never meant to be free
// text, just boilerplate. Recognized here and suppressed regardless of the
// viewer's language, instead of showing raw English or a translated line
// that would just duplicate request_status_help_approved right below it.
// This works for every existing row without a data migration, and for any
// new one created before that backend fix is deployed - display never
// depends on what's literally stored for these two known strings. A real
// admin-authored note/response (anything else) still renders as-is.
const SUPPRESSED_SYSTEM_TEXT = new Set([
    "Auto-approved for standard checkout. Complete payment to activate your plan.",
    "Requested during signup",
]);
const isDisplayableFreeText = (value) => Boolean(value) && !SUPPRESSED_SYSTEM_TEXT.has(value);

const Billing = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, refreshUser } = useContext(AuthContext);
    const { isOwner, hasPermission } = useTeam();
    const canViewBilling = isOwner || hasPermission("billing", "view");
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "en" ? "en" : "es";

    const resolveLocalizedErrorMessage = (error, fallbackKey = "common.error") => {
        const backendMessage = error?.response?.data?.message;

        if (backendMessage && UPGRADE_REQUEST_ERROR_I18N_MAP[backendMessage]) {
            return t(UPGRADE_REQUEST_ERROR_I18N_MAP[backendMessage]);
        }

        return backendMessage || t(fallbackKey);
    };

    const [loadingSubscription, setLoadingSubscription] = useState(true);
    const [refreshingSubscription, setRefreshingSubscription] = useState(false);
    const [subscription, setSubscription] = useState(null);
    const [usage, setUsage] = useState(null);
    const [requests, setRequests] = useState([]);
    const [adminRequests, setAdminRequests] = useState([]);
    const [adminFilterStatus, setAdminFilterStatus] = useState("");
    const [adminSearch, setAdminSearch] = useState("");
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const [adminModalOpen, setAdminModalOpen] = useState(false);
    const [adminSubmitting, setAdminSubmitting] = useState(false);
    const [checkoutLoadingRequestId, setCheckoutLoadingRequestId] = useState("");
    const [cancelTargetRequest, setCancelTargetRequest] = useState(null);
    const [cancellingRequestId, setCancellingRequestId] = useState("");
    const [checkoutMethodsByCountry, setCheckoutMethodsByCountry] = useState({});
    const [checkoutSelectionByRequestId, setCheckoutSelectionByRequestId] = useState({});
    const [pricingByCountry, setPricingByCountry] = useState({});
    const [billingLoadWarning, setBillingLoadWarning] = useState("");
    const [selectedAdminRequest, setSelectedAdminRequest] = useState(null);
    const [upgradeForm] = Form.useForm();
    const [adminReviewForm] = Form.useForm();
    const [planCatalog, setPlanCatalog] = useState(null);
    const { priceByPlanKey } = useMarketPricing();
    // Reactively reflects the plan currently picked in the upgrade-request
    // modal's card grid, so the "what changes" panel below it updates live
    // instead of only showing a fixed "current -> next tier" comparison.
    const selectedTargetPlan = Form.useWatch("targetPlan", upgradeForm);
    // Enterprise can't rely on the automated checkout (no fixed price), so
    // approving one has to carry a manual payment link the admin negotiated
    // - required only for this plan, only once the admin picks "approved".
    const adminReviewStatus = Form.useWatch("status", adminReviewForm);

    const isAdmin = user?.role === "admin";
    const currentPlan = subscription?.plan || user?.subscription?.plan || "starter";
    const availableUpgradeOptions = UPGRADE_OPTIONS_BY_PLAN[currentPlan] || [];
    const safeRequests = Array.isArray(requests) ? requests : [];
    const safeAdminRequests = Array.isArray(adminRequests) ? adminRequests : [];
    const isPlanAlreadyActiveForRequest = (request) =>
        subscription?.plan === request?.targetPlan && subscription?.status === "active";
    // A previous checkout for this request hasn't resolved yet (some
    // methods, e.g. PSE bank transfers, can take hours) - the backend
    // rejects starting a second one while this is true, to avoid a real
    // double charge, so the button is hidden here too instead of failing.
    const isPaymentPendingForRequest = (request) => request?.paymentStatus === "pending";
    // A previous attempt is done and safe to retry, but the person needs to
    // actually be told what happened to it - without this, a request whose
    // payment was rejected/failed/expired just silently looks like a fresh
    // "ready to pay" request again (correct - it IS retryable now - but the
    // one-time toast/email is easy to miss, e.g. if the payment redirect
    // landed on an expired session and bounced through /login first).
    const TERMINAL_FAILED_PAYMENT_STATUSES = ["rejected", "failed", "amount_mismatch", "expired", "cancelled"];
    const failedPaymentStatusForRequest = (request) =>
        TERMINAL_FAILED_PAYMENT_STATUSES.includes(request?.paymentStatus) ? request.paymentStatus : null;

    // Mirrors the backend's cancelMyUpgradeRequest guard exactly: safe to
    // withdraw before review, or after approval as long as no payment is
    // actually mid-verification right now - cancelling out from under a
    // payment that's about to succeed would leave a paid, closed request
    // behind. The backend re-checks this atomically regardless, so this is
    // only about showing/hiding the button, not the real guarantee.
    const isRequestCancellable = (request) => {
        if (!request) return false;
        if (["open", "reviewing"].includes(request.status)) return true;
        return (
            request.status === "approved" &&
            request.paymentStatus !== "pending" &&
            !isPlanAlreadyActiveForRequest(request)
        );
    };

    const isRequestInProgress = (request) => {
        if (!request) {
            return false;
        }

        if (["open", "reviewing"].includes(request.status)) {
            return true;
        }

        return request.status === "approved" && !isPlanAlreadyActiveForRequest(request);
    };

    const latestActiveRequest = safeRequests.find(isRequestInProgress);

    // The specific request behind what's active right now - not just "any
    // closed+paid request for this plan" (several renewals over time can
    // all match that), but the one whose periodEndsAt snapshot lines up
    // with the subscription's actual current endsAt. Older requests
    // (created before periodStartsAt/periodEndsAt existed) fall back to the
    // same "closed+paid and the plan matches" best-effort assumption
    // request_closed_valid_until below already makes. safeRequests is
    // sorted newest-first (see getMyUpgradeRequests), so .find() lands on
    // the most recent candidate instead of an arbitrary older one.
    const currentActiveRequest = safeRequests.find((request) => {
        if (request.status !== "closed" || request.paymentStatus !== "paid") return false;
        if (request.periodEndsAt && subscription?.endsAt) {
            return new Date(request.periodEndsAt).getTime() === new Date(subscription.endsAt).getTime();
        }
        return isPlanAlreadyActiveForRequest(request);
    });

    const trackerCurrentStep = (() => {
        if (!latestActiveRequest) {
            return -1;
        }

        if (latestActiveRequest.status === "open") {
            return 0;
        }

        if (latestActiveRequest.status === "reviewing") {
            return 1;
        }

        if (latestActiveRequest.status === "approved") {
            const isTargetPlanActive =
                subscription?.plan === latestActiveRequest.targetPlan &&
                subscription?.status === "active";
            return isTargetPlanActive ? 3 : 2;
        }

        return -1;
    })();

    const trackerEta = (() => {
        if (!latestActiveRequest) {
            return null;
        }

        if (!["open", "reviewing"].includes(latestActiveRequest.status)) {
            return null;
        }

        const slaHours = SLA_HOURS_BY_TARGET_PLAN[latestActiveRequest.targetPlan];
        if (!slaHours) {
            return null;
        }

        const createdAtTs = new Date(latestActiveRequest.createdAt).getTime();
        if (Number.isNaN(createdAtTs)) {
            return null;
        }

        const dueAtTs = createdAtTs + slaHours * 60 * 60 * 1000;
        const remainingMs = dueAtTs - Date.now();

        if (remainingMs <= 0) {
            return {
                overdue: true,
                text: t("profile.subscription.tracker_eta_overdue"),
            };
        }

        return {
            overdue: false,
            text: formatEtaDuration(remainingMs, t),
        };
    })();

    const fetchSubscriptionData = async () => {
        const results = await Promise.allSettled([
            subscriptionService.getMySubscription(),
            subscriptionService.getMyUsage(),
            subscriptionService.getMyUpgradeRequests(),
            isAdmin
                ? subscriptionService.getUpgradeRequestsAdmin(adminFilterStatus)
                : Promise.resolve({ data: [] }),
        ]);

        const [subscriptionResult, usageResult, requestResult, adminRequestResult] = results;

        if (subscriptionResult.status === "fulfilled") {
            setSubscription(subscriptionResult.value?.data || null);
        }

        if (usageResult.status === "fulfilled") {
            setUsage(usageResult.value?.data || null);
        }

        if (requestResult.status === "fulfilled") {
            setRequests(Array.isArray(requestResult.value?.data) ? requestResult.value.data : []);
        }

        if (adminRequestResult.status === "fulfilled") {
            setAdminRequests(
                Array.isArray(adminRequestResult.value?.data)
                    ? adminRequestResult.value.data
                    : []
            );
        }

        const failedCount = results.filter((result) => result.status === "rejected").length;
        if (failedCount > 0) {
            setBillingLoadWarning(t("profile.subscription.partial_data_warning"));
        } else {
            setBillingLoadWarning("");
        }
    };

    useEffect(() => {
        if (!canViewBilling) {
            setLoadingSubscription(false);
            return;
        }

        const run = async () => {
            try {
                setLoadingSubscription(true);
                const [_, methodsResponse] = await Promise.all([
                    fetchSubscriptionData(),
                    subscriptionService.getCheckoutPaymentMethods(),
                ]);

                const methodsByCountry = methodsResponse?.data?.methodsByCountry || {};
                setCheckoutMethodsByCountry(methodsByCountry);
            } catch (error) {
                toast.error(
                    error.response?.data?.message ||
                        t("profile.subscription.load_failed")
                );
            } finally {
                setLoadingSubscription(false);
            }
        };

        run();
    }, [t, isAdmin, adminFilterStatus, canViewBilling]);

    // Plan catalog (prices, limits, features per plan) powers the "what
    // changes" panel in the upgrade-request modal below - fetched once since
    // it's the same static catalog PlanComparisonCard already loads.
    useEffect(() => {
        if (!canViewBilling) return;
        let active = true;
        subscriptionService
            .getPlanCatalog()
            .then((res) => {
                if (active) setPlanCatalog(res?.data?.plans || null);
            })
            .catch(() => {
                if (active) setPlanCatalog(null);
            });
        return () => {
            active = false;
        };
    }, [canViewBilling]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get("payment") !== "cancelled") {
            return;
        }

        toast.error(t("profile.subscription.payment_cancelled"));

        // The cancel/failure redirect (from Stripe's cancel_url or ePayco's
        // failed-state response URL) never itself tells the backend
        // anything - it's a browser-only bounce. Without actively checking
        // now, the request stays at paymentStatus "pending" until a webhook
        // (which may never arrive for a plain "user closed the tab")
        // eventually clears it. Calling checkout-status here re-verifies
        // against the provider and self-heals immediately instead of
        // leaving the "payment in progress" lock up for the user.
        const requestId = params.get("requestId");
        if (requestId) {
            subscriptionService
                .getUpgradeCheckoutStatus(requestId)
                .then(() => fetchSubscriptionData())
                .catch(() => {
                    // Best-effort - the periodic backend reconciliation and
                    // the next normal page load will still pick it up.
                });
        }

        // Strip ?payment=cancelled&requestId=... from the address bar once
        // handled - landing here at all is now just a defensive fallback
        // (see EpaycoResponseRedirect.jsx, which routes this same outcome
        // through /billing/payment-success's proper loading -> result flow
        // instead), so there's no reason to leave a stale query string
        // sitting in the URL after the toast/self-heal above already ran.
        navigate(location.pathname, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, t]);

    useEffect(() => {
        const countryList = Object.keys(checkoutMethodsByCountry);
        if (!countryList.length || !safeRequests.length) {
            return;
        }

        const fallbackCountry = countryList[0];
        const fallbackMethod = checkoutMethodsByCountry[fallbackCountry]?.[0] || "card";

        setCheckoutSelectionByRequestId((prev) => {
            let changed = false;
            const next = { ...prev };

            safeRequests.forEach((request) => {
                if (!next[request.id]) {
                    changed = true;
                    next[request.id] = {
                        country: fallbackCountry,
                        method: fallbackMethod,
                    };
                }
            });

            return changed ? next : prev;
        });
    }, [checkoutMethodsByCountry, safeRequests]);

    // Checkout price preview - fetched lazily per country actually selected,
    // from the same public endpoint /precios uses (getPublicPricing), so the
    // amount shown here always matches what the provider will actually
    // charge instead of a second hand-typed number (this used to be a
    // PLAN_COP_DISPLAY constant hardcoded separately from EPAYCO_AMOUNT_*_COP).
    useEffect(() => {
        const countries = new Set(
            Object.values(checkoutSelectionByRequestId)
                .map((selection) => selection?.country)
                .filter(Boolean)
        );

        countries.forEach((country) => {
            if (pricingByCountry[country]) return;
            pricingService
                .getPublicPricing(country)
                .then((response) => {
                    if (response?.data) {
                        setPricingByCountry((prev) =>
                            prev[country] ? prev : { ...prev, [country]: response.data }
                        );
                    }
                })
                .catch(() => {
                    // Best-effort - checkout still works without a price preview.
                });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkoutSelectionByRequestId]);

    const formatPlanPriceForCountry = (country, planKey) => {
        const pricing = pricingByCountry[country];
        const planPricing = pricing?.plans?.find((plan) => plan.key === planKey);
        if (!planPricing || planPricing.amount === null || planPricing.amount === undefined) {
            return null;
        }

        const currency = pricing.currency?.toUpperCase();
        const formatted = formatCurrency(planPricing.amount, currency);
        // "$" alone is ambiguous between USD and COP.
        return currency === "COP" ? `${formatted} COP` : formatted;
    };

    const handleRefreshSubscription = async () => {
        try {
            setRefreshingSubscription(true);
            const [_, methodsResponse] = await Promise.all([
                fetchSubscriptionData(),
                subscriptionService.getCheckoutPaymentMethods(),
            ]);
            const methodsByCountry = methodsResponse?.data?.methodsByCountry || {};
            setCheckoutMethodsByCountry(methodsByCountry);
            await refreshUser();
        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                    t("profile.subscription.load_failed")
            );
        } finally {
            setRefreshingSubscription(false);
        }
    };

    const handlePause = async () => {
        try {
            await subscriptionService.pauseMySubscription();
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleCancel = async () => {
        try {
            await subscriptionService.cancelMySubscription();
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleReactivate = async () => {
        try {
            await subscriptionService.reactivateMySubscription();
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleDowngrade = async (targetPlan) => {
        try {
            await subscriptionService.downgradeMySubscription(targetPlan);
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleUndoDowngrade = async () => {
        try {
            await subscriptionService.undoMyDowngrade();
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleRequestUpgrade = () => {
        if (availableUpgradeOptions.length === 0) {
            toast.success(t("profile.subscription.top_plan_reached"));
            return;
        }

        upgradeForm.setFieldsValue({
            targetPlan: availableUpgradeOptions[0],
            notes: "",
            requiresManualReview: false,
        });
        setRequestModalOpen(true);
    };

    const submitUpgradeRequest = async (values) => {
        try {
            setRequestSubmitting(true);
            await subscriptionService.createUpgradeRequest(values);
            setRequestModalOpen(false);
            upgradeForm.resetFields();
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(resolveLocalizedErrorMessage(error));
        } finally {
            setRequestSubmitting(false);
        }
    };

    const ensureCheckoutSelection = (requestId) => {
        const existing = checkoutSelectionByRequestId[requestId];
        if (existing) {
            return existing;
        }

        const fallbackCountry = Object.keys(checkoutMethodsByCountry)[0] || "CO";
        const fallbackMethod = checkoutMethodsByCountry[fallbackCountry]?.[0] || "card";

        return {
            country: fallbackCountry,
            method: fallbackMethod,
        };
    };

    const updateCheckoutCountry = (requestId, country) => {
        const methods = checkoutMethodsByCountry[country] || [];
        setCheckoutSelectionByRequestId((prev) => ({
            ...prev,
            [requestId]: {
                country,
                method: methods[0] || "card",
            },
        }));
    };

    const updateCheckoutMethod = (requestId, method) => {
        const current = ensureCheckoutSelection(requestId);
        setCheckoutSelectionByRequestId((prev) => ({
            ...prev,
            [requestId]: {
                ...current,
                method,
            },
        }));
    };

    // Colombia-specific handler: always sends CO + epayco, no state races
    // Renews (or, for a first-time-paid Starter, activates) the user's
    // CURRENT plan - distinct from handleRequestUpgrade, which always
    // defaults to the next tier up and has no "same plan" option at all
    // (createUpgradeRequest rejects targetPlan === current plan).
    const handleRenew = async () => {
        try {
            setCheckoutLoadingRequestId("renew");
            const fallbackCountry = Object.keys(checkoutMethodsByCountry)[0] || "CO";
            const fallbackMethod = checkoutMethodsByCountry[fallbackCountry]?.[0] || "epayco";
            const response = await subscriptionService.createRenewalCheckout({
                country: fallbackCountry,
                paymentMethod: fallbackMethod,
            });
            const checkoutUrl = response?.data?.checkoutUrl;
            if (!checkoutUrl) {
                toast.error(t("profile.subscription.checkout_unavailable"));
                return;
            }
            window.location.assign(checkoutUrl);
        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                    t("profile.subscription.checkout_unavailable")
            );
        } finally {
            setCheckoutLoadingRequestId("");
        }
    };

    const handleConfirmCancelRequest = async () => {
        const request = cancelTargetRequest;
        if (!request?.id) {
            return;
        }

        try {
            setCancellingRequestId(request.id);
            await subscriptionService.cancelUpgradeRequest(request.id);
            toast.success(t("profile.subscription.cancel_request_success"));
            setCancelTargetRequest(null);
            await fetchSubscriptionData();
        } catch (error) {
            toast.error(
                resolveLocalizedErrorMessage(error, "profile.subscription.cancel_request_error")
            );
        } finally {
            setCancellingRequestId("");
        }
    };

    const handleStartCheckoutColombia = async (request) => {
        if (!request?.id) {
            return;
        }

        try {
            setCheckoutLoadingRequestId(request.id);
            const response = await subscriptionService.createUpgradeCheckoutSessionWithMethod(
                request.id,
                { country: "CO", paymentMethod: "epayco" }
            );
            const checkoutUrl = response?.data?.checkoutUrl;
            if (!checkoutUrl) {
                toast.error(t("profile.subscription.checkout_unavailable"));
                return;
            }
            window.location.assign(checkoutUrl);
        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                    t("profile.subscription.checkout_unavailable")
            );
        } finally {
            setCheckoutLoadingRequestId("");
        }
    };

    const handleStartCheckout = async (request) => {
        if (!request?.id) {
            return;
        }

        try {
            setCheckoutLoadingRequestId(request.id);
            const selection = ensureCheckoutSelection(request.id);
            const response =
                await subscriptionService.createUpgradeCheckoutSessionWithMethod(
                    request.id,
                    {
                        country: selection.country,
                        paymentMethod: selection.method,
                    }
                );
            const checkoutUrl = response?.data?.checkoutUrl;

            if (!checkoutUrl) {
                toast.error(t("profile.subscription.checkout_unavailable"));
                return;
            }

            window.location.assign(checkoutUrl);
        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                    t("profile.subscription.checkout_unavailable")
            );
        } finally {
            setCheckoutLoadingRequestId("");
        }
    };

    const openAdminReview = (request) => {
        setSelectedAdminRequest(request);
        adminReviewForm.setFieldsValue({
            status: request.status,
            adminResponse: request.adminResponse || "",
            paymentLink: request.paymentLink || extractFirstUrl(request.adminResponse) || "",
        });
        setAdminModalOpen(true);
    };

    const submitAdminReview = async (values) => {
        if (!selectedAdminRequest?.id) {
            return;
        }

        try {
            setAdminSubmitting(true);
            await subscriptionService.updateUpgradeRequestAdmin(
                selectedAdminRequest.id,
                values
            );
            setAdminModalOpen(false);
            setSelectedAdminRequest(null);
            adminReviewForm.resetFields();
            await handleRefreshSubscription();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setAdminSubmitting(false);
        }
    };

    const filteredAdminRequests = safeAdminRequests.filter((item) => {
        const search = adminSearch.trim().toLowerCase();
        if (!search) {
            return true;
        }

        const username = item.user?.username?.toLowerCase() || "";
        const email = item.user?.email?.toLowerCase() || "";

        return username.includes(search) || email.includes(search);
    });

    if (!canViewBilling) {
        return (
            <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] flex items-center justify-center p-6">
                <div className="max-w-md rounded-[28px] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)]">
                        <LockOutlined className="text-2xl text-[var(--ohnix-text-muted)]" />
                    </div>
                    <h2 className="mb-2 text-xl font-bold text-[var(--ohnix-text-primary)]">{t("team.billing_locked_title")}</h2>
                    <p className="mb-0 text-sm text-[var(--ohnix-text-muted)]">{t("team.billing_locked_description")}</p>
                </div>
            </div>
        );
    }

    // "What changes" data for the upgrade-request modal - mirrors
    // PlanComparisonCard's delta logic exactly, but against whichever plan
    // is actually selected in the modal's card grid (selectedTargetPlan),
    // not just the fixed "next tier" that card shows on the page behind it.
    const currentPlanCatalogEntry = planCatalog?.find((p) => p.key === currentPlan) || null;
    const targetPlanCatalogEntry = planCatalog?.find((p) => p.key === selectedTargetPlan) || null;
    const modalLimitDeltas =
        currentPlanCatalogEntry && targetPlanCatalogEntry
            ? LIMIT_ROWS.map((row) => ({
                  ...row,
                  currentValue: currentPlanCatalogEntry.limits[row.limitKey],
                  nextValue: targetPlanCatalogEntry.limits[row.limitKey],
              })).filter((row) => row.nextValue !== row.currentValue)
            : [];
    const modalSeatsChanged =
        currentPlanCatalogEntry &&
        targetPlanCatalogEntry &&
        currentPlanCatalogEntry.teamSeats !== targetPlanCatalogEntry.teamSeats;
    const modalNewFeatures =
        currentPlanCatalogEntry && targetPlanCatalogEntry
            ? FEATURE_LABELS.filter(
                  ({ key }) => !currentPlanCatalogEntry.features[key] && targetPlanCatalogEntry.features[key]
              )
            : [];

    // Subscription/usage/requests/admin-requests are all refetched together
    // (fetchSubscriptionData) - during that window the previous data stays
    // on screen, so every action below that reads or mutates it (checkout,
    // cancel request, upgrade CTA, admin review) must be disabled or it can
    // fire against data that's already stale mid-refresh.
    const pageBusy = loadingSubscription || refreshingSubscription;

    return (
        <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[#29D8D5]/12 blur-3xl" />
                <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-[#44F3F0]/10 blur-3xl" />
                <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-[var(--ohnix-line-2)] blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:py-10 space-y-6 sm:space-y-7">
                <div className="flex justify-start">
                    <Button
                        type="default"
                        onClick={() => navigate("/profile")}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-2 text-sm font-medium text-[var(--ohnix-text-primary)] hover:bg-[var(--ohnix-hover-overlay)] hover:border-[var(--ohnix-line-6)]"
                        icon={<ArrowLeftOutlined className="text-[#44F3F0]" />}
                    >
                        {t("profile.back_to_dashboard")}
                    </Button>
                </div>

                <div className="rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-5 sm:p-6 lg:p-8 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-md">
                    <Title level={2} className="!text-[var(--ohnix-text-primary)] !mb-1">
                        {t("profile.subscription.manage_plan")}
                    </Title>
                    <Text className="text-[var(--ohnix-text-muted)]">
                        {t("profile.subscription.description")}
                    </Text>

                    {billingLoadWarning ? (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-[var(--ohnix-alert-amber-text)]">
                            <WarningOutlined className="mt-0.5 shrink-0 text-amber-400" />
                            <span>{billingLoadWarning}</span>
                        </div>
                    ) : null}

                    <SubscriptionPlanCard
                        loading={loadingSubscription}
                        refreshing={refreshingSubscription}
                        subscription={subscription || user?.subscription}
                        usage={usage}
                        onRefresh={handleRefreshSubscription}
                        onPause={handlePause}
                        onCancel={handleCancel}
                        onReactivate={handleReactivate}
                        onDowngrade={handleDowngrade}
                        onUndoDowngrade={handleUndoDowngrade}
                        onRequestUpgrade={handleRequestUpgrade}
                        onRenew={handleRenew}
                        isAdmin={isAdmin}
                    />

                    <PlanComparisonCard
                        currentPlan={
                            (subscription || user?.subscription)?.effectivePlan ||
                            (subscription || user?.subscription)?.plan ||
                            "starter"
                        }
                        onRequestUpgrade={handleRequestUpgrade}
                        disabled={pageBusy}
                    />

                    <ApiKeysPanel />
                    <IntegrationsPanel />

                    {latestActiveRequest ? (
                        <div className="mt-6 rounded-2xl border border-[#29D8D5]/20 bg-[#29D8D5]/8 p-4 sm:p-5">
                            <Title level={5} className="!text-[var(--ohnix-text-primary)] !mb-2">
                                {t("profile.subscription.tracker_title")}
                            </Title>
                            <Text className="text-[var(--ohnix-text-muted)]">
                                {t("profile.subscription.tracker_description")}
                            </Text>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.tracker_requested_plan")}
                                    </div>
                                    <div className="mt-1 text-sm text-[var(--ohnix-text-primary)]">
                                        {t(`profile.subscription.plan_${latestActiveRequest.currentPlan}`)} → {" "}
                                        {t(`profile.subscription.plan_${latestActiveRequest.targetPlan}`)}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.tracker_current_status")}
                                    </div>
                                    <div className="mt-1">
                                        <Tag color={REQUEST_STATUS_COLORS[latestActiveRequest.status] || "default"}>
                                            {t(`profile.subscription.request_status_${latestActiveRequest.status}`)}
                                        </Tag>
                                    </div>
                                </div>
                            </div>

                            {trackerEta ? (
                                <div
                                    className={`mt-3 rounded-xl border p-3 text-xs ${
                                        trackerEta.overdue
                                            ? "border-amber-300/30 bg-amber-500/10 text-[var(--ohnix-alert-amber-text)]"
                                            : "border-cyan-300/30 bg-cyan-500/10 text-[var(--ohnix-alert-cyan-text)]"
                                    }`}
                                >
                                    <span className="font-semibold">
                                        {t("profile.subscription.tracker_eta_label")}:
                                    </span>{" "}
                                    {trackerEta.text}
                                </div>
                            ) : null}

                            <div className="mt-4 space-y-2">
                                {TRACKER_STEP_KEYS.map((stepKey, index) => {
                                    const isDone = trackerCurrentStep >= index;
                                    const isCurrent = trackerCurrentStep === index;

                                    return (
                                        <div
                                            key={stepKey}
                                            className={`rounded-xl border p-3 ${
                                                isCurrent
                                                    ? "border-[#44F3F0]/45 bg-[#44F3F0]/12"
                                                    : isDone
                                                      ? "border-emerald-300/30 bg-emerald-500/10"
                                                      : "border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                                    {t(`profile.subscription.tracker_step_${stepKey}_title`)}
                                                </div>
                                                <Tag color={isDone ? "green" : "default"}>
                                                    {isCurrent
                                                        ? t("profile.subscription.tracker_now")
                                                        : isDone
                                                          ? t("profile.subscription.tracker_done")
                                                          : t("profile.subscription.tracker_pending")}
                                                </Tag>
                                            </div>
                                            <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                                                {t(`profile.subscription.tracker_step_${stepKey}_description`)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    <div className="mt-6 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-5">
                        <Title level={5} className="!text-[var(--ohnix-text-primary)] !mb-2">
                            {t("profile.subscription.requests_title")}
                        </Title>
                        <Text className="text-[var(--ohnix-text-muted)]">
                            {t("profile.subscription.requests_description")}
                        </Text>

                        <List
                            className="mt-4"
                            split={false}
                            dataSource={safeRequests}
                            locale={{
                                emptyText: (
                                    <span className="text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.no_requests")}
                                    </span>
                                ),
                            }}
                            renderItem={(item) => (
                                <List.Item className="!border-0 !p-0 !mb-3 last:!mb-0">
                                    {(() => {
                                        const paymentUrl = item.paymentLink || extractFirstUrl(item.adminResponse);
                                        const selection = ensureCheckoutSelection(item.id);
                                        const methodsForCountry =
                                            checkoutMethodsByCountry[selection.country] || [];
                                        const statusPillStyle =
                                            REQUEST_STATUS_PILL_STYLES[item.status] || REQUEST_STATUS_PILL_STYLES.closed;

                                        return (
                                    <div className="relative w-full overflow-hidden rounded-2xl border border-[var(--ohnix-line-4)] bg-gradient-to-br from-[var(--ohnix-surface-card)] to-[var(--ohnix-surface-card-soft)] p-4 transition-colors duration-200 hover:border-[#29D8D5]/25 sm:p-5">
                                        <div className="pointer-events-none absolute -top-10 right-6 h-24 w-40 rounded-full bg-[#29D8D5]/5 blur-3xl" />
                                    <div className="relative flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[var(--ohnix-text-primary)] sm:text-base">
                                                <span>{t(`profile.subscription.plan_${item.currentPlan}`)}</span>
                                                <span className="text-[#29D8D5]">→</span>
                                                <span>{t(`profile.subscription.plan_${item.targetPlan}`)}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                                                {new Date(item.createdAt).toLocaleString()}
                                            </div>
                                            {(item.paymentProvider || isRealPaymentReference(item.paymentSessionId)) && (
                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--ohnix-text-muted)]">
                                                    {item.paymentProvider && (
                                                        <span>
                                                            {t("profile.subscription.payment_provider_label")}:{" "}
                                                            <span className="text-[var(--ohnix-text-soft)]">
                                                                {formatPaymentProviderLabel(item.paymentProvider)}
                                                            </span>
                                                        </span>
                                                    )}
                                                    {isRealPaymentReference(item.paymentSessionId) && (
                                                        <Tooltip title={item.paymentSessionId}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    navigator.clipboard?.writeText(item.paymentSessionId).then(
                                                                        () => toast.success(t("profile.subscription.payment_reference_copied")),
                                                                        () => {}
                                                                    );
                                                                }}
                                                                className="inline-flex items-center gap-1 text-[#29D8D5] hover:text-[#44F3F0]"
                                                            >
                                                                {t("profile.subscription.payment_reference_label")}:{" "}
                                                                <span className="max-w-[140px] truncate">{item.paymentSessionId}</span>
                                                                <CopyOutlined />
                                                            </button>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            )}
                                            {isDisplayableFreeText(item.notes) ? (
                                                <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                                                    {item.notes}
                                                </div>
                                            ) : null}
                                            {isDisplayableFreeText(item.adminResponse) ? (
                                                <div className="mt-1 text-xs text-[#44F3F0]">
                                                    {item.adminResponse}
                                                </div>
                                            ) : null}

                                            <div className="mt-2 text-xs text-[var(--ohnix-text-muted)]">
                                                {item.status === "closed" ? (
                                                    item.paymentStatus === "paid" ? (
                                                        <>
                                                            {t("profile.subscription.request_closed_paid", {
                                                                date: new Date(item.paidAt || item.updatedAt).toLocaleDateString(),
                                                            })}
                                                            {item.periodStartsAt && item.periodEndsAt ? (
                                                                // Exact period this request activated, snapshotted
                                                                // at the time - accurate even for a renewal from
                                                                // several cycles ago that's since been superseded.
                                                                <>
                                                                    {" "}
                                                                    {t("profile.subscription.request_closed_period", {
                                                                        start: new Date(item.periodStartsAt).toLocaleDateString(),
                                                                        end: new Date(item.periodEndsAt).toLocaleDateString(),
                                                                    })}
                                                                </>
                                                            ) : isPlanAlreadyActiveForRequest(item) && subscription?.endsAt ? (
                                                                // Older request, created before periodStartsAt/
                                                                // periodEndsAt existed - best-effort fallback, only
                                                                // accurate when this happens to be the request
                                                                // behind the currently active period.
                                                                <>
                                                                    {" "}
                                                                    {t("profile.subscription.request_closed_valid_until", {
                                                                        date: new Date(subscription.endsAt).toLocaleDateString(),
                                                                    })}
                                                                </>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        t("profile.subscription.request_closed_unpaid")
                                                    )
                                                ) : item.status === "approved" && isPlanAlreadyActiveForRequest(item) ? (
                                                    t("profile.subscription.request_status_help_approved_activated")
                                                ) : item.status === "approved" &&
                                                  item.targetPlan === "enterprise" &&
                                                  !paymentUrl ? (
                                                    // Overrides the generic "continue with payment" help
                                                    // text below - there's nothing to pay yet until an
                                                    // admin negotiates the amount and sets a payment link.
                                                    t("profile.subscription.request_status_help_approved_enterprise_pending")
                                                ) : (
                                                    t(`profile.subscription.request_status_help_${item.status}`)
                                                )}
                                            </div>

                                            {item.status === "approved" &&
                                            !isPlanAlreadyActiveForRequest(item) &&
                                            failedPaymentStatusForRequest(item) ? (
                                                <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-400/25 bg-rose-500/8 p-4 text-sm text-[var(--ohnix-alert-rose-text)]">
                                                    <CloseCircleOutlined className="mt-0.5 shrink-0 text-rose-400" />
                                                    <span>
                                                        {t(`profile.subscription.payment_status_${failedPaymentStatusForRequest(item)}`)}
                                                    </span>
                                                </div>
                                            ) : null}

                                            {item.status === "approved" &&
                                            !isPlanAlreadyActiveForRequest(item) &&
                                            isPaymentPendingForRequest(item) ? (
                                                <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-400/25 bg-amber-500/8 p-4 text-sm text-[var(--ohnix-alert-amber-text)]">
                                                    <ClockCircleOutlined className="mt-0.5 shrink-0 text-amber-400" />
                                                    <span>{t("profile.subscription.payment_pending_notice")}</span>
                                                </div>
                                            ) : item.status === "approved" && !isPlanAlreadyActiveForRequest(item) ? (
                                                (() => {
                                                    const isColombiaFlow = selection.country === "CO";
                                                    const planPriceLabel = formatPlanPriceForCountry(
                                                        selection.country,
                                                        item.targetPlan
                                                    );
                                                    const isLoading = checkoutLoadingRequestId === item.id;

                                                    // Enterprise has no fixed price, so there's no
                                                    // automated checkout to offer here (see
                                                    // shouldRouteToManualReview on the backend) - only
                                                    // the payment link an admin sets after negotiating
                                                    // the amount can complete this request.
                                                    if (item.targetPlan === "enterprise") {
                                                        return paymentUrl ? (
                                                            <div className="mt-4 rounded-2xl border border-[#29D8D5]/25 bg-[var(--ohnix-line-1)] p-4">
                                                                <div className="mb-3 text-xs text-[var(--ohnix-text-muted)]">
                                                                    {t("profile.subscription.enterprise_payment_ready_notice")}
                                                                </div>
                                                                {isDisplayableFreeText(item.adminResponse) ? (
                                                                    // The negotiated capacity/price - required from
                                                                    // the admin before they can even set this
                                                                    // request to "approved" (see
                                                                    // updateUpgradeRequestAdmin), so this should
                                                                    // never be empty here. Shown right next to the
                                                                    // pay button instead of only in the generic
                                                                    // notes area above, where it was easy to miss.
                                                                    <div className="mb-3 rounded-xl border border-[#29D8D5]/15 bg-[#29D8D5]/5 p-3 text-xs text-[var(--ohnix-text-soft)]">
                                                                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#29D8D5]">
                                                                            {t("profile.subscription.enterprise_agreed_details_label")}
                                                                        </div>
                                                                        {item.adminResponse}
                                                                    </div>
                                                                ) : null}
                                                                <a
                                                                    href={paymentUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="block w-full rounded-xl bg-[#29D8D5] px-5 py-3 text-center font-semibold text-[#021314] transition-colors hover:bg-[#44F3F0]"
                                                                >
                                                                    {t("profile.subscription.checkout_cta")}
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-400/25 bg-amber-500/8 p-4 text-sm text-[var(--ohnix-alert-amber-text)]">
                                                                <ClockCircleOutlined className="mt-0.5 shrink-0 text-amber-400" />
                                                                <span>{t("profile.subscription.enterprise_awaiting_payment_link")}</span>
                                                            </div>
                                                        );
                                                    }

                                                    if (isColombiaFlow) {
                                                        return (
                                                            <div className="mt-4">
                                                                <div className="relative overflow-hidden rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#050e1a] to-[#050c14] p-5">
                                                                    {/* Glow */}
                                                                    <div className="pointer-events-none absolute -top-12 left-1/2 h-28 w-72 -translate-x-1/2 rounded-full bg-[#29D8D5]/8 blur-3xl" />

                                                                    {/* Header pill */}
                                                                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/8 px-3 py-1">
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_5px_#29D8D5]" />
                                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#29D8D5]">
                                                                            Completar pago
                                                                        </span>
                                                                    </div>

                                                                    {/* Plan row */}
                                                                    <div className="mb-5 flex items-center justify-between gap-3">
                                                                        <div>
                                                                            <div className="text-sm text-[#a9b3b8]">
                                                                                {t(`profile.subscription.plan_${item.currentPlan}`)}
                                                                                {" "}
                                                                                <span className="text-[#29D8D5]">→</span>
                                                                                {" "}
                                                                                <span className="font-semibold text-white">
                                                                                    {t(`profile.subscription.plan_${item.targetPlan}`)}
                                                                                </span>
                                                                            </div>
                                                                            {planPriceLabel && (
                                                                                <div className="mt-0.5 text-xs text-[#6b8090]">
                                                                                    {planPriceLabel}
                                                                                    <span className="text-[#4a5e69]">/mes</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="shrink-0 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/5 px-2.5 py-1 text-[10px] font-medium text-[#29D8D5]">
                                                                            Colombia
                                                                        </div>
                                                                    </div>

                                                                    {/* ePayco button */}
                                                                    <button
                                                                        onClick={() => !isLoading && !pageBusy && handleStartCheckoutColombia(item)}
                                                                        disabled={isLoading || pageBusy}
                                                                        className={[
                                                                            "group relative w-full overflow-hidden rounded-xl border px-5 py-4 text-left transition-all duration-200",
                                                                            isLoading || pageBusy
                                                                                ? "cursor-not-allowed border-[#00AFF0]/20 bg-[#00AFF0]/5 opacity-60"
                                                                                : "cursor-pointer border-[#00AFF0]/35 bg-[#00AFF0]/8 hover:border-[#00AFF0]/60 hover:bg-[#00AFF0]/15",
                                                                        ].join(" ")}
                                                                    >
                                                                        {/* Shimmer on hover */}
                                                                        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent transition-transform duration-700 group-hover:translate-x-full" />

                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                {/* ePayco wordmark */}
                                                                                <div className="flex items-baseline gap-0.5">
                                                                                    <span className="text-xl font-black leading-none text-[#00AFF0]">e</span>
                                                                                    <span className="text-base font-bold leading-none text-white">Payco</span>
                                                                                </div>
                                                                                <div className="h-4 w-px bg-white/10" />
                                                                                <span className="text-sm font-medium text-white/90">
                                                                                    {isLoading ? "Redirigiendo..." : "Pagar con ePayco"}
                                                                                </span>
                                                                            </div>
                                                                            {isLoading ? (
                                                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#00AFF0]/30 border-t-[#00AFF0]" />
                                                                            ) : (
                                                                                <svg className="h-4 w-4 text-[#00AFF0] transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                                                </svg>
                                                                            )}
                                                                        </div>
                                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#4a6070]">
                                                                            {["PSE", "Tarjeta", "Nequi", "Daviplata"].map((m, i, arr) => (
                                                                                <React.Fragment key={m}>
                                                                                    <span>{m}</span>
                                                                                    {i < arr.length - 1 && <span className="text-[#2a3a44]">·</span>}
                                                                                </React.Fragment>
                                                                            ))}
                                                                        </div>
                                                                    </button>

                                                                    {/* Security footer */}
                                                                    <div className="mt-3.5 flex items-center gap-2 text-[10px] text-[#3a4e58]">
                                                                        <svg className="h-3 w-3 shrink-0 text-[#3a5060]" fill="currentColor" viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clipRule="evenodd" />
                                                                        </svg>
                                                                        <span>Transacción cifrada · PCI DSS · ePayco Colombia</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    // ── Otros países (Stripe) ────────────────────────────
                                                    const nonEpaycoMethods = methodsForCountry.filter((m) => m !== "epayco");
                                                    const canCheckout = Object.keys(checkoutMethodsByCountry).length > 0 || Boolean(paymentUrl);

                                                    return (
                                                        <div className="mt-4">
                                                            <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                                                                {/* Header pill */}
                                                                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/8 px-3 py-1">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_5px_#29D8D5]" />
                                                                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#29D8D5]">
                                                                        Completar pago
                                                                    </span>
                                                                </div>

                                                                {/* Plan row */}
                                                                <div className="mb-3 text-sm text-[var(--ohnix-text-muted)]">
                                                                    {t(`profile.subscription.plan_${item.currentPlan}`)}
                                                                    {" "}<span className="text-[#29D8D5]">→</span>{" "}
                                                                    <span className="font-semibold text-[var(--ohnix-text-primary)]">
                                                                        {t(`profile.subscription.plan_${item.targetPlan}`)}
                                                                    </span>
                                                                    {planPriceLabel && (
                                                                        <span className="ml-1 text-[#6b8090]">
                                                                            ({planPriceLabel}/mes)
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Selectors */}
                                                                <div className="mb-3 grid grid-cols-2 gap-2">
                                                                    <Select
                                                                        size="small"
                                                                        value={selection.country}
                                                                        options={Object.keys(checkoutMethodsByCountry)
                                                                            .filter((c) => c !== "CO")
                                                                            .map((countryCode) => ({
                                                                                value: countryCode,
                                                                                label: COUNTRY_LABELS[countryCode] || countryCode,
                                                                            }))}
                                                                        onChange={(country) => updateCheckoutCountry(item.id, country)}
                                                                    />
                                                                    <Select
                                                                        size="small"
                                                                        value={selection.method}
                                                                        options={nonEpaycoMethods.map((method) => ({
                                                                            value: method,
                                                                            label: PAYMENT_METHOD_LABELS[method] || method,
                                                                        }))}
                                                                        onChange={(method) => updateCheckoutMethod(item.id, method)}
                                                                    />
                                                                </div>

                                                                {canCheckout ? (
                                                                    <Button
                                                                        type="primary"
                                                                        loading={isLoading}
                                                                        disabled={pageBusy}
                                                                        onClick={() => handleStartCheckout(item)}
                                                                        className="!w-full !h-10 !rounded-xl !bg-[#29D8D5] !text-[#021314] !font-semibold hover:!bg-[#44F3F0] !border-0 disabled:!opacity-40 disabled:!cursor-not-allowed disabled:!pointer-events-none"
                                                                    >
                                                                        {t("profile.subscription.checkout_cta")}
                                                                    </Button>
                                                                ) : (
                                                                    <span className="block text-xs text-[#CDEFEF]">
                                                                        {t("profile.subscription.payment_link_missing")}
                                                                    </span>
                                                                )}

                                                                {/* Security footer */}
                                                                <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[#3a4e58]">
                                                                    <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clipRule="evenodd" />
                                                                    </svg>
                                                                    <span>Pago seguro · Stripe</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            ) : null}
                                        </div>
                                        <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                                            {currentActiveRequest?.id === item.id && (
                                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
                                                    <CheckCircleOutlined className="text-[10px]" />
                                                    {t("profile.subscription.active_request_badge")}
                                                </span>
                                            )}
                                            <span
                                                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusPillStyle.wrapperClass}`}
                                            >
                                                <span className={`h-1.5 w-1.5 rounded-full ${statusPillStyle.dotClass}`} />
                                                {t(`profile.subscription.request_status_${item.status}`)}
                                            </span>
                                            {isRequestCancellable(item) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => !pageBusy && setCancelTargetRequest(item)}
                                                    disabled={pageBusy}
                                                    className="text-[11px] font-medium text-[var(--ohnix-text-muted)] underline decoration-dotted underline-offset-2 transition-colors hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                                                >
                                                    {t("profile.subscription.cancel_request_button")}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                    </div>
                                        );
                                    })()}
                                </List.Item>
                            )}
                        />
                    </div>

                    {isAdmin ? (
                        <div className="mt-6 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-5">
                            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <Title level={5} className="!text-[var(--ohnix-text-primary)] !mb-2">
                                        {t("profile.subscription.admin_requests_title")}
                                    </Title>
                                    <Text className="text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.admin_requests_description")}
                                    </Text>
                                </div>

                                <div className="grid w-full grid-cols-1 gap-2 sm:w-[430px] sm:grid-cols-2">
                                    <Select
                                        value={adminFilterStatus}
                                        onChange={setAdminFilterStatus}
                                        options={[
                                            {
                                                value: "",
                                                label: t("profile.subscription.all_statuses"),
                                            },
                                            ...REQUEST_STATUS_OPTIONS.map((status) => ({
                                                value: status,
                                                label: t(
                                                    `profile.subscription.request_status_${status}`
                                                ),
                                            })),
                                        ]}
                                    />
                                    <Input
                                        value={adminSearch}
                                        onChange={(event) => setAdminSearch(event.target.value)}
                                        placeholder={t("profile.subscription.search_user_placeholder")}
                                    />
                                </div>
                            </div>

                            <List
                                className="mt-4"
                                dataSource={filteredAdminRequests}
                                pagination={{
                                    pageSize: 8,
                                    showSizeChanger: false,
                                    hideOnSinglePage: true,
                                }}
                                locale={{
                                    emptyText: (
                                        <span className="text-[var(--ohnix-text-muted)]">
                                            {t("profile.subscription.no_requests")}
                                        </span>
                                    ),
                                }}
                                renderItem={(item) => (
                                    <List.Item className="!border-[var(--ohnix-line-4)]">
                                        <div className="flex w-full flex-col gap-3">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <Text className="text-[var(--ohnix-text-primary)]">
                                                        {item.user?.username || item.user?.email || "User"}
                                                    </Text>
                                                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                                                        {item.user?.email || "-"}
                                                    </div>
                                                    <div className="mt-1 text-sm text-[var(--ohnix-text-primary)]">
                                                        {t(`profile.subscription.plan_${item.currentPlan}`)} → {" "}
                                                        {t(`profile.subscription.plan_${item.targetPlan}`)}
                                                    </div>
                                                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                                                        {new Date(item.createdAt).toLocaleString()}
                                                    </div>
                                                    {item.notes ? (
                                                        <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                                                            {item.notes}
                                                        </div>
                                                    ) : null}
                                                    {item.adminResponse ? (
                                                        <div className="mt-1 text-xs text-[#44F3F0]">
                                                            {item.adminResponse}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <Tag color={REQUEST_STATUS_COLORS[item.status] || "default"}>
                                                    {t(
                                                        `profile.subscription.request_status_${item.status}`
                                                    )}
                                                </Tag>
                                            </div>

                                            <div>
                                                <Button
                                                    size="small"
                                                    onClick={() => openAdminReview(item)}
                                                    disabled={pageBusy}
                                                    className="rounded-lg border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                                                >
                                                    {t("profile.subscription.review_request")}
                                                </Button>
                                            </div>
                                        </div>
                                    </List.Item>
                                )}
                            />
                        </div>
                    ) : null}
                </div>
            </div>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <RocketOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("profile.subscription.request_modal_title")}
                        </span>
                    </div>
                }
                open={requestModalOpen}
                onCancel={() => setRequestModalOpen(false)}
                onOk={() => upgradeForm.submit()}
                okText={t("profile.subscription.submit_request")}
                cancelText={t("common.cancel")}
                okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
                confirmLoading={requestSubmitting}
                destroyOnClose
                width={640}
                styles={darkModalStyles}
            >
                <Form
                    form={upgradeForm}
                    layout="vertical"
                    onFinish={submitUpgradeRequest}
                >
                    <div className="mb-1 flex items-center gap-2 text-xs text-[var(--ohnix-text-muted)]">
                        <span className="rounded-full border border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] px-2.5 py-1">
                            {t("profile.subscription.payment_success_limits")}: <strong className="text-[var(--ohnix-text-primary)]">{t(`profile.subscription.plan_${currentPlan}`)}</strong>
                        </span>
                    </div>

                    <Form.Item
                        name="targetPlan"
                        label={t("profile.subscription.target_plan")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                        className="!mb-4"
                    >
                        <PlanPickerCards
                            options={availableUpgradeOptions}
                            catalog={planCatalog}
                            priceByPlanKey={priceByPlanKey}
                            t={t}
                        />
                    </Form.Item>

                    {targetPlanCatalogEntry && (
                        <div className="mb-5 rounded-2xl border border-[#29D8D5]/20 bg-gradient-to-br from-[#29D8D5]/[0.06] to-transparent p-4">
                            <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ohnix-text-muted)]">
                                {t("profile.subscription.comparison.title", {
                                    plan: t(`profile.subscription.plan_${selectedTargetPlan}`),
                                })}
                            </Text>

                            {(modalLimitDeltas.length > 0 || modalSeatsChanged) && (
                                <div className="mt-3">
                                    <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.comparison.more_capacity")}
                                    </Text>
                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {modalLimitDeltas.map((row) => (
                                            <div
                                                key={row.limitKey}
                                                className="flex items-center justify-between rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs"
                                            >
                                                <span className="text-[var(--ohnix-text-muted)]">
                                                    {t(`profile.subscription.metrics.${row.metricKey}`)}
                                                </span>
                                                <span className="font-semibold text-[var(--ohnix-text-primary)]">
                                                    {formatLimit(row.currentValue)}
                                                    <ArrowRightOutlined style={{ fontSize: 10 }} className="mx-1 text-[#29D8D5]" />
                                                    {formatLimit(row.nextValue)}
                                                </span>
                                            </div>
                                        ))}
                                        {modalSeatsChanged && (
                                            <div className="flex items-center justify-between rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs">
                                                <span className="text-[var(--ohnix-text-muted)]">
                                                    {t("profile.subscription.metrics.team_seats")}
                                                </span>
                                                <span className="font-semibold text-[var(--ohnix-text-primary)]">
                                                    {formatLimit(currentPlanCatalogEntry.teamSeats)}
                                                    <ArrowRightOutlined style={{ fontSize: 10 }} className="mx-1 text-[#29D8D5]" />
                                                    {formatLimit(targetPlanCatalogEntry.teamSeats)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {modalNewFeatures.length > 0 && (
                                <div className="mt-3">
                                    <Text className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.comparison.new_features")}
                                    </Text>
                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {modalNewFeatures.map(({ key, es, en }) => (
                                            <div key={key} className="flex items-center gap-2 text-xs text-[var(--ohnix-text-soft)]">
                                                <CheckCircleOutlined className="text-[#29D8D5]" style={{ fontSize: 13 }} />
                                                <span>{lang === "en" ? en : es}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <Form.Item
                        name="notes"
                        label={t("profile.subscription.request_notes")}
                        rules={[
                            { max: 800 },
                            ...(selectedTargetPlan === "enterprise"
                                ? [{ required: true, message: t("validation.required_field") }]
                                : []),
                        ]}
                    >
                        <TextArea
                            rows={4}
                            className="auth-ohnix-input"
                            placeholder={
                                selectedTargetPlan === "enterprise"
                                    ? t("profile.subscription.request_notes_placeholder_enterprise")
                                    : t("profile.subscription.request_notes_placeholder")
                            }
                        />
                    </Form.Item>

                    {selectedTargetPlan === "enterprise" ? (
                        // Enterprise has no fixed price - every request is
                        // routed to manual review regardless of this
                        // checkbox (see shouldRouteToManualReview on the
                        // backend), so showing it here would just promise a
                        // choice that doesn't exist. This notice replaces it.
                        <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-500/8 px-3 py-2.5 text-xs text-[var(--ohnix-alert-amber-text)]">
                            <ClockCircleOutlined className="mt-0.5 shrink-0 text-amber-400" />
                            <span>{t("profile.subscription.enterprise_review_notice")}</span>
                        </div>
                    ) : (
                        <Form.Item
                            name="requiresManualReview"
                            valuePropName="checked"
                        >
                            <Checkbox>
                                {t("profile.subscription.special_review_checkbox")}
                            </Checkbox>
                            <div className="mt-1 text-xs text-[var(--ohnix-text-dim)]">
                                {t("profile.subscription.special_review_help")}
                            </div>
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <AuditOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("profile.subscription.admin_review_title")}
                        </span>
                    </div>
                }
                open={adminModalOpen}
                onCancel={() => {
                    setAdminModalOpen(false);
                    setSelectedAdminRequest(null);
                }}
                onOk={() => adminReviewForm.submit()}
                okText={t("profile.subscription.update_request")}
                cancelText={t("common.cancel")}
                okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
                confirmLoading={adminSubmitting}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Form
                    form={adminReviewForm}
                    layout="vertical"
                    onFinish={submitAdminReview}
                >
                    <Form.Item
                        name="status"
                        label={t("profile.subscription.target_status")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Select
                            options={REQUEST_STATUS_OPTIONS.map((status) => ({
                                value: status,
                                label: t(`profile.subscription.request_status_${status}`),
                            }))}
                        />
                    </Form.Item>

                    <Form.Item
                        name="adminResponse"
                        label={t("profile.subscription.admin_response")}
                        extra={
                            selectedAdminRequest?.targetPlan === "enterprise" &&
                            adminReviewStatus === "approved"
                                ? t("profile.subscription.admin_response_required_on_approved_enterprise")
                                : undefined
                        }
                        rules={[
                            { max: 800 },
                            {
                                validator: (_, value) => {
                                    if (
                                        !value?.trim() &&
                                        selectedAdminRequest?.targetPlan === "enterprise" &&
                                        adminReviewStatus === "approved" &&
                                        !selectedAdminRequest?.adminResponse
                                    ) {
                                        return Promise.reject(
                                            new Error(
                                                t(
                                                    "profile.subscription.admin_response_required_on_approved_enterprise"
                                                )
                                            )
                                        );
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <TextArea
                            rows={4}
                            className="auth-ohnix-input"
                            placeholder={
                                selectedAdminRequest?.targetPlan === "enterprise"
                                    ? t("profile.subscription.admin_response_placeholder_enterprise")
                                    : t("profile.subscription.admin_response_placeholder")
                            }
                        />
                    </Form.Item>

                    <Form.Item
                        name="paymentLink"
                        label={t("profile.subscription.payment_link")}
                        extra={
                            selectedAdminRequest?.targetPlan === "enterprise" &&
                            adminReviewStatus === "approved"
                                ? t("profile.subscription.payment_link_required_on_approved")
                                : undefined
                        }
                        rules={[
                            {
                                validator: (_, value) => {
                                    if (!value) {
                                        if (
                                            selectedAdminRequest?.targetPlan === "enterprise" &&
                                            adminReviewStatus === "approved" &&
                                            !selectedAdminRequest?.paymentLink
                                        ) {
                                            return Promise.reject(
                                                new Error(
                                                    t(
                                                        "profile.subscription.payment_link_required_on_approved"
                                                    )
                                                )
                                            );
                                        }
                                        return Promise.resolve();
                                    }

                                    return isValidHttpUrl(value)
                                        ? Promise.resolve()
                                        : Promise.reject(
                                              new Error(
                                                  t(
                                                      "profile.subscription.payment_link_invalid"
                                                  )
                                              )
                                          );
                                },
                            },
                        ]}
                    >
                        <Input
                            className="auth-ohnix-input"
                            placeholder={t("profile.subscription.payment_link_placeholder")}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("profile.subscription.cancel_request_confirm_title")}
                    </span>
                }
                open={Boolean(cancelTargetRequest)}
                onCancel={() => setCancelTargetRequest(null)}
                onOk={handleConfirmCancelRequest}
                okText={t("profile.subscription.cancel_request_confirm_ok")}
                cancelText={t("common.cancel")}
                okButtonProps={{ danger: true, className: "h-10 px-6 rounded-md font-medium" }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
                confirmLoading={cancellingRequestId === cancelTargetRequest?.id}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Text className="text-[var(--ohnix-text-muted)]">
                    {t("profile.subscription.cancel_request_confirm_body")}
                </Text>
            </Modal>
        </div>
    );
};

export default Billing;
