import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Tooltip, Modal, InputNumber, Skeleton } from "antd";
import { MailOutlined, SettingOutlined, LockOutlined, ArrowRightOutlined, EditOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import AuthContext from "../../context/AuthContext";
import useSubscription from "../../hooks/useSubscription";
import useI18n from "../../hooks/useI18n";
import { api } from "../../api/api";
import { subscriptionService } from "../../services/subscriptionService";

// Single consolidated module for the weekly low-stock email alert: status,
// schedule, and (admin-only) the send/trigger actions. This used to be split
// across an Alert banner and a separate "Quick Actions" card with a second,
// redundant trigger button - merged here so there's one source of truth for
// "is this actually on for me" instead of two panels that could disagree.
const LowStockAlertsPanel = () => {
    const { user } = useContext(AuthContext);
    const { can, loading: subscriptionLoading } = useSubscription();
    const { t, currentLanguage } = useI18n();
    const navigate = useNavigate();

    const isAdmin = user?.role === "admin";
    const hasAutoEmailAlerts = can("autoEmailAlerts");
    const canConfigureAccountThreshold = can("configurableAlerts");
    const isActive = isAdmin || hasAutoEmailAlerts;
    // useSubscription's plan starts null and only resolves after an async
    // fetch (admins skip it entirely, see useSubscription.js) - can() has no
    // way to distinguish "still loading" from "actually on Starter", so
    // without this every non-admin briefly saw the locked/upsell copy on
    // every page load even on Negocio+, until the fetch resolved a moment
    // later and the badge flipped to active.
    const showLoadingState = !isAdmin && subscriptionLoading;

    const [schedulerStatus, setSchedulerStatus] = useState(null);
    const [triggeringAlert, setTriggeringAlert] = useState(false);
    const [sendingSelfTest, setSendingSelfTest] = useState(false);
    const [editingThreshold, setEditingThreshold] = useState(false);
    const [thresholdDraft, setThresholdDraft] = useState(null);
    const [savingThreshold, setSavingThreshold] = useState(false);

    // Account-wide threshold (Escala+): distinct from schedulerStatus.threshold
    // above, which is the admin-only PLATFORM default. This one lives on the
    // requesting user's own Subscription row and only applies to their own
    // catalog - see subscription.controller.js#updateMyLowStockThreshold.
    const [accountThreshold, setAccountThreshold] = useState(null);
    const [editingAccountThreshold, setEditingAccountThreshold] = useState(false);
    const [accountThresholdDraft, setAccountThresholdDraft] = useState(null);
    const [savingAccountThreshold, setSavingAccountThreshold] = useState(false);

    useEffect(() => {
        if (!isAdmin) return;
        api.get("/scheduler/status")
            .then((response) => {
                if (response.data.success) setSchedulerStatus(response.data.data);
            })
            .catch((error) => console.error("Failed to get scheduler status:", error));
    }, [isAdmin]);

    useEffect(() => {
        if (isAdmin || !hasAutoEmailAlerts) return;
        subscriptionService
            .getMySubscription()
            .then((response) => {
                if (response.success) setAccountThreshold(response.data.lowStockThreshold ?? null);
            })
            .catch((error) => console.error("Failed to get account threshold:", error));
    }, [isAdmin, hasAutoEmailAlerts]);

    const sendConfirmedAlerts = async () => {
        try {
            setTriggeringAlert(true);
            const response = await api.post("/scheduler/trigger-alerts", { confirm: true });
            if (response.data.success) {
                const { sent, failed, noLowStock, total } = response.data.data;
                toast.success(t("reports.alert_process_completed", { sent, noLowStock, failed, total }));
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.trigger_low_stock_alerts_failed"));
        } finally {
            setTriggeringAlert(false);
        }
    };

    // Dry run first: fetch how many real accounts would be emailed and make
    // the admin explicitly confirm that blast radius before anything sends.
    const triggerLowStockAlert = async () => {
        try {
            setTriggeringAlert(true);
            const response = await api.post("/scheduler/trigger-alerts");

            if (response.data.success && response.data.data?.dryRun) {
                const { eligibleCount } = response.data.data;
                setTriggeringAlert(false);
                Modal.confirm({
                    title: t("reports.confirm_send_real_alerts_title"),
                    content: t("reports.confirm_send_real_alerts_desc", { count: eligibleCount }),
                    okText: t("reports.confirm_send_real_alerts_ok"),
                    cancelText: t("common.cancel"),
                    okButtonProps: { danger: true, className: "h-10 px-6 rounded-md font-medium" },
                    cancelButtonProps: { className: "h-10 px-6 rounded-md" },
                    className: "ohnix-confirm-modal",
                    styles: {
                        mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                        content: {
                            background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                            border: "1px solid var(--ohnix-line-4)",
                            boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                            borderRadius: "24px",
                        },
                    },
                    onOk: sendConfirmedAlerts,
                });
                return;
            }

            setTriggeringAlert(false);
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.trigger_low_stock_alerts_failed"));
            setTriggeringAlert(false);
        }
    };

    // Sends a low-stock alert email to the admin's OWN inbox, regardless of
    // whether their account has any real low-stock products - never touches
    // another account's data.
    const sendSelfTestAlert = async () => {
        try {
            setSendingSelfTest(true);
            const response = await api.post("/scheduler/send-test-alert");
            if (response.data.success) {
                toast.success(
                    response.data.data?.isSample
                        ? t("reports.self_test_alert_sent_sample")
                        : t("reports.self_test_alert_sent_real")
                );
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.trigger_low_stock_alerts_failed"));
        } finally {
            setSendingSelfTest(false);
        }
    };

    const startEditingThreshold = () => {
        setThresholdDraft(schedulerStatus?.threshold ?? 5);
        setEditingThreshold(true);
    };

    const cancelEditingThreshold = () => {
        setEditingThreshold(false);
        setThresholdDraft(null);
    };

    const saveThreshold = async () => {
        if (!thresholdDraft || thresholdDraft < 1) return;
        try {
            setSavingThreshold(true);
            const response = await api.put("/scheduler/threshold", { threshold: thresholdDraft });
            if (response.data.success) {
                const updated = response.data.data.threshold;
                setSchedulerStatus((prev) => (prev ? { ...prev, threshold: updated } : prev));
                toast.success(t("reports.threshold_update_success", { threshold: updated }));
                setEditingThreshold(false);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.threshold_update_failed"));
        } finally {
            setSavingThreshold(false);
        }
    };

    const startEditingAccountThreshold = () => {
        setAccountThresholdDraft(accountThreshold ?? 5);
        setEditingAccountThreshold(true);
    };

    const cancelEditingAccountThreshold = () => {
        setEditingAccountThreshold(false);
        setAccountThresholdDraft(null);
    };

    const saveAccountThreshold = async (value) => {
        try {
            setSavingAccountThreshold(true);
            const response = await subscriptionService.updateMyLowStockThreshold(value);
            if (response.success) {
                const updated = response.data.lowStockThreshold ?? null;
                setAccountThreshold(updated);
                toast.success(
                    updated === null
                        ? t("reports.account_threshold_reset")
                        : t("reports.threshold_update_success", { threshold: updated })
                );
                setEditingAccountThreshold(false);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.threshold_update_failed"));
        } finally {
            setSavingAccountThreshold(false);
        }
    };

    if (showLoadingState) {
        return (
            <div className="module-shell reveal-card relative overflow-hidden rounded-[22px] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-5 sm:p-6 mb-4 sm:mb-6 no-print">
                <div className="flex items-center gap-3">
                    <Skeleton.Avatar active size={44} shape="square" />
                    <div className="flex-1 max-w-md">
                        <Skeleton active title={{ width: "50%" }} paragraph={{ rows: 1, width: "90%" }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="module-shell reveal-card relative overflow-hidden rounded-[22px] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-5 sm:p-6 mb-4 sm:mb-6 no-print">
            {isActive && (
                <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#29D8D5]/10 blur-3xl" />
            )}

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div
                        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${
                            isActive
                                ? "border-[#29D8D5]/25 bg-[linear-gradient(135deg,rgba(41,216,213,0.2),rgba(68,243,240,0.1))] animate-glow-pulse"
                                : "border-[var(--ohnix-status-amber)]/30 bg-[var(--ohnix-status-amber)]/10"
                        }`}
                    >
                        {isActive ? (
                            <MailOutlined className="text-[#44F3F0] text-lg" />
                        ) : (
                            <LockOutlined className="text-[var(--ohnix-alert-amber-text)] text-lg" />
                        )}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--ohnix-text-soft)]">
                                {t("reports.automatic_low_stock_alerts")}
                            </h3>
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                    isActive
                                        ? "border-[#29D8D5]/30 bg-[#29D8D5]/10 text-[#44F3F0]"
                                        : "border-[var(--ohnix-status-amber)]/30 bg-[var(--ohnix-status-amber)]/10 text-[var(--ohnix-alert-amber-text)]"
                                }`}
                            >
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                        isActive ? "bg-[#44F3F0] animate-pulse" : "bg-[var(--ohnix-alert-amber-text)]"
                                    }`}
                                />
                                {isActive ? t("common.active") : t("reports.low_stock_alerts_locked_badge")}
                            </span>
                        </div>
                        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[var(--ohnix-text-muted)] sm:text-sm">
                            {isAdmin
                                ? `${t("reports.low_stock_alert_schedule")} ${t("reports.low_stock_alert_admin_suffix")}`
                                : hasAutoEmailAlerts
                                    ? `${t("reports.low_stock_alert_schedule")} ${t("reports.low_stock_alert_user_suffix")}`
                                    : t("reports.low_stock_alert_user_suffix_locked")}
                        </p>
                    </div>
                </div>

                {isAdmin ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Tooltip title={t("reports.send_self_test_alert")}>
                            <Button
                                icon={<MailOutlined />}
                                size="small"
                                onClick={sendSelfTestAlert}
                                loading={sendingSelfTest}
                                className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-3)] text-[var(--ohnix-text-soft)]"
                            >
                                {t("reports.send_self_test_alert")}
                            </Button>
                        </Tooltip>
                        <Tooltip title={t("reports.manual_trigger_alerts_tooltip")}>
                            <Button
                                type="primary"
                                icon={<SettingOutlined />}
                                size="small"
                                onClick={triggerLowStockAlert}
                                loading={triggeringAlert}
                                disabled={schedulerStatus ? !schedulerStatus.isRunning : false}
                                className="bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] border-0"
                            >
                                {t("reports.trigger_test_alerts")}
                            </Button>
                        </Tooltip>
                    </div>
                ) : (
                    !hasAutoEmailAlerts && (
                        <button
                            type="button"
                            onClick={() => navigate("/profile?tab=billing")}
                            className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-[#29D8D5] px-4 py-2 text-xs font-semibold text-[#021314] transition-colors hover:bg-[#44F3F0] sm:self-center"
                        >
                            {t("reports.low_stock_alerts_view_plans")}
                            <ArrowRightOutlined />
                        </button>
                    )
                )}
            </div>

            {isAdmin && schedulerStatus && (
                <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--ohnix-line-3)] pt-3 text-xs text-[var(--ohnix-text-dim)]">
                    <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                            schedulerStatus.isRunning ? "text-[#44F3F0]" : "text-[var(--ohnix-status-rose)]"
                        }`}
                    >
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${
                                schedulerStatus.isRunning ? "bg-[#44F3F0] animate-pulse" : "bg-[var(--ohnix-status-rose)]"
                            }`}
                        />
                        {schedulerStatus.isRunning ? t("reports.scheduler_running") : t("reports.scheduler_stopped")}
                    </span>
                    {editingThreshold ? (
                        <span className="inline-flex items-center gap-1.5">
                            {t("reports.threshold")}:
                            <InputNumber
                                min={1}
                                size="small"
                                autoFocus
                                value={thresholdDraft}
                                onChange={setThresholdDraft}
                                onPressEnter={saveThreshold}
                                disabled={savingThreshold}
                                className="w-16"
                            />
                            {t("reports.units")}
                            <Tooltip title={t("common.save")}>
                                <Button
                                    icon={<CheckOutlined />}
                                    size="small"
                                    type="text"
                                    loading={savingThreshold}
                                    onClick={saveThreshold}
                                    className="text-[#44F3F0]"
                                />
                            </Tooltip>
                            <Tooltip title={t("common.cancel")}>
                                <Button
                                    icon={<CloseOutlined />}
                                    size="small"
                                    type="text"
                                    disabled={savingThreshold}
                                    onClick={cancelEditingThreshold}
                                    className="text-[var(--ohnix-text-dim)]"
                                />
                            </Tooltip>
                        </span>
                    ) : (
                        <Tooltip title={t("reports.threshold_hint")}>
                            <span className="inline-flex items-center gap-1.5">
                                {t("reports.threshold")}: {schedulerStatus.threshold} {t("reports.units")}
                                <button
                                    type="button"
                                    onClick={startEditingThreshold}
                                    className="text-[var(--ohnix-text-dim)] hover:text-[#44F3F0]"
                                    aria-label={t("reports.edit_threshold")}
                                >
                                    <EditOutlined />
                                </button>
                            </span>
                        </Tooltip>
                    )}
                    <span>
                        {t("reports.next_run")}:{" "}
                        {schedulerStatus.nextRun
                            ? new Date(schedulerStatus.nextRun).toLocaleString(currentLanguage)
                            : t("reports.not_scheduled")}
                    </span>
                </div>
            )}

            {!isAdmin && hasAutoEmailAlerts && (
                <div className="relative mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[var(--ohnix-line-3)] pt-3 text-xs text-[var(--ohnix-text-dim)]">
                    {!canConfigureAccountThreshold ? (
                        <Tooltip title={t("reports.account_threshold_hint")}>
                            <span className="inline-flex items-center gap-1.5">
                                <LockOutlined />
                                {t("reports.account_threshold_upsell")}
                            </span>
                        </Tooltip>
                    ) : editingAccountThreshold ? (
                        <span className="inline-flex items-center gap-1.5">
                            {t("reports.account_threshold")}:
                            <InputNumber
                                min={1}
                                size="small"
                                autoFocus
                                value={accountThresholdDraft}
                                onChange={setAccountThresholdDraft}
                                onPressEnter={() => saveAccountThreshold(accountThresholdDraft)}
                                disabled={savingAccountThreshold}
                                className="w-16"
                            />
                            {t("reports.units")}
                            <Tooltip title={t("common.save")}>
                                <Button
                                    icon={<CheckOutlined />}
                                    size="small"
                                    type="text"
                                    loading={savingAccountThreshold}
                                    disabled={!accountThresholdDraft || accountThresholdDraft < 1}
                                    onClick={() => saveAccountThreshold(accountThresholdDraft)}
                                    className="text-[#44F3F0]"
                                />
                            </Tooltip>
                            <Tooltip title={t("common.cancel")}>
                                <Button
                                    icon={<CloseOutlined />}
                                    size="small"
                                    type="text"
                                    disabled={savingAccountThreshold}
                                    onClick={cancelEditingAccountThreshold}
                                    className="text-[var(--ohnix-text-dim)]"
                                />
                            </Tooltip>
                        </span>
                    ) : (
                        <>
                            <Tooltip title={t("reports.account_threshold_hint")}>
                                <span className="inline-flex items-center gap-1.5">
                                    {t("reports.account_threshold")}:{" "}
                                    {accountThreshold !== null
                                        ? `${accountThreshold} ${t("reports.units")}`
                                        : t("reports.account_threshold_not_set")}
                                    <button
                                        type="button"
                                        onClick={startEditingAccountThreshold}
                                        className="text-[var(--ohnix-text-dim)] hover:text-[#44F3F0]"
                                        aria-label={t("reports.edit_account_threshold")}
                                    >
                                        <EditOutlined />
                                    </button>
                                </span>
                            </Tooltip>
                            {accountThreshold !== null && (
                                <button
                                    type="button"
                                    onClick={() => saveAccountThreshold(null)}
                                    disabled={savingAccountThreshold}
                                    className="text-[var(--ohnix-text-dim)] underline decoration-dotted hover:text-[#44F3F0]"
                                >
                                    {t("reports.account_threshold_reset")}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default LowStockAlertsPanel;
