import React, { useCallback, useEffect, useState } from "react";
import { Drawer, Typography, Spin, Button, Popconfirm, Collapse, InputNumber } from "antd";
import { CheckOutlined, CloseOutlined, BankOutlined, FilePdfOutlined, DollarOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { payrollService } from "../../services/payrollService";
import EmptyState from "../common/EmptyState";

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
