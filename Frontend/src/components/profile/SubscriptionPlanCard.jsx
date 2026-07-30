import React, { useMemo } from "react";
import { Card, Tag, Typography, Progress, Button, Spin, Popconfirm } from "antd";
import {
    CrownOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
    RocketOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    LockOutlined,
    ClockCircleOutlined,
    WarningOutlined,
    FireOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { PLAN_FEATURES, FEATURE_MINIMUM_PLAN } from "../../hooks/useSubscription";

const { Title, Text } = Typography;

const PLAN_COLORS = {
    starter:    "#9ca3af",
    growth:     "#29D8D5",
    scale:      "#7C6AF7",
    enterprise: "#f59e0b",
};

// Feature labels for the features panel (key → i18n label)
const FEATURE_ROWS = [
    { key: "reportSales",       es: "Reportes de ventas y compras",    en: "Sales & purchase reports"     },
    { key: "exportCsv",         es: "Exportación CSV",                 en: "CSV export"                   },
    { key: "bulkUpload",        es: "Carga masiva de productos",       en: "Bulk product upload"          },
    { key: "autoEmailAlerts",   es: "Alertas email automáticas",       en: "Automatic email alerts"       },
    { key: "configurableAlerts",es: "Alertas por umbral configurable", en: "Configurable stock thresholds" },
    { key: "apiAccess",         es: "Acceso a API REST",               en: "REST API access"              },
];

const StatusTag = ({ status, t }) => {
    const color =
        status === "active"
            ? "green"
            : status === "paused"
              ? "gold"
              : "volcano";

    return <Tag color={color}>{t(`profile.subscription.status_${status}`)}</Tag>;
};

const UsageRow = ({ label, value }) => {
    const percent = value.usagePercent === null ? 0 : value.usagePercent;
    const displayLimit = value.limit === null ? "∞" : value.limit;

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#A9B3B8]">{label}</Text>
                <Text className="text-sm text-white">
                    {value.used} / {displayLimit}
                </Text>
            </div>
            <Progress
                percent={percent}
                size="small"
                strokeColor="#29D8D5"
                trailColor="rgba(255,255,255,0.12)"
                showInfo={value.usagePercent !== null}
                format={(current) => `${current}%`}
            />
        </div>
    );
};

