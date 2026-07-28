import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Progress, Spin, Typography } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { subscriptionService } from "../services/subscriptionService";
import useI18n from "../hooks/useI18n";

const { Title, Text } = Typography;

const CHECKLIST_STEP_KEYS = [
    "setup_basics",
    "create_first_product",
    "run_first_operation",
    "review_first_report",
    "invite_first_member",
];

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [searchParams] = useSearchParams();

    const requestId = searchParams.get("requestId") || "";

    const [loading, setLoading] = useState(true);
    const [statusData, setStatusData] = useState(null);
    const [usageData, setUsageData] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");

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
    }, [requestId, t]);

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

        return [
            { key: CHECKLIST_STEP_KEYS[0], done: isBasicsConfigured },
            { key: CHECKLIST_STEP_KEYS[1], done: hasProducts },
            { key: CHECKLIST_STEP_KEYS[2], done: hasOperations },
            { key: CHECKLIST_STEP_KEYS[3], done: false },
            { key: CHECKLIST_STEP_KEYS[4], done: false },
        ];
    }, [usageData]);

    const completedSteps = checklist.filter((step) => step.done).length;
    const completionPercent = Math.round((completedSteps / checklist.length) * 100);

    const subscription = statusData?.subscription;
    const request = statusData?.request;
    const activated = request?.status === "closed" && statusData?.targetPlanActive;

    return (
        <div className="min-h-screen bg-[#050608] px-4 py-10 text-white">
            <div className="mx-auto w-full max-w-4xl space-y-6">
                <Card className="!rounded-2xl !border !border-white/10 !bg-white/[0.03]">
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
                            className="!bg-red-500/10 !text-white"
                        />
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-start gap-3">
                                <CheckCircleOutlined className="mt-1 text-2xl text-emerald-400" />
                                <div>
                                    <Title level={3} className="!mb-1 !text-white">
                                        {activated
                                            ? t("profile.subscription.payment_success_title")
                                            : t("profile.subscription.payment_success_pending_title")}
                                    </Title>
                                    <Text className="text-[#A9B3B8]">
                                        {activated
                                            ? t("profile.subscription.payment_success_subtitle")
                                            : t("profile.subscription.payment_success_pending_subtitle")}
                                    </Text>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[#A9B3B8]">
                                        {t("profile.subscription.payment_success_plan")}
                                    </div>
                                    <div className="mt-1 text-sm text-white">
                                        {request?.currentPlan} → {request?.targetPlan}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                                    <div className="text-xs uppercase tracking-[0.14em] text-[#A9B3B8]">
                                        {t("profile.subscription.payment_success_limits")}
                                    </div>
                                    <div className="mt-1 text-sm text-white">
                                        {subscription?.plan || "starter"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                <Card className="!rounded-2xl !border !border-white/10 !bg-white/[0.03]">
                    <Title level={4} className="!mb-1 !text-white">
                        {t("profile.subscription.aha_title")}
                    </Title>
                    <Text className="text-[#A9B3B8]">
                        {t("profile.subscription.aha_description")}
                    </Text>

                    <div className="mt-4">
                        <Progress percent={completionPercent} showInfo strokeColor="#29D8D5" />
                        <div className="mt-1 text-xs text-[#A9B3B8]">
                            {t("profile.subscription.checklist_progress", {
                                completed: completedSteps,
                                total: checklist.length,
                            })}
                        </div>
                    </div>

                    <div className="mt-4 space-y-2">
                        {checklist.map((step) => (
                            <div
                                key={step.key}
                                className={`rounded-xl border p-3 text-sm ${
                                    step.done
                                        ? "border-emerald-300/35 bg-emerald-500/10"
                                        : "border-white/10 bg-white/[0.02]"
                                }`}
                            >
                                <span className="font-medium text-white">
                                    {step.done ? "✓ " : "○ "}
                                </span>
                                <span className="text-[#D5DFE6]">
                                    {t(`profile.subscription.checklist_${step.key}`)}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        <Button
                            type="primary"
                            className="!rounded-lg !bg-[#29D8D5] !text-[#041316] hover:!bg-[#44F3F0]"
                            onClick={() => navigate("/dashboard")}
                        >
                            {t("profile.subscription.payment_success_primary_cta")}
                        </Button>
                        <Button
                            className="!rounded-lg !border-white/15 !bg-white/[0.02] !text-white"
                            onClick={() => navigate("/billing")}
                        >
                            {t("profile.subscription.back_to_billing")}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default PaymentSuccess;