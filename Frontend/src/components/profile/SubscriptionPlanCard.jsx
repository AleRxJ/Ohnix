import React, { useMemo } from "react";
import { Card, Tag, Typography, Progress, Button, Spin, Popconfirm } from "antd";
import {
    CrownOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
    RocketOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Title, Text } = Typography;

const PLAN_COLORS = {
    starter: "#9ca3af",
    growth: "#29D8D5",
    enterprise: "#f59e0b",
};

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
    const { t } = useI18n();

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

    const plan = subscription?.plan || "starter";
    const status = subscription?.status || "active";
    const canRequestUpgrade = plan !== "enterprise";

    return (
        <Card className="mt-4 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.18)] border border-white/10 bg-white/[0.04] text-white">
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