const SubscriptionPlanCard = ({
    loading,
    refreshing,
    subscription,
    usage,
    onRefresh,
    onPause,
    onCancel,
    onReactivate,
    onRequestUpgrade,
    compact = false,
    onOpenBilling,
}) => {
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";

    // plan must be declared before effectivePlan uses it
    const plan   = subscription?.plan || "starter";

    // Effective plan (trial may give higher access than stored plan)
    const effectivePlan = subscription?.effectivePlan || plan;
    const trialEndsAt    = subscription?.trialEndsAt ?? null;
    const trialActive    = trialEndsAt && new Date() < new Date(trialEndsAt);
    const trialExpired   = trialEndsAt && !trialActive && plan === "starter";
    const trialDaysLeft  = trialActive
        ? Math.max(1, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;
    const trialUrgent    = trialActive && trialDaysLeft <= 3;

    const planFeatures = PLAN_FEATURES[effectivePlan] || PLAN_FEATURES.starter;

    const usageRows = useMemo(() => {
        if (!usage?.usage) {
            return [];
        }

        const rows = [
            {
                label: t("profile.subscription.metrics.products"),
                key: "products",
            },
            {
                label: t("profile.subscription.metrics.customers"),
                key: "customers",
            },
            {
                label: t("profile.subscription.metrics.suppliers"),
                key: "suppliers",
            },
            {
                label: t("profile.subscription.metrics.monthly_orders"),
                key: "monthlyOrders",
            },
            {
                label: t("profile.subscription.metrics.monthly_purchases"),
                key: "monthlyPurchases",
            },
        ]
            .map((item) => ({
                ...item,
                value: usage.usage[item.key],
            }))
            .filter((item) => item.value);

        return compact ? rows.slice(0, 3) : rows;
    }, [usage, t]);

    const status = subscription?.status || "active";
    const canRequestUpgrade = plan !== "enterprise";

    return (
        <Card className="mt-4 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.18)] border border-white/10 bg-white/[0.04] text-white">
            {/* Trial expired banner */}
            {trialExpired && (
                <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                    <div className="flex items-start gap-3">
                        <WarningOutlined className="mt-0.5 text-lg text-red-400" />
                        <div className="flex-1">
                            <Text className="block text-sm font-semibold text-red-300">
                                {lang === "es" ? "Tu prueba gratuita ha terminado" : "Your free trial has ended"}
                            </Text>
                            <Text className="block text-xs text-red-400/80 mt-0.5">
                                {lang === "es"
                                    ? "Contrata un plan para seguir usando Ohnix sin interrupciones."
                                    : "Subscribe to a plan to keep using Ohnix without interruptions."}
                            </Text>
                        </div>
                        {onRequestUpgrade && (
                            <Button
                                size="small"
                                onClick={onRequestUpgrade}
                                className="shrink-0 border-red-400/60 text-red-300 hover:border-red-300 hover:text-red-200 bg-transparent"
                            >
                                {lang === "es" ? "Contratar" : "Subscribe"}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Trial urgency banner (≤3 days left) */}
            {trialUrgent && (
                <div className="mb-4 rounded-xl border border-orange-400/40 bg-orange-400/10 px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <FireOutlined className="text-orange-400" />
                        <Text className="flex-1 text-sm text-orange-300">
                            {lang === "es"
                                ? `¡Solo quedan ${trialDaysLeft} día${trialDaysLeft !== 1 ? "s" : ""} de prueba! Contrata ahora para no perder el acceso.`
                                : `Only ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left in your trial! Subscribe now to keep access.`}
                        </Text>
                        {onRequestUpgrade && (
                            <Button
                                size="small"
                                onClick={onRequestUpgrade}
                                className="shrink-0 border-orange-400/60 text-orange-300 hover:border-orange-300 hover:text-orange-200 bg-transparent"
                            >
                                {lang === "es" ? "Contratar" : "Subscribe"}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Normal active trial banner */}
            {trialActive && !trialUrgent && (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-4 py-2.5">
                    <ClockCircleOutlined className="text-[#44F3F0]" />
                    <Text className="text-sm text-[#44F3F0]">
                        {lang === "es"
                            ? `Prueba gratuita activa — ${trialDaysLeft} día${trialDaysLeft !== 1 ? "s" : ""} restante${trialDaysLeft !== 1 ? "s" : ""} · Acceso completo al plan Negocio`
                            : `Free trial active — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining · Full Business plan access`}
                    </Text>
                </div>
            )}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                        <CrownOutlined style={{ color: PLAN_COLORS[plan] || "#29D8D5" }} />
                    </div>
                    <div>
                        <Title level={5} className="m-0 text-white">
                            {t("profile.subscription.title")}
                        </Title>
                        <Text className="text-[#A9B3B8] text-sm">
                            {t("profile.subscription.description")}
                        </Text>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Tag color="cyan" className="capitalize">
                        {t(`profile.subscription.plan_${plan}`)}
                    </Tag>
                    <StatusTag status={status} t={t} />
                    <Button
                        type="text"
                        icon={<ReloadOutlined />}
                        onClick={onRefresh}
                        loading={refreshing}
                        className="text-white"
                    />
                </div>
            </div>

            <Spin spinning={loading}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {usageRows.map((row) => (
                        <UsageRow key={row.key} label={row.label} value={row.value} />
                    ))}
                </div>

                {/* Features panel — only shown in full (non-compact) view */}
                {!compact && (
                    <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.02] p-4">
                        <Text className="text-xs uppercase tracking-[0.18em] text-[#A9B3B8]">
                            {lang === "es" ? "Funcionalidades de tu plan" : "Your plan features"}
                        </Text>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {FEATURE_ROWS.map(({ key, es, en }) => {
                                const enabled = planFeatures[key] ?? false;
                                const minPlan  = FEATURE_MINIMUM_PLAN[key];
                                return (
                                    <div key={key} className={`flex items-center gap-2.5 text-xs ${enabled ? "text-[#D4DBDF]" : "text-[#4A5560]"}`}>
                                        {enabled ? (
                                            <CheckCircleOutlined className="text-[#29D8D5]" style={{ fontSize: 13 }} />
                                        ) : (
                                            <LockOutlined className="text-[#4A5560]" style={{ fontSize: 13 }} />
                                        )}
                                        <span>{lang === "es" ? es : en}</span>
                                        {!enabled && minPlan && (
                                            <Tag color="default" className="ml-auto text-[9px] px-1.5 py-0 capitalize leading-none">
                                                {lang === "es"
                                                    ? { growth: "Negocio", scale: "Escala", enterprise: "Enterprise" }[minPlan]
                                                    : { growth: "Business", scale: "Scale", enterprise: "Enterprise" }[minPlan]}
                                            </Tag>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {compact ? (
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Button
                            icon={<RocketOutlined />}
                            onClick={onOpenBilling}
                            className="h-10 rounded-xl border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                        >
                            {t("profile.subscription.manage_plan")}
                        </Button>
                        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-3 text-xs text-[#A9B3B8]">
                            {t("profile.subscription.support_note")}
                        </div>
                    </div>
                ) : trialExpired ? (
                    /* Trial expired — only show upgrade CTA, hide pause/cancel */
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Button
                            icon={<RocketOutlined />}
                            onClick={onRequestUpgrade}
                            size="large"
                            className="h-11 rounded-xl border-[#29D8D5]/50 bg-[#29D8D5]/15 text-[#44F3F0] font-semibold col-span-1 sm:col-span-2"
                        >
                            {lang === "es" ? "Contratar un plan ahora" : "Subscribe to a plan now"}
                        </Button>
                        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-3 text-xs text-[#A9B3B8] col-span-1 sm:col-span-2">
                            {t("profile.subscription.support_note")}
                        </div>
                    </div>
                ) : (
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {status === "active" ? (
                            <Button
                                icon={<PauseCircleOutlined />}
                                onClick={onPause}
                                className="h-10 rounded-xl border-white/15 bg-white/[0.03] text-white"
                            >
                                {t("profile.subscription.pause")}
                            </Button>
                        ) : (
                            <Button
                                icon={<PlayCircleOutlined />}
                                onClick={onReactivate}
                                className="h-10 rounded-xl border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                            >
                                {t("profile.subscription.reactivate")}
                            </Button>
                        )}

                        <Popconfirm
                            title={t("profile.subscription.confirm_cancel")}
                            okText={t("common.yes")}
                            cancelText={t("common.no")}
                            onConfirm={onCancel}
                        >
                            <Button
                                icon={<StopOutlined />}
                                className="h-10 rounded-xl border-red-400/30 bg-red-500/10 text-red-200"
                            >
                                {t("profile.subscription.cancel")}
                            </Button>
                        </Popconfirm>

                        <Button
                            icon={<RocketOutlined />}
                            onClick={onRequestUpgrade}
                            disabled={!canRequestUpgrade}
                            className="h-10 rounded-xl border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0] disabled:border-white/15 disabled:bg-white/[0.03] disabled:text-[#A9B3B8]"
                        >
                            {canRequestUpgrade
                                ? t("profile.subscription.request_upgrade")
                                : t("profile.subscription.top_plan_reached")}
                        </Button>

                        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-3 text-xs text-[#A9B3B8]">
                            {t("profile.subscription.support_note")}
                        </div>
                    </div>
                )}
            </Spin>
        </Card>
    );
};

export default SubscriptionPlanCard;
