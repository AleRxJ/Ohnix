import { Button, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import SeoHead from "../../components/common/SeoHead";
import useI18n from "../../hooks/useI18n";

const { Text, Title } = Typography;

const PLAN_SLA_KEY = {
    growth: "auth.request_status.sla_growth",
    enterprise: "auth.request_status.sla_enterprise",
};

const SignupRequestStatus = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t, currentLanguage } = useI18n();

    const requestedPlan = useMemo(() => {
        const plan = searchParams.get("plan");
        return ["starter", "growth", "enterprise"].includes(plan) ? plan : "starter";
    }, [searchParams]);

    const hasUpgradeRequest = ["growth", "enterprise"].includes(requestedPlan);
    const slaLabel = hasUpgradeRequest
        ? t(PLAN_SLA_KEY[requestedPlan] || PLAN_SLA_KEY.growth)
        : null;

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
                    hasUpgradeRequest
                        ? t("auth.request_status.title_with_request")
                        : t("auth.request_status.title_starter")
                }
                subtitle={
                    hasUpgradeRequest
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
                                    {hasUpgradeRequest
                                        ? t("auth.request_status.plan_requested", {
                                              plan: t(`profile.subscription.plan_${requestedPlan}`),
                                          })
                                        : t("auth.request_status.starter_active")}
                                </Text>
                            </div>
                        </div>
                    </div>

                    {hasUpgradeRequest ? (
                        <div className="rounded-2xl border border-[#44F3F0]/20 bg-[#44F3F0]/8 p-4">
                            <div className="flex items-start gap-3">
                                <ClockCircleOutlined className="mt-1 text-[#8CFBFA]" />
                                <div className="space-y-2">
                                    <Text className="block text-white font-medium">
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
                    ) : null}

                    <Space direction="vertical" className="w-full" size={10}>
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
                        <Button
                            block
                            size="large"
                            onClick={() => navigate("/")}
                            className="!h-11 !rounded-xl !border-white/20 !bg-white/[0.03] !text-white hover:!border-[#44F3F0]/40 hover:!text-[#E9FEFE]"
                        >
                            {t("auth.request_status.back_to_home")}
                        </Button>
                    </Space>

                    <Text className="block text-center text-xs text-[#A9B3B8]">
                        {t("auth.request_status.support_hint")}
                    </Text>
                </div>
            </AuthCard>
        </AuthLayout>
    );
};

export default SignupRequestStatus;