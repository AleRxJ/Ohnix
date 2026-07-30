import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Progress, Spin, Typography, Tag } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { subscriptionService } from "../services/subscriptionService";
import useI18n from "../hooks/useI18n";
import AuthContext from "../context/AuthContext";

const { Title, Text } = Typography;

const CHECKLIST_STEP_KEYS = [
    "setup_basics",
    "create_first_product",
    "run_first_operation",
    "review_first_report",
    "invite_first_member",
];

const ONBOARDING_PROGRESS_STORAGE_KEY = "ohnix:onboarding-checklist";

const readStoredChecklist = () => {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(ONBOARDING_PROGRESS_STORAGE_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [searchParams] = useSearchParams();
    const { user } = useContext(AuthContext);

    const requestId = searchParams.get("requestId") || "";
    const sessionId = searchParams.get("session_id") || "";

    const [loading, setLoading] = useState(true);
    const [statusData, setStatusData] = useState(null);
    const [usageData, setUsageData] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [manualChecklistDone, setManualChecklistDone] = useState(() => readStoredChecklist());

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.localStorage.setItem(
            ONBOARDING_PROGRESS_STORAGE_KEY,
            JSON.stringify(manualChecklistDone)
        );
    }, [manualChecklistDone]);

    useEffect(() => {
        let isMounted = true;
        let pollTimer;
        let pollCount = 0;

        const load = async () => {
            if (!requestId) {
                if (isMounted) {
                    setErrorMessage(t("profile.subscription.payment_success_missing_request"));
                    setLoading(false);
                }
                return;
            }

            try {
                const [statusResponse, usageResponse] = await Promise.all([
                    subscriptionService.getUpgradeCheckoutStatus(requestId),
                    subscriptionService.getMyUsage(),
                ]);

                if (!isMounted) {
                    return;
                }

                setStatusData(statusResponse?.data || null);
                setUsageData(usageResponse?.data || null);

                const requestStatus = statusResponse?.data?.request?.status;
                const targetPlanActive = statusResponse?.data?.targetPlanActive;

                // After 5 polls without activation, try direct session verification
                // as fallback for when Stripe webhook hasn't arrived yet
                if (!(requestStatus === "closed" && targetPlanActive) && pollCount === 5 && sessionId) {
                    try {
                        await subscriptionService.verifyAndActivateBySession(requestId, sessionId);
                        // Re-check status after forced activation
                        const refreshed = await subscriptionService.getUpgradeCheckoutStatus(requestId);
                        if (refreshed?.data?.targetPlanActive) {
                            setStatusData(refreshed?.data || null);
                            setLoading(false);
                            return;
                        }
                    } catch {
                        // Fallback failed silently, keep polling
                    }
                }

                if (!(requestStatus === "closed" && targetPlanActive) && pollCount < 15) {
                    pollCount += 1;
                    pollTimer = setTimeout(load, 4000);
                } else {
                    setLoading(false);
                }
            } catch (error) {
                if (isMounted) {
                    setErrorMessage(
                        error?.response?.data?.message ||
                            t("profile.subscription.payment_success_load_failed")
                    );
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            isMounted = false;
            if (pollTimer) {
                clearTimeout(pollTimer);
            }
        };
    }, [requestId, sessionId, t]);

    const checklist = useMemo(() => {
        const usage = usageData?.usage || {};

        const isBasicsConfigured =
            (usage.customers?.used || 0) > 0 ||
            (usage.suppliers?.used || 0) > 0 ||
            (usage.categories?.used || 0) > 0 ||
            (usage.units?.used || 0) > 0;

        const hasProducts = (usage.products?.used || 0) > 0;
        const hasOperations =
            (usage.orders?.used || 0) > 0 || (usage.purchases?.used || 0) > 0;
        const hasReviewedReport =
            (manualChecklistDone.review_first_report || false) || hasOperations;

        const inviteTeamRoute = user?.role === "admin" ? "/admin/management" : "/profile";

        return [
            {
                key: CHECKLIST_STEP_KEYS[0],
                done: isBasicsConfigured,
                route: "/profile",
                actionLabel: t("profile.subscription.checklist_action_setup"),
            },
            {
                key: CHECKLIST_STEP_KEYS[1],
                done: hasProducts,
                route: "/products",
                actionLabel: t("profile.subscription.checklist_action_product"),
            },
            {
                key: CHECKLIST_STEP_KEYS[2],
                done: hasOperations,
                route: "/orders",
                secondaryRoute: "/purchases",
                actionLabel: t("profile.subscription.checklist_action_order"),
                secondaryActionLabel: t("profile.subscription.checklist_action_purchase"),
            },
            {
                key: CHECKLIST_STEP_KEYS[3],
                done: hasReviewedReport,
                route: "/reports",
                actionLabel: t("profile.subscription.checklist_action_report"),
                manualAllowed: true,
            },
            {
                key: CHECKLIST_STEP_KEYS[4],
                done: manualChecklistDone.invite_first_member || false,
                route: inviteTeamRoute,
                actionLabel: t("profile.subscription.checklist_action_invite"),
                manualAllowed: true,
            },
        ];
    }, [manualChecklistDone, t, usageData, user?.role]);

    const markChecklistStepDone = (stepKey) => {
        setManualChecklistDone((prev) => ({
            ...prev,
            [stepKey]: true,
        }));
    };

    const completedSteps = checklist.filter((step) => step.done).length;
    const completionPercent = Math.round((completedSteps / checklist.length) * 100);

    const subscription = statusData?.subscription;
    const request = statusData?.request;
    const activated = request?.status === "closed" && statusData?.targetPlanActive;
    const fromPlanLabel = request?.currentPlan
        ? t(`profile.subscription.plan_${request.currentPlan}`)
        : t("profile.subscription.plan_starter");
    const toPlanLabel = request?.targetPlan
        ? t(`profile.subscription.plan_${request.targetPlan}`)
        : "-";
    const currentPlanLabel = subscription?.plan
        ? t(`profile.subscription.plan_${subscription.plan}`)
        : t("profile.subscription.plan_starter");

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#050608] px-4 py-8 text-white sm:py-12">
            <div className="pointer-events-none absolute inset-0 opacity-90">
                <div className="payment-success-glow payment-success-glow-left" />
                <div className="payment-success-glow payment-success-glow-right" />
                <div className="payment-success-grid" />
            </div>

            <div className="relative mx-auto w-full max-w-5xl space-y-6">
                <Card className="!rounded-3xl !border !border-[#29D8D5]/20 !bg-[linear-gradient(145deg,rgba(7,19,23,0.92)_0%,rgba(8,30,36,0.85)_55%,rgba(9,14,17,0.95)_100%)] !shadow-[0_35px_120px_rgba(8,20,24,0.65)]">
                    {loading ? (
                        <div className="flex items-center gap-3 py-8">
                            <Spin />
                            <Text className="text-[#D5DFE6]">
                                {t("profile.subscription.payment_success_processing")}
                            </Text>
                        </div>
                    ) : errorMessage ? (
                        <Alert
                            type="error"
                            message={errorMessage}
                            showIcon
                            className="!rounded-xl !border !border-red-300/25 !bg-red-500/10 !text-white"
                        />
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="payment-success-float rounded-2xl border border-emerald-300/35 bg-emerald-500/15 p-3">
                                        <CheckCircleOutlined className="text-2xl text-emerald-300" />
                                    </div>
                                    <div>
                                        <Tag className="!mb-2 !rounded-full !border !border-[#44F3F0]/40 !bg-[#44F3F0]/10 !px-3 !py-1 !text-[10px] !font-semibold !uppercase !tracking-[0.16em] !text-[#9CFDFC]">
                                            {t("profile.subscription.payment_success_badge")}
                                        </Tag>
                                        <Title level={2} className="!mb-1 !text-white">
                                            {activated
                                                ? t("profile.subscription.payment_success_title")
                                                : t("profile.subscription.payment_success_pending_title")}
                                        </Title>
                                        <Text className="text-[#C2D2D8]">
                                            {activated
                                                ? t("profile.subscription.payment_success_subtitle")
                                                : t("profile.subscription.payment_success_pending_subtitle")}
                                        </Text>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#29D8D5]/25 bg-[#081419]/90 p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[#7FA4AA]">
                                        {t("profile.subscription.payment_success_plan")}
                                    </div>
                                    <div className="mt-1 text-sm text-white">
                                        {fromPlanLabel} → {toPlanLabel}
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[#8AA4AB]">
                                        {t("profile.subscription.payment_success_limits")}
                                    </div>
                                    <div className="mt-1 text-lg font-semibold capitalize text-[#E6F3F5]">
                                        {currentPlanLabel}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[#8AA4AB]">
                                        {t("profile.subscription.payment_success_next_label")}
                                    </div>
                                    <div className="mt-1 text-sm text-[#D9F3F3]">
                                        {t("profile.subscription.payment_success_next_value")}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="primary"
                                    className="!rounded-xl !border-0 !bg-[#29D8D5] !px-5 !text-[#041316] hover:!bg-[#44F3F0]"
                                    onClick={() => navigate("/dashboard", { state: { fromPayment: true } })}
                                >
                                    {t("profile.subscription.payment_success_primary_cta")}
                                </Button>
                                <Button
                                    className="!rounded-xl !border-white/20 !bg-white/[0.03] !px-5 !text-white hover:!border-[#29D8D5]/45 hover:!text-[#9CFDFC]"
                                    onClick={() => navigate("/billing")}
                                >
                                    {t("profile.subscription.back_to_billing")}
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>

                <Card className="!rounded-3xl !border !border-white/10 !bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.02)_100%)] !backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <Title level={3} className="!mb-1 !text-white">
                                {t("profile.subscription.aha_title")}
                            </Title>
                            <Text className="text-[#AFC2C8]">
                                {t("profile.subscription.aha_description")}
                            </Text>
                        </div>
                        <div className="payment-success-float-delayed rounded-xl border border-[#44F3F0]/35 bg-[#44F3F0]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9CFDFC]">
                            {completionPercent}%
                        </div>
                    </div>

                    <div className="mt-5">
                        <Progress
                            percent={completionPercent}
                            showInfo={false}
                            strokeColor={{
                                "0%": "#29D8D5",
                                "100%": "#8CFFF8",
                            }}
                            trailColor="rgba(255,255,255,0.12)"
                            strokeLinecap="round"
                        />
                        <div className="mt-2 text-xs text-[#AFC2C8]">
                            {t("profile.subscription.checklist_progress", {
                                completed: completedSteps,
                                total: checklist.length,
                            })}
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {checklist.map((step, index) => (
                            <div
                                key={step.key}
                                className={`rounded-2xl border p-4 transition-all duration-300 ${
                                    step.done
                                        ? "border-emerald-300/35 bg-emerald-500/10"
                                        : "border-white/10 bg-white/[0.02] hover:border-[#29D8D5]/40 hover:bg-[#29D8D5]/8"
                                }`}
                                style={{
                                    animation: `paymentSuccessSlideUp 380ms ease ${index * 70}ms both`,
                                }}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${
                                                step.done
                                                    ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                                                    : "border-white/15 bg-white/5 text-[#D8E8ED]"
                                            }`}
                                        >
                                            {step.done ? "✓" : index + 1}
                                        </span>
                                        <span className="text-sm font-medium text-[#E7F2F5]">
                                            {t(`profile.subscription.checklist_${step.key}`)}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            size="small"
                                            className="!rounded-lg !border-[#29D8D5]/40 !bg-[#29D8D5]/10 !text-[#A9FFFB] hover:!border-[#44F3F0]/60 hover:!text-[#D8FFFE]"
                                            onClick={() => navigate(step.route)}
                                        >
                                            {step.actionLabel}
                                        </Button>
                                        {step.secondaryRoute ? (
                                            <Button
                                                size="small"
                                                className="!rounded-lg !border-white/20 !bg-white/[0.03] !text-white"
                                                onClick={() => navigate(step.secondaryRoute)}
                                            >
                                                {step.secondaryActionLabel}
                                            </Button>
                                        ) : null}
                                        {step.manualAllowed && !step.done ? (
                                            <Button
                                                size="small"
                                                className="!rounded-lg !border-emerald-300/40 !bg-emerald-500/15 !text-emerald-100"
                                                onClick={() => markChecklistStepDone(step.key)}
                                            >
                                                {t("profile.subscription.checklist_mark_done")}
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-[#97B0B7]">
                        {t("profile.subscription.checklist_hint")}
                    </div>
                </Card>
            </div>

            <style>{`
                .payment-success-glow {
                    position: absolute;
                    border-radius: 9999px;
                    filter: blur(90px);
                    opacity: 0.8;
                    animation: paymentSuccessFloat 8s ease-in-out infinite;
                }

                .payment-success-glow-left {
                    width: 26rem;
                    height: 26rem;
                    left: -8rem;
                    top: -6rem;
                    background: rgba(41, 216, 213, 0.2);
                }

                .payment-success-glow-right {
                    width: 28rem;
                    height: 28rem;
                    right: -10rem;
                    top: 32%;
                    background: rgba(68, 243, 240, 0.16);
                    animation-delay: 1.2s;
                }

                .payment-success-grid {
                    position: absolute;
                    inset: 0;
                    background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
                    background-size: 48px 48px;
                    mask-image: radial-gradient(circle at center, black 48%, transparent 100%);
                }

                .payment-success-float {
                    animation: paymentSuccessFloat 5.5s ease-in-out infinite;
                }

                .payment-success-float-delayed {
                    animation: paymentSuccessFloat 6.4s ease-in-out infinite;
                    animation-delay: 0.9s;
                }

                @keyframes paymentSuccessFloat {
                    0%,
                    100% {
                        transform: translateY(0px);
                    }
                    50% {
                        transform: translateY(-6px);
                    }
                }

                @keyframes paymentSuccessSlideUp {
                    from {
                        opacity: 0;
                        transform: translateY(14px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0px);
                    }
                }
            `}</style>
        </div>
    );
};

export default PaymentSuccess;