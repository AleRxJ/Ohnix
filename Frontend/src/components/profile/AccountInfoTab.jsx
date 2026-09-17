import React, { useCallback, useEffect, useState } from "react";
import { Button, Typography, Card } from "antd";
import {
    LockOutlined,
    InfoCircleOutlined,
    CalendarOutlined,
    UserOutlined,
    MailOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CompassOutlined,
} from "@ant-design/icons";
import { useCurrency } from "../../context/CurrencyContext";
import { formatCurrency } from "../../utils/currency";
import CurrencySelector from "../common/CurrencySelector";
import ThemeToggle from "../common/ThemeToggle";
import useI18n from "../../hooks/useI18n";
import { subscriptionService } from "../../services/subscriptionService";
import SubscriptionPlanCard from "./SubscriptionPlanCard";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { useTeam } from "../../context/TeamContext";

const { Text, Title } = Typography;

const AccountInfoTab = ({ user, isVerified, handleTabChange, refreshUser }) => {
    const navigate = useNavigate();
    const { currency } = useCurrency();
    const { t } = useI18n();
    const { fabDismissed, completed: tourCompleted, reEnableFab } = useInventoryTour();
    // The guided tour is account-admin-only (see InventoryTourFab.jsx) - an
    // invited team member can never trigger it, so offering a "bring it
    // back" toggle here would just be a dead control for them. Gated on
    // teamLoading too so the card doesn't flash in before disappearing.
    const { isTeamMember, loading: teamLoading } = useTeam();
    // The floating trigger is hidden for either reason (InventoryTourFab.jsx
    // checks `completed || fabDismissed`) - gating this button on
    // `fabDismissed` alone meant someone who finished the tour normally
    // (completed=true, fabDismissed never set) had no way to bring it back.
    const tourHidden = fabDismissed || tourCompleted;
    const [loadingSubscription, setLoadingSubscription] = useState(true);
    const [refreshingSubscription, setRefreshingSubscription] = useState(false);
    const [subscription, setSubscription] = useState(null);
    const [usage, setUsage] = useState(null);

    const fetchSubscriptionData = useCallback(async () => {
        try {
            const [subscriptionResponse, usageResponse] = await Promise.all([
                subscriptionService.getMySubscription(),
                subscriptionService.getMyUsage(),
            ]);

            setSubscription(subscriptionResponse?.data || null);
            setUsage(usageResponse?.data || null);
        } catch (error) {
            toast.error(
                error.response?.data?.message || t("profile.subscription.load_failed")
            );
        }
    }, [t]);

    useEffect(() => {
        const run = async () => {
            setLoadingSubscription(true);
            await fetchSubscriptionData();
            setLoadingSubscription(false);
        };

        run();
    }, [fetchSubscriptionData]);

    const handleRefreshSubscription = async () => {
        setRefreshingSubscription(true);
        await fetchSubscriptionData();
        setRefreshingSubscription(false);
        if (refreshUser) {
            refreshUser();
        }
    };

    const handlePause = async () => {
        await subscriptionService.pauseMySubscription();
        await handleRefreshSubscription();
    };

    const handleCancel = async () => {
        await subscriptionService.cancelMySubscription();
        await handleRefreshSubscription();
    };

    const handleReactivate = async () => {
        await subscriptionService.reactivateMySubscription();
        await handleRefreshSubscription();
    };

    const handleRequestUpgrade = () => {
        const email = "info@itcycle.co";
        const subject = encodeURIComponent("Upgrade request - Ohnix plan");
        const body = encodeURIComponent(
            `Hello team, I would like to upgrade my plan.\n\nCurrent user: ${user?.email || "N/A"}\nCurrent plan: ${subscription?.plan || "starter"}`
        );

        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    };

    const handleOpenBilling = () => {
        navigate("/billing");
    };

    const handleReEnableTour = () => {
        reEnableFab();
        toast.success(t("inventory_tour.re_enabled_toast"));
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--ohnix-text-primary)] mb-2">
                    {t("profile.account_information")}
                </h1>
                <Text className="text-[var(--ohnix-text-muted)]">
                    {t("profile.profile_summary")}
                </Text>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-6">
                <Card className="rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--ohnix-line-2)] flex items-center justify-center border border-[var(--ohnix-line-4)]">
                            <UserOutlined className="text-[#44F3F0] text-lg" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <Text className="text-[11px] font-medium text-[var(--ohnix-text-muted)] uppercase tracking-[0.22em] block mb-1">
                                {t("profile.username")}
                            </Text>
                            <Text className="text-base font-medium text-[var(--ohnix-text-primary)] block truncate">
                                {user?.username || t("common.na")}
                            </Text>
                        </div>
                    </div>
                </Card>

                <Card className="rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--ohnix-line-2)] flex items-center justify-center border border-[var(--ohnix-line-4)]">
                            <MailOutlined className="text-[#44F3F0] text-lg" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <Text className="text-[11px] font-medium text-[var(--ohnix-text-muted)] uppercase tracking-[0.22em] block mb-1">
                                {t("profile.email")}
                            </Text>
                            <Text className="text-base font-medium text-[var(--ohnix-text-primary)] block truncate">
                                {user?.email || t("common.na")}
                            </Text>
                        </div>
                    </div>
                </Card>

                <Card className="rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--ohnix-line-2)] flex items-center justify-center border border-[var(--ohnix-line-4)]">
                            <CalendarOutlined className="text-[#44F3F0] text-lg" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <Text className="text-[11px] font-medium text-[var(--ohnix-text-muted)] uppercase tracking-[0.22em] block mb-1">
                                {t("profile.member_since")}
                            </Text>
                            <Text className="text-base font-medium text-[var(--ohnix-text-primary)] block">
                                {user?.createdAt
                                    ? new Date(user.createdAt).toLocaleDateString(
                                          "en-US",
                                          {
                                              year: "numeric",
                                              month: "long",
                                              day: "numeric",
                                          }
                                      )
                                    : t("common.na")}
                            </Text>
                        </div>
                    </div>
                </Card>

                <Card className="rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                    <div className="flex items-start gap-3">
                        <div
                            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${
                                isVerified
                                    ? "bg-emerald-500/15 border-emerald-500/20"
                                    : "bg-amber-500/15 border-amber-500/20"
                            }`}
                        >
                            {isVerified ? (
                                <CheckCircleOutlined className="text-emerald-300 text-lg" />
                            ) : (
                                <CloseCircleOutlined className="text-amber-300 text-lg" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <Text className="text-[11px] font-medium text-[var(--ohnix-text-muted)] uppercase tracking-[0.22em] block mb-1">
                                {t("profile.verification_status")}
                            </Text>
                            <Text
                                className={`text-base font-medium block ${
                                    isVerified ? "text-emerald-300" : "text-amber-300"
                                }`}
                            >
                                {isVerified ? t("profile.verified") : t("profile.unverified")}
                            </Text>
                        </div>
                    </div>
                </Card>
            </div>

            {!isVerified && (
                <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <InfoCircleOutlined className="text-amber-200 text-sm" />
                        </div>
                        <div>
                            <Title
                                level={5}
                                className="text-[var(--ohnix-alert-amber-text)] m-0 mb-1 text-sm font-semibold"
                            >
                                {t("profile.account_verification_required")}
                            </Title>
                            <Text className="text-amber-100/90 text-sm">
                                {t("profile.verify_account_to_unlock")}
                            </Text>
                        </div>
                    </div>
                </div>
            )}

            <Card className="rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[#29D8D5] flex items-center justify-center shadow-[0_12px_28px_rgba(41,216,213,0.2)]">
                            <LockOutlined className="text-[#021314] text-xl" />
                        </div>
                        <div>
                            <Title
                                level={5}
                                className="text-[var(--ohnix-text-primary)] m-0 mb-1 font-semibold"
                            >
                                {t("profile.security_settings")}
                            </Title>
                            <Text className="text-[var(--ohnix-text-muted)] text-sm">
                                {t("profile.security_description")}
                            </Text>
                        </div>
                    </div>
                    <Button
                        type="primary"
                        onClick={() => handleTabChange("2")}
                        className="bg-[#29D8D5] hover:bg-[#44F3F0] text-[#021314] border-0 rounded-xl shadow-[0_12px_28px_rgba(41,216,213,0.22)] h-10 px-6 font-medium"
                        icon={<LockOutlined />}
                    >
                        {t("profile.change_password")}
                    </Button>
                </div>
            </Card>

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
                compact
                onOpenBilling={handleOpenBilling}
            />

            <Card className="mt-4 rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <Title
                            level={5}
                            className="text-[var(--ohnix-text-primary)] m-0 mb-1 font-semibold"
                        >
                            Currency Settings
                        </Title>
                        <Text className="text-[var(--ohnix-text-muted)] text-sm">
                            Pick the base currency used across prices, totals, and reports.
                        </Text>
                        <div className="mt-2 text-xs text-[var(--ohnix-text-muted)]">
                            Current display example: {formatCurrency(1234.56, currency.code)}
                        </div>
                    </div>
                    <CurrencySelector className="w-full sm:w-72" />
                </div>
            </Card>

            <Card className="mt-4 rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <Title
                            level={5}
                            className="text-[var(--ohnix-text-primary)] m-0 mb-1 font-semibold"
                        >
                            {t("common.theme")}
                        </Title>
                        <Text className="text-[var(--ohnix-text-muted)] text-sm">
                            {t("common.theme_description")}
                        </Text>
                    </div>
                    <ThemeToggle />
                </div>
            </Card>

            {!isTeamMember && !teamLoading && (
                <Card className="mt-4 rounded-2xl shadow-[var(--ohnix-shadow-card)] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[#29D8D5]/15 flex items-center justify-center">
                                <CompassOutlined className="text-[#29D8D5] text-xl" />
                            </div>
                            <div>
                                <Title
                                    level={5}
                                    className="text-[var(--ohnix-text-primary)] m-0 mb-1 font-semibold"
                                >
                                    {t("inventory_tour.settings_title")}
                                </Title>
                                <Text className="text-[var(--ohnix-text-muted)] text-sm">
                                    {tourHidden
                                        ? t("inventory_tour.settings_desc_hidden")
                                        : t("inventory_tour.settings_desc_visible")}
                                </Text>
                            </div>
                        </div>
                        <Button
                            onClick={handleReEnableTour}
                            disabled={!tourHidden}
                            className="profile-tour-button rounded-xl h-10 px-6 font-medium border-[var(--ohnix-line-4)] disabled:opacity-100"
                        >
                            {t("inventory_tour.settings_button")}
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AccountInfoTab;
