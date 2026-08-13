import React, { useContext, useEffect, useState } from "react";
import { Button, Typography, Modal, Form, Select, Input, List, Tag, Checkbox } from "antd";
import { ArrowLeftOutlined, LockOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import { subscriptionService } from "../services/subscriptionService";
import SubscriptionPlanCard from "../components/profile/SubscriptionPlanCard";
import ApiKeysPanel from "../components/billing/ApiKeysPanel";

const { Title, Text } = Typography;
const { TextArea } = Input;

const REQUEST_STATUS_COLORS = {
    open: "blue",
    reviewing: "gold",
    approved: "green",
    rejected: "red",
    closed: "default",
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

// COP display prices — keep in sync with EPAYCO_AMOUNT_*_COP in .env
const PLAN_COP_DISPLAY = {
    growth: "COP $99.000",
    scale: "COP $200.000",
    enterprise: "COP $299.000",
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
};

const Billing = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, refreshUser } = useContext(AuthContext);
    const { isOwner, hasPermission } = useTeam();
    const canViewBilling = isOwner || hasPermission("billing", "view");
    const { t } = useI18n();

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
    const [checkoutMethodsByCountry, setCheckoutMethodsByCountry] = useState({});
    const [checkoutSelectionByRequestId, setCheckoutSelectionByRequestId] = useState({});
    const [billingLoadWarning, setBillingLoadWarning] = useState("");
    const [selectedAdminRequest, setSelectedAdminRequest] = useState(null);
    const [upgradeForm] = Form.useForm();
    const [adminReviewForm] = Form.useForm();

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

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get("payment") === "cancelled") {
            toast.error(t("profile.subscription.payment_cancelled"));
        }
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
                        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            {billingLoadWarning}
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
                        onRequestUpgrade={handleRequestUpgrade}
                        onRenew={handleRenew}
                    />

                    <ApiKeysPanel />

                    {latestActiveRequest ? (
                        <div className="mt-6 rounded-2xl border border-[#29D8D5]/20 bg-[#29D8D5]/8 p-4 sm:p-5">
                            <Title level={5} className="!text-[var(--ohnix-text-primary)] !mb-2">
                                {t("profile.subscription.tracker_title")}
                            </Title>
                            <Text className="text-[#CFE8E8]">
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
                                            ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
                                            : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100"
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
                                            <div className="mt-1 text-xs text-[#C9D3D9]">
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
                            dataSource={safeRequests}
                            locale={{
                                emptyText: (
                                    <span className="text-[var(--ohnix-text-muted)]">
                                        {t("profile.subscription.no_requests")}
                                    </span>
                                ),
                            }}
                            renderItem={(item) => (
                                <List.Item className="!border-[var(--ohnix-line-4)]">
                                    {(() => {
                                        const paymentUrl = item.paymentLink || extractFirstUrl(item.adminResponse);
                                        const selection = ensureCheckoutSelection(item.id);
                                        const methodsForCountry =
                                            checkoutMethodsByCountry[selection.country] || [];

                                        return (
                                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <Text className="text-[var(--ohnix-text-primary)]">
                                                {t(`profile.subscription.plan_${item.currentPlan}`)} → {" "}
                                                {t(`profile.subscription.plan_${item.targetPlan}`)}
                                            </Text>
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

                                            <div className="mt-2 text-xs text-[var(--ohnix-text-muted)]">
                                                {item.status === "approved" && isPlanAlreadyActiveForRequest(item)
                                                    ? t("profile.subscription.request_status_help_approved_activated")
                                                    : t(`profile.subscription.request_status_help_${item.status}`)}
                                            </div>

                                            {item.status === "approved" &&
                                            !isPlanAlreadyActiveForRequest(item) &&
                                            isPaymentPendingForRequest(item) ? (
                                                <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/8 p-4 text-sm text-amber-100">
                                                    {t("profile.subscription.payment_pending_notice")}
                                                </div>
                                            ) : item.status === "approved" && !isPlanAlreadyActiveForRequest(item) ? (
                                                (() => {
                                                    const isColombiaFlow = selection.country === "CO";
                                                    const copPrice = PLAN_COP_DISPLAY[item.targetPlan];
                                                    const isLoading = checkoutLoadingRequestId === item.id;

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
                                                                            <div className="text-sm text-[var(--ohnix-text-muted)]">
                                                                                {t(`profile.subscription.plan_${item.currentPlan}`)}
                                                                                {" "}
                                                                                <span className="text-[#29D8D5]">→</span>
                                                                                {" "}
                                                                                <span className="font-semibold text-[var(--ohnix-text-primary)]">
                                                                                    {t(`profile.subscription.plan_${item.targetPlan}`)}
                                                                                </span>
                                                                            </div>
                                                                            {copPrice && (
                                                                                <div className="mt-0.5 text-xs text-[#6b8090]">
                                                                                    {copPrice}
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
                                                                        onClick={() => !isLoading && handleStartCheckoutColombia(item)}
                                                                        disabled={isLoading}
                                                                        className={[
                                                                            "group relative w-full overflow-hidden rounded-xl border px-5 py-4 text-left transition-all duration-200",
                                                                            isLoading
                                                                                ? "cursor-not-allowed border-[#00AFF0]/20 bg-[#00AFF0]/5 opacity-60"
                                                                                : "cursor-pointer border-[#00AFF0]/35 bg-[#00AFF0]/8 hover:border-[#00AFF0]/60 hover:bg-[#00AFF0]/15",
                                                                        ].join(" ")}
                                                                    >
                                                                        {/* Shimmer on hover */}
                                                                        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[var(--ohnix-line-2)] to-transparent transition-transform duration-700 group-hover:translate-x-full" />

                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                {/* ePayco wordmark */}
                                                                                <div className="flex items-baseline gap-0.5">
                                                                                    <span className="text-xl font-black leading-none text-[#00AFF0]">e</span>
                                                                                    <span className="text-base font-bold leading-none text-[var(--ohnix-text-primary)]">Payco</span>
                                                                                </div>
                                                                                <div className="h-4 w-px bg-[var(--ohnix-line-4)]" />
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
                                                                                label: countryCode === "ES" ? "España" : countryCode,
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
                                                                        onClick={() => handleStartCheckout(item)}
                                                                        className="!w-full !h-10 !rounded-xl !bg-[#29D8D5] !text-[#021314] !font-semibold hover:!bg-[#44F3F0] !border-0"
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
                                        <Tag color={REQUEST_STATUS_COLORS[item.status] || "default"}>
                                            {t(`profile.subscription.request_status_${item.status}`)}
                                        </Tag>
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
                                                    className="rounded-lg border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
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
                title={t("profile.subscription.request_modal_title")}
                open={requestModalOpen}
                onCancel={() => setRequestModalOpen(false)}
                onOk={() => upgradeForm.submit()}
                okText={t("profile.subscription.submit_request")}
                cancelText={t("common.cancel")}
                confirmLoading={requestSubmitting}
                destroyOnClose
            >
                <Form
                    form={upgradeForm}
                    layout="vertical"
                    onFinish={submitUpgradeRequest}
                >
                    <Form.Item
                        name="targetPlan"
                        label={t("profile.subscription.target_plan")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Select
                            options={availableUpgradeOptions.map((plan) => ({
                                value: plan,
                                label: t(`profile.subscription.plan_${plan}`),
                            }))}
                        />
                    </Form.Item>

                    <Form.Item
                        name="notes"
                        label={t("profile.subscription.request_notes")}
                        rules={[{ max: 800 }]}
                    >
                        <TextArea
                            rows={4}
                            placeholder={t("profile.subscription.request_notes_placeholder")}
                        />
                    </Form.Item>

                    <Form.Item
                        name="requiresManualReview"
                        valuePropName="checked"
                    >
                        <Checkbox>
                            {t("profile.subscription.special_review_checkbox")}
                        </Checkbox>
                        <div className="mt-1 text-xs text-[#6b7280]">
                            {t("profile.subscription.special_review_help")}
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t("profile.subscription.admin_review_title")}
                open={adminModalOpen}
                onCancel={() => {
                    setAdminModalOpen(false);
                    setSelectedAdminRequest(null);
                }}
                onOk={() => adminReviewForm.submit()}
                okText={t("profile.subscription.update_request")}
                cancelText={t("common.cancel")}
                confirmLoading={adminSubmitting}
                destroyOnClose
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
                        rules={[{ max: 800 }]}
                    >
                        <TextArea
                            rows={4}
                            placeholder={t("profile.subscription.admin_response_placeholder")}
                        />
                    </Form.Item>

                    <Form.Item
                        name="paymentLink"
                        label={t("profile.subscription.payment_link")}
                        rules={[
                            {
                                validator: (_, value) => {
                                    if (!value) {
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
                            placeholder={t("profile.subscription.payment_link_placeholder")}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Billing;
