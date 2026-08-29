import { Button, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, ArrowRightOutlined, RocketOutlined, GiftOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import SeoHead from "../../components/common/SeoHead";
import useI18n from "../../hooks/useI18n";
import { subscriptionService } from "../../services/subscriptionService";
import { pricingService } from "../../services/pricingService";
import { formatCurrency } from "../../utils/currency";

const { Text } = Typography;

const PLAN_SLA_KEY = {
    enterprise: "auth.request_status.sla_enterprise",
};

const SignupRequestStatus = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t, currentLanguage } = useI18n();

    const requestedPlan = useMemo(() => {
        const plan = searchParams.get("plan");
        return ["starter", "growth", "scale", "enterprise"].includes(plan) ? plan : "starter";
    }, [searchParams]);

    // Negocio/Escala never get the free trial - they go straight to
    // checkout (see registerUser in Backend/controllers/user.controller.js,
    // which now creates their subscription as a paused "no plan yet"
    // placeholder instead of granting a trial). Enterprise still goes
    // through manual review, unchanged.
    const isCheckoutPlan = requestedPlan === "growth" || requestedPlan === "scale";
    const isEnterpriseReview = requestedPlan === "enterprise";

    const [pendingRequestId, setPendingRequestId] = useState(null);
    const [checkoutMethodsByCountry, setCheckoutMethodsByCountry] = useState({});
    const [priceLabel, setPriceLabel] = useState(null);
    const [payLoading, setPayLoading] = useState(false);
    const [trialLoading, setTrialLoading] = useState(false);

    // Signup.jsx auto-logs Negocio/Escala in right after registration so
    // these calls (both authenticated) can run straight from this page,
    // without an extra manual-login step in between.
    useEffect(() => {
        if (!isCheckoutPlan) return;
        let active = true;

        Promise.all([
            subscriptionService.getMyUpgradeRequests(),
            subscriptionService.getCheckoutPaymentMethods(),
        ])
            .then(([requestsRes, methodsRes]) => {
                if (!active) return;
                const requests = requestsRes?.data || [];
                const match = requests.find(
                    (request) =>
                        request.targetPlan === requestedPlan &&
                        ["open", "reviewing", "approved"].includes(request.status)
                );
                setPendingRequestId(match?.id || null);
                setCheckoutMethodsByCountry(methodsRes?.data?.methodsByCountry || {});
            })
            .catch(() => {
                // Best-effort - the "continue to payment" CTA below falls
                // back to /billing, which resolves the same request itself.
            });

        return () => {
            active = false;
        };
    }, [isCheckoutPlan, requestedPlan]);

    // Price preview - purely informational on this page, checkout itself
    // always recomputes the real charge server-side (getAmountForPlanAndCurrency).
    useEffect(() => {
        if (!isCheckoutPlan) return;
        let active = true;

        pricingService
            .getPublicPricing("CO")
            .then((res) => {
                if (!active) return;
                const plan = (res?.data?.plans || []).find((entry) => entry.key === requestedPlan);
                const amount = plan?.monthlyAmount ?? plan?.amount;
                if (amount === null || amount === undefined) return;
                const currency = res?.data?.currency?.toUpperCase();
                const formatted = formatCurrency(amount, currency);
                const monthlySuffix = t("landing.pricing.monthly_suffix");
                setPriceLabel(`${currency === "COP" ? `${formatted} COP` : formatted}${monthlySuffix}`);
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, [isCheckoutPlan, requestedPlan, t]);

    const handleContinuePayment = async () => {
        if (!pendingRequestId) {
            navigate("/billing");
            return;
        }

        try {
            setPayLoading(true);
            const fallbackCountry = Object.keys(checkoutMethodsByCountry)[0] || "CO";
            const fallbackMethod = checkoutMethodsByCountry[fallbackCountry]?.[0] || "epayco";
            const response = await subscriptionService.createUpgradeCheckoutSessionWithMethod(
                pendingRequestId,
                { country: fallbackCountry, paymentMethod: fallbackMethod }
            );
            const checkoutUrl = response?.data?.checkoutUrl;
            if (!checkoutUrl) {
                toast.error(t("profile.subscription.checkout_unavailable"));
                navigate("/billing");
                return;
            }
            window.location.assign(checkoutUrl);
        } catch (error) {
            toast.error(
                error.response?.data?.message || t("profile.subscription.checkout_unavailable")
            );
            navigate("/billing");
        } finally {
            setPayLoading(false);
        }
    };

    const handleStartTrial = async () => {
        try {
            setTrialLoading(true);
            await subscriptionService.startTrial();
            toast.success(t("auth.request_status.trial_started_toast"));
            navigate("/dashboard");
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setTrialLoading(false);
        }
    };

    const planLabel = t(`profile.subscription.plan_${requestedPlan}`);
    const slaLabel = isEnterpriseReview ? t(PLAN_SLA_KEY.enterprise) : null;

    return (
        <AuthLayout>
            <SeoHead
                title="Estado de registro | Ohnix"
                description="Consulta el estado de tu solicitud de registro y los siguientes pasos para activar tu cuenta en Ohnix."
                canonicalPath="/signup/request-status"
                lang={currentLanguage || "es"}
                noIndex={true}
            />
            <AuthCard
                title={
                    isCheckoutPlan
                        ? t("auth.request_status.title_checkout")
                        : isEnterpriseReview
                          ? t("auth.request_status.title_with_request")
                          : t("auth.request_status.title_starter")
                }
                subtitle={
                    isCheckoutPlan
                        ? t("auth.request_status.subtitle_checkout")
                        : isEnterpriseReview
                          ? t("auth.request_status.subtitle_with_request")
                          : t("auth.request_status.subtitle_starter")
                }
            >
                <div className="space-y-5">
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
                        <div className="flex items-start gap-3">
                            <CheckCircleOutlined className="mt-1 text-emerald-300" />
                            <div>
                                <Text className="block text-emerald-100 font-medium">
                                    {t("auth.request_status.account_created")}
                                </Text>
                                <Text className="text-emerald-200/90">
                                    {isCheckoutPlan
                                        ? t("auth.request_status.plan_requested", { plan: planLabel })
                                        : isEnterpriseReview
                                          ? t("auth.request_status.plan_requested", { plan: planLabel })
                                          : t("auth.request_status.starter_active")}
                                </Text>
                            </div>
                        </div>
                    </div>

                    {isCheckoutPlan && (
                        <div className="rounded-2xl border border-[#44F3F0]/20 bg-[#44F3F0]/8 p-4">
                            <div className="flex items-start gap-3">
                                <GiftOutlined className="mt-1 text-[#8CFBFA]" />
                                <div className="space-y-1">
                                    <Text className="block text-[var(--ohnix-text-primary)] font-medium">
                                        {t("auth.request_status.no_trial_title", { plan: planLabel })}
                                    </Text>
                                    <Text className="block text-[#CFE8E8]">
                                        {t("auth.request_status.no_trial_body")}
                                    </Text>
                                </div>
                            </div>
                        </div>
                    )}

                    {isEnterpriseReview && (
                        <div className="rounded-2xl border border-[#44F3F0]/20 bg-[#44F3F0]/8 p-4">
                            <div className="flex items-start gap-3">
                                <ClockCircleOutlined className="mt-1 text-[#8CFBFA]" />
                                <div className="space-y-2">
                                    <Text className="block text-[var(--ohnix-text-primary)] font-medium">
                                        {t("auth.request_status.next_steps_title")}
                                    </Text>
                                    <Text className="block text-[#CFE8E8]">
                                        {t("auth.request_status.next_steps_line_1")}
                                    </Text>
                                    <Text className="block text-[#CFE8E8]">
                                        {t("auth.request_status.next_steps_line_2")}
                                    </Text>
                                    <Text className="block text-[#CFE8E8]">
                                        {t("auth.request_status.next_steps_line_3")}
                                    </Text>
                                    <Tag color="cyan">{t("auth.request_status.estimated_sla")}: {slaLabel}</Tag>
                                </div>
                            </div>
                        </div>
                    )}

                    <Space direction="vertical" className="w-full" size={10}>
                        {isCheckoutPlan ? (
                            <>
                                <Button
                                    type="primary"
                                    block
                                    size="large"
                                    icon={<RocketOutlined />}
                                    loading={payLoading}
                                    onClick={handleContinuePayment}
                                    className="!h-11 !rounded-xl !bg-[#29D8D5] !text-[#021314] !font-semibold hover:!bg-[#44F3F0]"
                                >
                                    {t("auth.request_status.continue_payment_cta", { plan: planLabel })}
                                    {priceLabel ? ` — ${priceLabel}` : ""}
                                </Button>
                                <Button
                                    block
                                    size="large"
                                    loading={trialLoading}
                                    onClick={handleStartTrial}
                                    className="!h-11 !rounded-xl !border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-1)] !text-[var(--ohnix-text-primary)] hover:!border-[#44F3F0]/40 hover:!text-[#E9FEFE]"
                                >
                                    {t("auth.request_status.start_trial_cta")}
                                </Button>
                                <Text className="block text-center text-xs text-[var(--ohnix-text-muted)]">
                                    {t("auth.request_status.start_trial_helper")}
                                </Text>
                            </>
                        ) : (
                            <Button
                                type="primary"
                                block
                                size="large"
                                icon={<ArrowRightOutlined />}
                                onClick={() => navigate("/login")}
                                className="!h-11 !rounded-xl !bg-[#29D8D5] !text-[#021314] !font-semibold hover:!bg-[#44F3F0]"
                            >
                                {t("auth.request_status.go_to_login")}
                            </Button>
                        )}
                        <Button
                            block
                            size="large"
                            onClick={() => navigate("/")}
                            className="!h-11 !rounded-xl !border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-1)] !text-[var(--ohnix-text-primary)] hover:!border-[#44F3F0]/40 hover:!text-[#E9FEFE]"
                        >
                            {t("auth.request_status.back_to_home")}
                        </Button>
                    </Space>

                    <Text className="block text-center text-xs text-[var(--ohnix-text-muted)]">
                        {t("auth.request_status.support_hint")}
                    </Text>
                </div>
            </AuthCard>
        </AuthLayout>
    );
};

export default SignupRequestStatus;
