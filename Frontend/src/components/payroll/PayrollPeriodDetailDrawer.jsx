import React, { useCallback, useEffect, useState } from "react";
import { Drawer, Typography, Spin, Button, Popconfirm, Collapse, InputNumber } from "antd";
import { CheckOutlined, CloseOutlined, BankOutlined, FilePdfOutlined, DollarOutlined, SendOutlined, SyncOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { payrollService } from "../../services/payrollService";
import EmptyState from "../common/EmptyState";
import StatusPill from "../common/StatusPill";

// itcycle-api-dian's own PayrollDocument.status values (reused ElectronicInvoiceStatus)
// that this drawer can still resend/refresh from - see electronicPayroll.service.js.
const ELECTRONIC_PAYROLL_ISSUABLE_STATUSES = [undefined, null, "draft", "error", "rejected"];
const ELECTRONIC_PAYROLL_SYNCABLE_STATUSES = ["issuing", "submitted", "contingency"];

const STATUS_COLORS = { draft: "#8b98a0", calculated: "#7c6af7", approved: "#f59e0b", paid: "#44f3f0", cancelled: "#fb7185" };

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

// Full detail (documents + lines) for one PayrollPeriod - fetched on open
// since the list view (usePayrollPeriods.js) only carries each document's
// totals, not its lines, to keep the list endpoint light.
const PayrollPeriodDetailDrawer = ({ periodId, canEdit, onClose, onCalculate, onApprove, onOpenPay, onCancel }) => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const [period, setPeriod] = useState(null);
    const [status, setStatus] = useState("loading");
    const [actionLoading, setActionLoading] = useState(false);
    const [workedDaysEdits, setWorkedDaysEdits] = useState({});
    const [electronicPayrollLoading, setElectronicPayrollLoading] = useState({});

    const load = useCallback(async () => {
        if (!periodId) return;
        setStatus("loading");
        try {
            const res = await payrollService.getPeriod(periodId);
            setPeriod(res.data);
            setStatus("loaded");
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
            setStatus("error");
        }
    }, [periodId, t]);

    useEffect(() => {
        load();
    }, [load]);

    const runAction = async (fn) => {
        setActionLoading(true);
        await fn();
        await load();
        setActionLoading(false);
    };

    const saveWorkedDays = async (documentId) => {
        const value = workedDaysEdits[documentId];
        if (value === undefined) return;
        try {
            await payrollService.updateWorkedDays(documentId, value);
            toast.success(t("payroll.worked_days_updated"));
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    const downloadPayslip = async (documentId, employeeName) => {
        try {
            const blob = await payrollService.downloadPayslipPdf(documentId);
            downloadBlob(new Blob([blob], { type: "application/pdf" }), `desprendible-${employeeName}.pdf`);
        } catch {
            toast.error(t("payroll.failed_download_payslip"));
        }
    };

    const runElectronicPayrollAction = async (documentId, fn, successMessage, failureKey) => {
        setElectronicPayrollLoading((prev) => ({ ...prev, [documentId]: true }));
        try {
            await fn(documentId);
            toast.success(successMessage);
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t(failureKey));
        } finally {
            setElectronicPayrollLoading((prev) => ({ ...prev, [documentId]: false }));
        }
    };

    const issueElectronicPayroll = (documentId) =>
        runElectronicPayrollAction(documentId, payrollService.issueElectronicPayroll, t("payroll.electronic_payroll_issued"), "payroll.failed_issue_electronic_payroll");

    const syncElectronicPayroll = (documentId) =>
        runElectronicPayrollAction(documentId, payrollService.syncElectronicPayroll, t("payroll.electronic_payroll_synced"), "payroll.failed_sync_electronic_payroll");

    const issueAllElectronicPayroll = async () => {
        setActionLoading(true);
        try {
            await payrollService.issueAllElectronicPayroll(period._id);
            toast.success(t("payroll.electronic_payroll_bulk_started"));
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("payroll.failed_issue_electronic_payroll"));
        } finally {
            setActionLoading(false);
        }
    };

    const issueElectronicPayrollAdjustment = (documentId, adjustmentType) =>
        runElectronicPayrollAction(
            documentId,
            (id) => payrollService.issueElectronicPayrollAdjustment(id, adjustmentType),
            t("payroll.electronic_payroll_adjustment_issued"),
            "payroll.failed_issue_electronic_payroll_adjustment"
        );

    const syncElectronicPayrollAdjustment = (documentId, adjustmentId) =>
        runElectronicPayrollAction(
            `${documentId}:${adjustmentId}`,
            () => payrollService.syncElectronicPayrollAdjustment(documentId, adjustmentId),
            t("payroll.electronic_payroll_synced"),
            "payroll.failed_sync_electronic_payroll"
        );

    return (
        <Drawer
            title={<span className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("payroll.period_detail")}</span>}
            placement="right"
            onClose={onClose}
            open={Boolean(periodId)}
            width={640}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                body: { background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))" },
            }}
        >
            {status === "loading" ? (
                <div className="flex justify-center py-10">
                    <Spin />
                </div>
            ) : status === "error" ? (
                <EmptyState title={t("common.error")} action={<Button onClick={load}>{t("products.retry_load")}</Button>} />
            ) : period ? (
                <div className="space-y-4">
                    <div className="module-shell rounded-2xl border border-[var(--ohnix-line-4)] p-4 flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <Typography.Text className="text-sm text-[var(--ohnix-text-muted)] block">
                                {new Date(period.start_date).toLocaleDateString(currentLanguage)} - {new Date(period.end_date).toLocaleDateString(currentLanguage)}
                            </Typography.Text>
                            <Typography.Text className="text-2xl font-bold text-[#44F3F0]">{formatCurrency(period.total_net_pay)}</Typography.Text>
                        </div>
                        <span
                            className="status-pill"
                            style={{ color: STATUS_COLORS[period.status], background: `${STATUS_COLORS[period.status]}18`, border: `1px solid ${STATUS_COLORS[period.status]}33` }}
                        >
                            <span className="status-dot" style={{ background: STATUS_COLORS[period.status] }} />
                            {t(`payroll.period_status_${period.status}`)}
                        </span>
                    </div>

                    {canEdit && (
                        <div className="flex gap-2 flex-wrap">
                            {["draft", "calculated"].includes(period.status) && (
                                <Button loading={actionLoading} onClick={() => runAction(() => onCalculate(period._id))} className="h-9 rounded-md">
                                    {t("payroll.calculate_period")}
                                </Button>
                            )}
                            {period.status === "calculated" && (
                                <Popconfirm title={t("payroll.approve_period_confirm")} okText={t("common.yes")} cancelText={t("common.no")} onConfirm={() => runAction(() => onApprove(period._id))}>
                                    <Button icon={<CheckOutlined />} loading={actionLoading} className="h-9 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium">
                                        {t("payroll.approve_period")}
                                    </Button>
                                </Popconfirm>
                            )}
                            {period.status === "approved" && (
                                <Button icon={<BankOutlined />} loading={actionLoading} onClick={() => onOpenPay(period)} className="h-9 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium">
                                    {t("payroll.pay_period")}
                                </Button>
                            )}
                            {["draft", "calculated"].includes(period.status) && (
                                <Popconfirm title={t("payroll.cancel_period_confirm")} okText={t("common.yes")} cancelText={t("common.no")} onConfirm={() => runAction(() => onCancel(period._id))}>
                                    <Button danger icon={<CloseOutlined />} loading={actionLoading} className="h-9 rounded-md">
                                        {t("common.cancel")}
                                    </Button>
                                </Popconfirm>
                            )}
                            {["approved", "paid"].includes(period.status) && (
                                <Popconfirm title={t("payroll.issue_all_electronic_payroll_confirm")} okText={t("common.yes")} cancelText={t("common.no")} onConfirm={issueAllElectronicPayroll}>
                                    <Button icon={<SendOutlined />} loading={actionLoading} className="h-9 rounded-md">
                                        {t("payroll.issue_all_electronic_payroll")}
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                    )}

                    <Collapse
                        items={period.documents.map((doc) => ({
                            key: doc._id,
                            label: (
                                <div className="flex items-center justify-between w-full pr-2">
                                    <span className="font-medium text-[var(--ohnix-text-primary)]">{doc.employee_name}</span>
                                    <span className="text-[#44F3F0] font-semibold">{formatCurrency(doc.net_pay)}</span>
                                </div>
                            ),
                            children: (
                                <div className="space-y-3">
                                    {["draft", "calculated"].includes(period.status) && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-[var(--ohnix-text-muted)]">{t("payroll.worked_days")}</span>
                                            <InputNumber
                                                size="small"
                                                min={0}
                                                value={workedDaysEdits[doc._id] ?? doc.worked_days}
                                                onChange={(v) => setWorkedDaysEdits((prev) => ({ ...prev, [doc._id]: v }))}
                                            />
                                            <Button size="small" onClick={() => saveWorkedDays(doc._id)}>
                                                {t("common.save")}
                                            </Button>
                                        </div>
                                    )}
                                    {["earning", "deduction", "employer_contribution"].map((category) => {
                                        const lines = doc.lines.filter((l) => l.category === category);
                                        if (lines.length === 0) return null;
                                        return (
                                            <div key={category}>
                                                <Typography.Text className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)]">
                                                    {t(`payroll.category_${category}`)}
                                                </Typography.Text>
                                                {lines.map((line) => (
                                                    <div key={line._id} className="flex justify-between text-sm py-0.5">
                                                        <span>{t(`payroll.concept_${line.concept_code}`)}</span>
                                                        <span>{formatCurrency(line.amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    {period.status !== "draft" && (
                                        <Button size="small" icon={<FilePdfOutlined />} onClick={() => downloadPayslip(doc._id, doc.employee_name)}>
                                            {t("payroll.download_payslip")}
                                        </Button>
                                    )}
                                    {["approved", "paid"].includes(period.status) && (
                                        <div className="flex items-center gap-2 pt-1 border-t border-[var(--ohnix-line-4)] mt-1">
                                            <span className="text-xs text-[var(--ohnix-text-muted)]">{t("payroll.electronic_payroll")}</span>
                                            {doc.electronic_payroll && <StatusPill status={doc.electronic_payroll.status} />}
                                            {ELECTRONIC_PAYROLL_ISSUABLE_STATUSES.includes(doc.electronic_payroll?.status) && (
                                                <Button
                                                    size="small"
                                                    icon={<SendOutlined />}
                                                    loading={Boolean(electronicPayrollLoading[doc._id])}
                                                    onClick={() => issueElectronicPayroll(doc._id)}
                                                >
                                                    {t("payroll.issue_electronic_payroll")}
                                                </Button>
                                            )}
                                            {ELECTRONIC_PAYROLL_SYNCABLE_STATUSES.includes(doc.electronic_payroll?.status) && (
                                                <Button
                                                    size="small"
                                                    icon={<SyncOutlined />}
                                                    loading={Boolean(electronicPayrollLoading[doc._id])}
                                                    onClick={() => syncElectronicPayroll(doc._id)}
                                                >
                                                    {t("payroll.sync_electronic_payroll")}
                                                </Button>
                                            )}
                                            {doc.electronic_payroll?.status === "accepted" && (
                                                <>
                                                    <Popconfirm
                                                        title={t("payroll.correct_electronic_payroll_confirm")}
                                                        okText={t("common.yes")}
                                                        cancelText={t("common.no")}
                                                        onConfirm={() => issueElectronicPayrollAdjustment(doc._id, "1")}
                                                    >
                                                        <Button size="small" loading={Boolean(electronicPayrollLoading[doc._id])}>
                                                            {t("payroll.correct_electronic_payroll")}
                                                        </Button>
                                                    </Popconfirm>
                                                    <Popconfirm
                                                        title={t("payroll.void_electronic_payroll_confirm")}
                                                        okText={t("common.yes")}
                                                        cancelText={t("common.no")}
                                                        onConfirm={() => issueElectronicPayrollAdjustment(doc._id, "2")}
                                                    >
                                                        <Button size="small" danger loading={Boolean(electronicPayrollLoading[doc._id])}>
                                                            {t("payroll.void_electronic_payroll")}
                                                        </Button>
                                                    </Popconfirm>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    {doc.electronic_payroll?.adjustments?.length > 0 && (
                                        <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-[var(--ohnix-line-4)]">
                                            <span className="text-xs text-[var(--ohnix-text-muted)]">{t("payroll.electronic_payroll_adjustments")}</span>
                                            {doc.electronic_payroll.adjustments.map((adjustment) => (
                                                <div key={adjustment._id} className="flex items-center gap-2">
                                                    <StatusPill status={adjustment.status} />
                                                    {ELECTRONIC_PAYROLL_SYNCABLE_STATUSES.includes(adjustment.status) && (
                                                        <Button
                                                            size="small"
                                                            icon={<SyncOutlined />}
                                                            loading={Boolean(electronicPayrollLoading[`${doc._id}:${adjustment._id}`])}
                                                            onClick={() => syncElectronicPayrollAdjustment(doc._id, adjustment._id)}
                                                        >
                                                            {t("payroll.sync_electronic_payroll")}
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ),
                        }))}
                    />
                </div>
            ) : (
                <EmptyState icon={<DollarOutlined />} title={t("payroll.no_period_selected")} />
            )}
        </Drawer>
    );
};

export default PayrollPeriodDetailDrawer;
