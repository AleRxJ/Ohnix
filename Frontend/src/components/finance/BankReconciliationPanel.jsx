import { useMemo, useState } from "react";
import { Alert, Checkbox, Collapse, Table, Tag, Form, DatePicker, Input, InputNumber, Button, Modal, Popconfirm, Select, Upload } from "antd";
import { BankOutlined, BulbOutlined, CalculatorOutlined, FileSearchOutlined, PlusOutlined, ThunderboltOutlined, UndoOutlined, UploadOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";
import { useCashAccountMovements } from "../../hooks/finance/useCashAccounts";
import { accountingService } from "../../services/accountingService";
import { financeService } from "../../services/financeService";
import ReportExportButtons from "../reports/ReportExportButtons";
import { downloadCsv, downloadExcel, downloadPdfReport } from "../../utils/exportReport";
import { financeErrorMessage } from "../../utils/financeError";

const { Option } = Select;
const { RangePicker } = DatePicker;

const SOURCE_LABEL_KEYS = {
    order_payment: "finance.source_order_payment",
    purchase_payment: "finance.source_purchase_payment",
    manual_deposit: "finance.source_manual_deposit",
    manual_withdrawal: "finance.source_manual_withdrawal",
    transfer_out: "finance.source_transfer_out",
    transfer_in: "finance.source_transfer_in",
    adjustment: "finance.source_adjustment",
    tax_payment: "finance.source_tax_payment",
    prepaid_expense: "finance.source_prepaid_expense",
};

// Fase 7 - extracted from CashAccountMovementsDrawer.jsx (which kept only
// the ledger) into its own full-page-sized panel, no backend changes: same
// useCashAccountMovements hook, same OFX/XLSX client-side parsers, same
// suggestMatches-backed suggestions flow. `chargeTarget`/`incomeTarget` hold
// `{ entries: [...] }` (length 1 for the per-row buttons, N for the
// multi-select bulk toolbar) so the single-entry and bulk-reclassify flows
// share one modal/form instead of two.
// Colombian banks print the 4x1000 under several labels ("GMF", "IMPTO
// GOBIERNO 4X1000", "GRAVAMEN MOVIMIENTOS FINANCIEROS"...) - matched against
// the accent-stripped description so "Gravámen" also hits.
const GMF_PATTERN = /(\bgmf\b|4\s*x\s*1000|4\s*x\s*mil|gravamen|impto\.?\s*gobierno|movimientos\s+financieros)/i;
const isGmfEntry = (entry) => Number(entry.amount) < 0 && GMF_PATTERN.test(String(entry.description || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

const BankReconciliationPanel = ({ account }) => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency, currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const [entryForm] = Form.useForm();
    const [matchTarget, setMatchTarget] = useState(null);
    const [matchMovementId, setMatchMovementId] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importReading, setImportReading] = useState(false);
    const [suggestions, setSuggestions] = useState(null);
    const [selectedSuggestions, setSelectedSuggestions] = useState([]);
    const [chargeTarget, setChargeTarget] = useState(null); // { entries: [...] }
    const [expenseAccounts, setExpenseAccounts] = useState([]);
    const [chargeForm] = Form.useForm();
    const [incomeTarget, setIncomeTarget] = useState(null); // { entries: [...] }
    const [revenueAccounts, setRevenueAccounts] = useState([]);
    const [incomeForm] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [reportOpen, setReportOpen] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportRows, setReportRows] = useState([]);
    const [reportRange, setReportRange] = useState([dayjs().startOf("month"), dayjs().endOf("month")]);
    const [reportStatus, setReportStatus] = useState("all");
    const [balanceCutoff, setBalanceCutoff] = useState(dayjs());
    const [statementBalance, setStatementBalance] = useState(null);
    const [balanceResult, setBalanceResult] = useState(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const chargeTreatment = Form.useWatch("tax_treatment", chargeForm);
    const chargeRate = Form.useWatch("tax_rate", chargeForm);
    const incomeTreatment = Form.useWatch("tax_treatment", incomeForm);
    const incomeRate = Form.useWatch("tax_rate", incomeForm);
    const taxBreakdown = (total, treatment, rate) => {
        if (treatment !== "taxed" || !(Number(rate) > 0) || !(Number(total) > 0)) return null;
        const base = Number(total) / (1 + Number(rate) / 100);
        return { base, tax: Number(total) - base };
    };
    const chargeTotal = (chargeTarget?.entries || []).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    const incomeTotal = (incomeTarget?.entries || []).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const chargePreview = taxBreakdown(chargeTotal, chargeTreatment, chargeRate);
    const incomePreview = taxBreakdown(incomeTotal, incomeTreatment, incomeRate);

    const {
        unmatchedMovements,
        unmatchedEntries,
        reconciliationSummary,
        submitting,
        addStatementEntry,
        addStatementEntries,
        matchEntry,
        getSuggestions,
        matchEntries,
        unmatchEntry,
        registerStatementExpense,
        registerStatementIncome,
    } = useCashAccountMovements(account?._id);

    const normalizeHeader = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s_-]+/g, "");
    const parseNumber = (value) => {
        if (typeof value === "number") return value;
        const raw = String(value ?? "").trim().replace(/\s/g, "");
        if (!raw) return 0;
        const normalized = raw.includes(",") && raw.includes(".")
            ? (raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""))
            : raw.replace(",", ".");
        return Number(normalized.replace(/[^0-9.-]/g, ""));
    };

    // Best-effort default mapping from real header names - the column
    // Selects in the preview modal start here, but the user can always
    // override any of them (see updateMapping below) when a bank's export
    // uses headers this heuristic doesn't recognize.
    const detectMapping = (headers) => {
        const findHeader = (names) => headers.find((header) => names.includes(normalizeHeader(header))) || null;
        return {
            dateCol: findHeader(["fecha", "date", "fechamovimiento", "transactiondate"]),
            amountCol: findHeader(["valor", "monto", "importe", "amount"]),
            creditCol: findHeader(["credito", "credit", "abono", "ingreso"]),
            debitCol: findHeader(["debito", "debit", "cargo", "salida"]),
            descriptionCol: findHeader(["descripcion", "description", "detalle", "concepto", "memo", "referencia"]),
        };
    };

    // Applies `mapping` to already-read rows, collecting bad/duplicate rows
    // into `rowErrors` instead of throwing on the first one - a row that
    // fails here never reaches the backend, so the tolerant behavior of
    // Backend/services/bankReconciliation.service.js#createStatementEntries
    // is only the second line of defense, not the only one.
    const buildEntriesFromRows = (rows, mapping, batchKey) => {
        const entries = [];
        const rowErrors = [];
        const seen = new Set();
        rows.forEach((row, index) => {
            const rawDate = mapping.dateCol ? row[mapping.dateCol] : undefined;
            const excelDate = typeof rawDate === "number" ? XLSX.SSF.parse_date_code(rawDate) : null;
            const date = excelDate ? dayjs(new Date(excelDate.y, excelDate.m - 1, excelDate.d)) : dayjs(rawDate);
            const direct = mapping.amountCol ? row[mapping.amountCol] : undefined;
            const credit = mapping.creditCol ? parseNumber(row[mapping.creditCol]) : 0;
            const debit = mapping.debitCol ? parseNumber(row[mapping.debitCol]) : 0;
            const amount = direct !== undefined && direct !== "" ? parseNumber(direct) : credit - debit;
            if (!date.isValid() || !Number.isFinite(amount) || amount === 0) {
                rowErrors.push({ row: index + 2, reason: t("finance.import_reason_invalid") });
                return;
            }
            const description = mapping.descriptionCol ? String(row[mapping.descriptionCol] || "").trim() || null : null;
            const dupKey = `${date.toISOString()}|${amount.toFixed(2)}|${description || ""}`;
            if (seen.has(dupKey)) {
                rowErrors.push({ row: index + 2, reason: t("finance.import_reason_duplicate") });
                return;
            }
            seen.add(dupKey);
            entries.push({ entry_date: date.toISOString(), description, amount, import_fingerprint: `${batchKey}:${index}` });
        });
        return { entries, rowErrors };
    };

    const parseSpreadsheetFile = async (file) => {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        const batchKey = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: true });
        if (!rows.length) throw new Error(t("finance.import_empty"));
        if (rows.length > 1000) throw new Error(t("finance.import_too_many"));
        const headers = Object.keys(rows[0]);
        const mapping = detectMapping(headers);
        const mappingIncomplete = !mapping.dateCol || (!mapping.amountCol && !mapping.creditCol && !mapping.debitCol);
        const { entries, rowErrors } = buildEntriesFromRows(rows, mapping, batchKey);
        setImportPreview({ kind: "spreadsheet", fileName: file.name, headers, rawRows: rows, batchKey, mapping, entries, rowErrors, mappingOpen: mappingIncomplete });
    };

    const updateMapping = (field, value) => {
        setImportPreview((current) => {
            if (!current || current.kind !== "spreadsheet") return current;
            const mapping = { ...current.mapping, [field]: value };
            const { entries, rowErrors } = buildEntriesFromRows(current.rawRows, mapping, current.batchKey);
            return { ...current, mapping, entries, rowErrors };
        });
    };

    // OFX1.x (SGML) tags routinely have no closing tag (e.g. `<DTPOSTED>
    // 20260105120000`), which XML parsers reject outright - a simple regex
    // per tag, scoped to one <STMTTRN> block, works for both OFX1 and the
    // XML-strict OFX2 without needing an XML/SGML library.
    const extractOfxTag = (block, tag) => block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim();
    const parseOfxDate = (raw) => {
        const match = String(raw || "").match(/^(\d{4})(\d{2})(\d{2})/);
        return match ? dayjs(`${match[1]}-${match[2]}-${match[3]}`) : dayjs(NaN);
    };
    const parseOfxFile = async (file) => {
        const text = await file.text();
        const blocks = text
            .split(/<STMTTRN>/i)
            .slice(1)
            .map((chunk) => chunk.split(/<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>/i)[0]);
        if (!blocks.length) throw new Error(t("finance.import_ofx_empty"));
        if (blocks.length > 1000) throw new Error(t("finance.import_too_many"));
        const entries = [];
        const rowErrors = [];
        const seen = new Set();
        blocks.forEach((block, index) => {
            const date = parseOfxDate(extractOfxTag(block, "DTPOSTED"));
            const amount = parseNumber(extractOfxTag(block, "TRNAMT"));
            const description = extractOfxTag(block, "NAME") || extractOfxTag(block, "MEMO") || null;
            const fitid = extractOfxTag(block, "FITID");
            if (!date.isValid() || !Number.isFinite(amount) || amount === 0) {
                rowErrors.push({ row: index + 1, reason: t("finance.import_reason_invalid") });
                return;
            }
            // FITID is the bank's own transaction id - a far more reliable
            // duplicate key than the file-hash fingerprint CSV/XLSX rows use,
            // since re-exporting an overlapping date range naturally
            // deduplicates against a PREVIOUS OFX import too, not just
            // within this same file.
            const dupKey = fitid ? `fitid:${fitid}` : `${date.toISOString()}|${amount.toFixed(2)}|${description || ""}`;
            if (seen.has(dupKey)) {
                rowErrors.push({ row: index + 1, reason: t("finance.import_reason_duplicate") });
                return;
            }
            seen.add(dupKey);
            entries.push({ entry_date: date.toISOString(), description, amount, import_fingerprint: fitid ? `ofx:${fitid}` : `ofx:${index}:${date.toISOString()}:${amount}` });
        });
        setImportPreview({ kind: "ofx", fileName: file.name, entries, rowErrors });
    };

    const readStatementFile = async (file) => {
        setImportReading(true);
        try {
            const name = file.name.toLowerCase();
            if (name.endsWith(".ofx") || name.endsWith(".qfx")) await parseOfxFile(file);
            else await parseSpreadsheetFile(file);
        } catch (error) {
            setImportPreview(null);
            Modal.error({ title: t("finance.import_failed"), content: error.message });
        } finally { setImportReading(false); }
        return false;
    };
    const confirmImport = async () => {
        const success = await addStatementEntries(importPreview.entries);
        if (success) setImportPreview(null);
    };
    const openSuggestions = async () => { const rows = await getSuggestions(); if (rows === null) return; setSuggestions(rows); setSelectedSuggestions(rows.filter((row) => !row.ambiguous).map((row) => row.entry._id)); };
    const confirmSuggestions = async () => { const chosen = suggestions.filter((row) => selectedSuggestions.includes(row.entry._id)); if (await matchEntries(chosen)) setSuggestions(null); };

    // An all-GMF selection preselects the 530505 account (lazily created by
    // the backend on first use) and a fixed description - the 4x1000 carries
    // no IVA, so "excluded" is already the right treatment.
    const openBankCharge = async (entries) => {
        const allGmf = entries.every(isGmfEntry);
        try {
            const [chartResponse, gmfResponse] = await Promise.all([
                accountingService.listChartOfAccounts(),
                allGmf ? financeService.getGmfAccount() : null,
            ]);
            const gmfAccount = gmfResponse?.data || null;
            const accounts = (chartResponse?.data || []).filter((item) => item.account_type === "expense" && item.is_active);
            setExpenseAccounts(gmfAccount && !accounts.some((item) => item._id === gmfAccount._id) ? [gmfAccount, ...accounts] : accounts);
            setChargeTarget({ entries });
            chargeForm.setFieldsValue({
                expense_account_id: gmfAccount?._id,
                description: allGmf ? t("finance.gmf_description") : entries.length === 1 ? (entries[0].description || t("finance.bank_charge_default")) : undefined,
                tax_treatment: "excluded",
                tax_rate: 19,
            });
        } catch (error) {
            Modal.error({ title: t("finance.bank_charge_failed"), content: financeErrorMessage(error, t) });
        }
    };
    const gmfEntries = useMemo(() => unmatchedEntries.filter(isGmfEntry), [unmatchedEntries]);
    const handleUnmatch = async (row) => {
        if (await unmatchEntry(row._id)) await loadReconciliationReport();
    };
    const loadReconciliationBalance = async () => {
        setBalanceLoading(true);
        try {
            const response = await financeService.getReconciliationBalance(account._id, {
                as_of: balanceCutoff.endOf("day").toISOString(),
                ...(statementBalance !== null && statementBalance !== undefined ? { statement_balance: statementBalance } : {}),
            });
            setBalanceResult(response?.data || null);
        } catch (error) {
            Modal.error({ title: t("finance.reconciliation_balance_failed"), content: financeErrorMessage(error, t) });
        } finally { setBalanceLoading(false); }
    };
    const confirmBankCharge = async (values) => {
        for (const target of chargeTarget.entries) {
            const success = await registerStatementExpense({ amount: Math.abs(target.amount), expense_account_id: values.expense_account_id, cash_account_id: account._id, description: values.description?.trim() || target.description || t("finance.bank_charge_default"), expense_date: target.entry_date, statement_entry_id: target._id, tax_treatment: values.tax_treatment, tax_rate: values.tax_rate });
            if (!success) return;
        }
        setChargeTarget(null);
        chargeForm.resetFields();
        setSelectedRowKeys([]);
    };
    const openBankIncome = async (entries) => {
        try {
            const response = await accountingService.listChartOfAccounts();
            setRevenueAccounts((response?.data || []).filter((item) => item.account_type === "revenue" && item.is_active));
            setIncomeTarget({ entries });
            incomeForm.setFieldsValue({ description: entries.length === 1 ? (entries[0].description || t("finance.bank_income_default")) : undefined, tax_treatment: "excluded", tax_rate: 19 });
        } catch {
            Modal.error({ title: t("finance.bank_income_failed"), content: t("finance.bank_income_load_accounts_failed") });
        }
    };
    const confirmBankIncome = async (values) => {
        for (const target of incomeTarget.entries) {
            const success = await registerStatementIncome({ amount: target.amount, revenue_account_id: values.revenue_account_id, cash_account_id: account._id, description: values.description?.trim() || target.description || t("finance.bank_income_default"), income_date: target.entry_date, statement_entry_id: target._id, tax_treatment: values.tax_treatment, tax_rate: values.tax_rate });
            if (!success) return;
        }
        setIncomeTarget(null);
        incomeForm.resetFields();
        setSelectedRowKeys([]);
    };
    const loadReconciliationReport = async (range = reportRange, status = reportStatus) => {
        setReportLoading(true);
        try {
            const response = await financeService.getReconciliationReport(account._id, {
                date_from: range?.[0]?.startOf("day").toISOString(),
                date_to: range?.[1]?.endOf("day").toISOString(),
                status,
            });
            setReportRows(response?.data || []);
        } catch (error) {
            Modal.error({ title: t("finance.reconciliation_report_failed"), content: financeErrorMessage(error, t) });
        } finally { setReportLoading(false); }
    };
    const openReconciliationReport = async () => { setReportOpen(true); await loadReconciliationReport(); };
    const reportData = () => [
        [t("finance.col_date"), t("finance.entry_description_label"), t("finance.col_amount"), t("finance.reconciliation_report_status"), t("finance.col_source"), t("finance.col_reason"), t("finance.reconciliation_report_reconciled_at")],
        ...reportRows.map((row) => [dayjs(row.entry_date).format("DD/MM/YYYY"), row.description || "", row.amount, t(`finance.reconciliation_status_${row.status}`), row.movement ? t(SOURCE_LABEL_KEYS[row.movement.source_type] || row.movement.source_type) : "", row.movement?.reason || "", row.movement?.reconciled_at ? dayjs(row.movement.reconciled_at).format("DD/MM/YYYY HH:mm") : ""]),
    ];
    const reconciliationExportPrefix = currentLanguage === "en" ? "reconciliation-report" : "informe-conciliacion";
    const exportReportCsv = () => downloadCsv(reportData(), `${reconciliationExportPrefix}-${account.name}-${dayjs().format("YYYY-MM-DD")}.csv`);
    const exportReportExcel = () => downloadExcel(reportData(), `${reconciliationExportPrefix}-${account.name}-${dayjs().format("YYYY-MM-DD")}.xlsx`, t("finance.reconciliation_report_sheet"));
    const exportReportPdf = () => downloadPdfReport({ title: t("finance.reconciliation_report_title"), subtitle: `${account.name} · ${reportRange?.[0]?.format("DD/MM/YYYY")} - ${reportRange?.[1]?.format("DD/MM/YYYY")}`, sections: [{ summary: [[t("finance.reconciliation_report_total"), reportRows.length], [t("finance.reconciliation_matched"), reportRows.filter((row) => row.status === "matched").length], [t("finance.reconciliation_pending"), reportRows.filter((row) => row.status === "unmatched").length]], table: { headers: reportData()[0], rows: reportData().slice(1) } }] }, `${reconciliationExportPrefix}-${account.name}-${dayjs().format("YYYY-MM-DD")}.pdf`);

    const handleAddEntry = async (values) => {
        const success = await addStatementEntry({
            entry_date: values.entry_date.toISOString(),
            description: values.description?.trim() || null,
            amount: values.amount,
        });
        if (success) entryForm.resetFields();
    };

    const openMatchModal = (entry) => {
        setMatchTarget(entry);
        setMatchMovementId(null);
    };

    const confirmMatch = async () => {
        if (!matchMovementId) return;
        const success = await matchEntry(matchTarget._id, matchMovementId);
        if (success) setMatchTarget(null);
    };

    const compatibleMovements = useMemo(() => {
        if (!matchTarget) return [];
        return unmatchedMovements
            .filter((movement) => Math.abs(Number(movement.delta) - Number(matchTarget.amount)) < 0.005)
            .sort((a, b) => Math.abs(dayjs(a.createdAt).diff(dayjs(matchTarget.entry_date), "minute")) - Math.abs(dayjs(b.createdAt).diff(dayjs(matchTarget.entry_date), "minute")));
    }, [matchTarget, unmatchedMovements]);

    const selectedEntries = useMemo(() => unmatchedEntries.filter((entry) => selectedRowKeys.includes(entry._id)), [unmatchedEntries, selectedRowKeys]);
    const canBulkCharge = selectedEntries.length > 0 && selectedEntries.every((entry) => entry.amount < 0);
    const canBulkIncome = selectedEntries.length > 0 && selectedEntries.every((entry) => entry.amount > 0);

    if (!account) return null;

    const entryColumns = [
        {
            title: t("finance.col_date"),
            dataIndex: "entry_date",
            key: "entry_date",
            render: (v) => dayjs(v).format("DD/MM/YYYY"),
            width: 120,
        },
        {
            title: t("finance.entry_description_label"),
            dataIndex: "description",
            key: "description",
            ellipsis: true,
            render: (v) => v || t("common.na"),
        },
        {
            title: t("finance.col_amount"),
            dataIndex: "amount",
            key: "amount",
            align: "right",
            render: (v) => formatCurrency(v),
        },
        {
            title: "",
            key: "actions",
            width: 230,
            render: (_, record) => <div className="flex gap-1"><Button size="small" onClick={() => openMatchModal(record)}>{t("finance.match_cta")}</Button>{record.amount < 0 ? <Button size="small" type="primary" ghost onClick={() => openBankCharge([record])}>{t("finance.bank_charge_cta")}</Button> : <Button size="small" type="primary" ghost onClick={() => openBankIncome([record])}>{t("finance.bank_income_cta")}</Button>}</div>,
        },
    ];

    return (
        <div className="space-y-4">
            <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon icon={<BulbOutlined />} message={t("finance.reconciliation_help_title")} description={t("finance.reconciliation_help_desc")} />
            <div className="flex justify-end mb-3"><Button icon={<FileSearchOutlined />} onClick={openReconciliationReport}>{t("finance.reconciliation_report_cta")}</Button></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">{[["coverage_percent", "reconciliation_coverage", (v) => `${v || 0}%`], ["matched_count", "reconciliation_matched", (v) => v || 0], ["unmatched_count", "reconciliation_pending", (v) => v || 0], ["unmatched_volume", "reconciliation_pending_value", (v) => formatCurrency(v || 0)]].map(([key, label, render]) => <div key={key} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-3"><span className="block text-xs text-[var(--ohnix-text-muted)]">{t(`finance.${label}`)}</span><strong className="text-base text-[var(--ohnix-text-primary)]">{render(reconciliationSummary[key])}</strong></div>)}</div>

            <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 mb-5">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                    <div><strong className="text-[var(--ohnix-text-primary)]">{t("finance.reconciliation_balance_title")}</strong><p className="text-xs text-[var(--ohnix-text-muted)] mt-1 mb-0">{t("finance.reconciliation_balance_help")}</p></div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <DatePicker value={balanceCutoff} onChange={(value) => { setBalanceCutoff(value || dayjs()); setBalanceResult(null); }} format="DD/MM/YYYY" allowClear={false} className="w-full sm:w-40" />
                        <InputNumber value={statementBalance} onChange={(value) => { setStatementBalance(value); setBalanceResult(null); }} placeholder={t("finance.reconciliation_statement_balance_placeholder")} prefix={currency.symbol} formatter={currencyInputProps.formatter} parser={currencyInputProps.parser} className="w-full sm:w-56" />
                        <Button icon={<CalculatorOutlined />} loading={balanceLoading} onClick={loadReconciliationBalance}>{t("finance.reconciliation_balance_cta")}</Button>
                    </div>
                </div>
                {balanceResult && (
                    <div className="mt-4 space-y-1 text-sm">
                        {[
                            ["reconciliation_balance_book", balanceResult.book_balance],
                            ["reconciliation_balance_pending_movements", -balanceResult.pending_movements_total, balanceResult.pending_movements_count],
                            ["reconciliation_balance_pending_entries", balanceResult.pending_entries_total, balanceResult.pending_entries_count],
                        ].map(([label, value, count]) => (
                            <div key={label} className="flex justify-between gap-3"><span className="text-[var(--ohnix-text-muted)]">{t(`finance.${label}`, { count })}</span><span className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(value)}</span></div>
                        ))}
                        <div className="flex justify-between gap-3 border-t border-[var(--ohnix-line-4)] pt-1 font-semibold text-[var(--ohnix-text-primary)]"><span>{t("finance.reconciliation_balance_expected")}</span><span className="tabular-nums">{formatCurrency(balanceResult.expected_statement_balance)}</span></div>
                        {balanceResult.statement_balance !== null && (
                            <>
                                <div className="flex justify-between gap-3"><span className="text-[var(--ohnix-text-muted)]">{t("finance.reconciliation_balance_statement")}</span><span className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(balanceResult.statement_balance)}</span></div>
                                <div className="flex justify-between items-center gap-3"><span className="text-[var(--ohnix-text-muted)]">{t("finance.reconciliation_balance_difference")}</span><span className="flex items-center gap-2"><Tag className="m-0" color={balanceResult.balanced ? "success" : "error"}>{t(balanceResult.balanced ? "finance.reconciliation_balance_ok" : "finance.reconciliation_balance_off")}</Tag><strong className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(balanceResult.difference)}</strong></span></div>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-dashed border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><strong className="text-[var(--ohnix-text-primary)]">{t("finance.import_title")}</strong><p className="text-xs text-[var(--ohnix-text-muted)] mt-1 mb-0">{t("finance.import_help")}</p></div>
                <Upload accept=".csv,.xlsx,.xls,.ofx,.qfx" showUploadList={false} beforeUpload={readStatementFile} disabled={submitting || importReading}>
                    <Button icon={<UploadOutlined />} loading={importReading}>{t("finance.import_cta")}</Button>
                </Upload>
            </div>

            <Form form={entryForm} layout="vertical" onFinish={handleAddEntry} className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Form.Item name="entry_date" label={t("finance.entry_date_label")} rules={[{ required: true, message: t("validation.required_field") }]} className="mb-0">
                        <DatePicker className="w-full" format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item name="description" label={t("finance.entry_description_label")} className="mb-0">
                        <Input placeholder={t("finance.entry_description_placeholder")} maxLength={200} />
                    </Form.Item>
                    <Form.Item name="amount" label={t("finance.entry_amount_label")} rules={[{ required: true, message: t("validation.required_field") }]} className="mb-0">
                        <InputNumber
                            className="w-full"
                            prefix={currency.symbol}
                            formatter={currencyInputProps.formatter}
                            parser={currencyInputProps.parser}
                        />
                    </Form.Item>
                </div>
                <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={submitting}
                    className="mt-3"
                >
                    {t("finance.add_entry_cta")}
                </Button>
            </Form>

            <h4 className="text-xs font-semibold text-[var(--ohnix-text-muted)] mb-3 uppercase tracking-wide">
                {t("finance.unmatched_entries_title")}
            </h4>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {unmatchedEntries.length > 0 && <Button icon={<ThunderboltOutlined />} onClick={openSuggestions}>{t("finance.suggestions_cta")}</Button>}
                {gmfEntries.length > 0 && <Button icon={<BankOutlined />} onClick={() => openBankCharge(gmfEntries)}>{t("finance.gmf_classify_cta", { count: gmfEntries.length })}</Button>}
                {selectedRowKeys.length > 0 && (
                    <>
                        <Tag className="m-0">{t("finance.bulk_selected_count", { count: selectedRowKeys.length })}</Tag>
                        <Button size="small" type="primary" ghost disabled={!canBulkCharge} onClick={() => openBankCharge(selectedEntries)}>{t("finance.bank_charge_cta")}</Button>
                        <Button size="small" type="primary" ghost disabled={!canBulkIncome} onClick={() => openBankIncome(selectedEntries)}>{t("finance.bank_income_cta")}</Button>
                        {!canBulkCharge && !canBulkIncome && <span className="text-xs text-[var(--ohnix-text-dim)]">{t("finance.bulk_mixed_sign_hint")}</span>}
                    </>
                )}
            </div>
            {unmatchedEntries.length > 0 ? (
                <Table
                    className="module-dark-table"
                    dataSource={unmatchedEntries}
                    columns={entryColumns}
                    pagination={{ pageSize: 10 }}
                    rowKey="_id"
                    size="small"
                    scroll={{ x: "max-content" }}
                    rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                />
            ) : (
                <div className="text-sm text-[var(--ohnix-text-muted)] py-4">{t("finance.no_unmatched_entries")}</div>
            )}

            <Modal
                title={t("finance.match_modal_title")}
                open={Boolean(matchTarget)}
                onCancel={() => setMatchTarget(null)}
                onOk={confirmMatch}
                confirmLoading={submitting}
                okButtonProps={{ disabled: !matchMovementId }}
                destroyOnHidden
            >
                {matchTarget && (
                    <div className="space-y-3">
                        <div className="text-sm text-[var(--ohnix-text-muted)]">
                            {dayjs(matchTarget.entry_date).format("DD/MM/YYYY")} · {matchTarget.description || t("common.na")} ·{" "}
                            <span className="font-semibold text-[var(--ohnix-text-primary)]">{formatCurrency(matchTarget.amount)}</span>
                        </div>
                        <Select
                            className="w-full"
                            placeholder={t("finance.match_select_movement_placeholder")}
                            value={matchMovementId}
                            onChange={setMatchMovementId}
                            notFoundContent={t("finance.no_compatible_movements")}
                        >
                            {compatibleMovements.map((m) => (
                                <Option key={m._id} value={m._id}>
                                    {dayjs(m.createdAt).format("DD/MM/YYYY")} · {m.delta >= 0 ? "+" : ""}
                                    {formatCurrency(m.delta)} · {m.reason || t(SOURCE_LABEL_KEYS[m.source_type] || m.source_type)}
                                </Option>
                            ))}
                        </Select>
                        {compatibleMovements.length === 0 && <Alert type="warning" showIcon message={t("finance.reconciliation_no_match_help")} />}
                    </div>
                )}
            </Modal>
            <Modal title={t("finance.import_preview_title")} open={Boolean(importPreview)} onCancel={() => setImportPreview(null)} onOk={confirmImport} confirmLoading={submitting} okText={t("finance.import_confirm")} okButtonProps={{ disabled: !importPreview?.entries?.length }} width={800}>
                {importPreview && <>
                    <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.import_preview_summary", { file: importPreview.fileName, count: importPreview.entries.length })} description={t("finance.import_sign_help")} />
                    {importPreview.kind === "spreadsheet" && (
                        <Collapse
                            className="mb-4"
                            defaultActiveKey={importPreview.mappingOpen ? ["mapping"] : []}
                            items={[{
                                key: "mapping",
                                label: t("finance.import_mapping_title"),
                                children: (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("finance.import_mapping_date")} *</label>
                                            <Select className="w-full" value={importPreview.mapping.dateCol} onChange={(value) => updateMapping("dateCol", value)} options={importPreview.headers.map((h) => ({ value: h, label: h }))} placeholder={t("finance.import_mapping_select_column")} />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("finance.import_mapping_description")}</label>
                                            <Select allowClear className="w-full" value={importPreview.mapping.descriptionCol} onChange={(value) => updateMapping("descriptionCol", value ?? null)} options={importPreview.headers.map((h) => ({ value: h, label: h }))} placeholder={t("finance.import_mapping_select_column")} />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("finance.import_mapping_amount")}</label>
                                            <Select allowClear className="w-full" value={importPreview.mapping.amountCol} onChange={(value) => updateMapping("amountCol", value ?? null)} options={importPreview.headers.map((h) => ({ value: h, label: h }))} placeholder={t("finance.import_mapping_select_column")} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("finance.import_mapping_credit")}</label>
                                                <Select allowClear className="w-full" value={importPreview.mapping.creditCol} onChange={(value) => updateMapping("creditCol", value ?? null)} options={importPreview.headers.map((h) => ({ value: h, label: h }))} placeholder={t("finance.import_mapping_select_column")} />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("finance.import_mapping_debit")}</label>
                                                <Select allowClear className="w-full" value={importPreview.mapping.debitCol} onChange={(value) => updateMapping("debitCol", value ?? null)} options={importPreview.headers.map((h) => ({ value: h, label: h }))} placeholder={t("finance.import_mapping_select_column")} />
                                            </div>
                                        </div>
                                        <p className="col-span-1 sm:col-span-2 text-xs text-[var(--ohnix-text-dim)] m-0">{t("finance.import_mapping_help")}</p>
                                    </div>
                                ),
                            }]}
                        />
                    )}
                    <Table size="small" rowKey={(_, index) => index} pagination={{ pageSize: 8 }} dataSource={importPreview.entries} columns={[{ title: t("finance.col_date"), dataIndex: "entry_date", render: (v) => dayjs(v).format("DD/MM/YYYY") }, { title: t("finance.entry_description_label"), dataIndex: "description", ellipsis: true, render: (v) => v || t("common.na") }, { title: t("finance.col_amount"), dataIndex: "amount", align: "right", render: (v) => <span className={v > 0 ? "text-[var(--ohnix-status-success)]" : "text-[var(--ohnix-status-danger)]"}>{v > 0 ? "+" : ""}{formatCurrency(v)}</span> }]} />
                    {importPreview.rowErrors.length > 0 && (
                        <div className="mt-4">
                            <Alert className="dark-alert dark-alert-amber mb-2" type="warning" showIcon message={t("finance.import_skipped_title", { count: importPreview.rowErrors.length })} />
                            <Table size="small" rowKey={(row) => row.row} pagination={{ pageSize: 5 }} dataSource={importPreview.rowErrors} columns={[{ title: t("finance.import_skipped_row"), dataIndex: "row", width: 90 }, { title: t("finance.import_skipped_reason"), dataIndex: "reason" }]} />
                        </div>
                    )}
                </>}
            </Modal>
            <Modal title={t("finance.suggestions_title")} open={Array.isArray(suggestions)} onCancel={() => setSuggestions(null)} onOk={confirmSuggestions} confirmLoading={submitting} okButtonProps={{ disabled: selectedSuggestions.length === 0 }} okText={t("finance.suggestions_confirm")} width={820}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.suggestions_help_title")} description={t("finance.suggestions_help_desc")} />
                <Table className="module-dark-table" size="small" pagination={false} rowKey={(row) => row.entry._id} dataSource={suggestions || []} locale={{ emptyText: t("finance.suggestions_empty") }} columns={[{ title: "", width: 44, render: (_, row) => <Checkbox checked={selectedSuggestions.includes(row.entry._id)} onChange={(event) => setSelectedSuggestions((current) => event.target.checked ? [...current, row.entry._id] : current.filter((id) => id !== row.entry._id))} /> }, { title: t("finance.suggestions_statement"), render: (_, row) => <div><strong>{dayjs(row.entry.entry_date).format("DD/MM/YYYY")}</strong><small className="block text-[var(--ohnix-text-muted)]">{row.entry.description || t("common.na")}</small></div> }, { title: t("finance.suggestions_internal"), render: (_, row) => <div><strong>{dayjs(row.movement.createdAt).format("DD/MM/YYYY")}</strong><small className="block text-[var(--ohnix-text-muted)]">{row.movement.reason || t(SOURCE_LABEL_KEYS[row.movement.source_type] || row.movement.source_type)}</small></div> }, { title: t("finance.col_amount"), align: "right", render: (_, row) => formatCurrency(row.entry.amount) }, { title: t("finance.suggestions_confidence"), render: (_, row) => <Tag color={row.ambiguous ? "warning" : row.score >= 90 ? "success" : "processing"}>{row.ambiguous ? t("finance.suggestions_ambiguous") : `${row.score}%`}</Tag> }]} />
            </Modal>
            <Modal title={t("finance.bank_charge_title")} open={Boolean(chargeTarget)} onCancel={() => setChargeTarget(null)} onOk={() => chargeForm.submit()} confirmLoading={submitting} okText={t("finance.bank_charge_confirm")}>
                <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("finance.bank_charge_help_title")} description={chargeTarget?.entries?.length > 1 ? t("finance.bank_charge_help_desc_bulk", { count: chargeTarget.entries.length, amount: formatCurrency(chargeTotal) }) : t("finance.bank_charge_help_desc", { amount: formatCurrency(chargeTotal) })} />
                <Form form={chargeForm} layout="vertical" onFinish={confirmBankCharge}>
                    <Form.Item name="expense_account_id" label={t("finance.bank_charge_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={expenseAccounts.map((item) => ({ value: item._id, label: `${item.code} · ${item.name}` }))} placeholder={t("finance.bank_charge_account_placeholder")} /></Form.Item>
                    <Form.Item name="description" label={t("finance.entry_description_label")} rules={[{ required: chargeTarget?.entries?.length === 1, message: t("validation.required_field") }]} extra={chargeTarget?.entries?.length > 1 ? t("finance.bulk_description_hint") : undefined}><Input maxLength={200} /></Form.Item>
                    <Form.Item name="tax_treatment" label={t("accounting.tax_treatment")} rules={[{ required: true }]}>
                        <Select options={[
                            { value: "excluded", label: t("accounting.tax_treatment_excluded") },
                            { value: "exempt", label: t("accounting.tax_treatment_exempt") },
                            { value: "taxed", label: t("accounting.tax_treatment_taxed") },
                        ]} />
                    </Form.Item>
                    {chargeTreatment === "taxed" && (
                        <Form.Item name="tax_rate" label={t("accounting.tax_rate")} rules={[{ required: true, type: "number", min: 0.01, max: 100 }]}>
                            <InputNumber min={0} max={100} precision={2} className="w-full" />
                        </Form.Item>
                    )}
                    {chargePreview && (
                        <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.recurring_expense_tax_preview", { base: formatCurrency(chargePreview.base), tax: formatCurrency(chargePreview.tax) })} />
                    )}
                </Form>
            </Modal>
            <Modal title={t("finance.bank_income_title")} open={Boolean(incomeTarget)} onCancel={() => setIncomeTarget(null)} onOk={() => incomeForm.submit()} confirmLoading={submitting} okText={t("finance.bank_income_confirm")}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.bank_income_help_title")} description={incomeTarget?.entries?.length > 1 ? t("finance.bank_income_help_desc_bulk", { count: incomeTarget.entries.length, amount: formatCurrency(incomeTotal) }) : t("finance.bank_income_help_desc", { amount: formatCurrency(incomeTotal) })} />
                <Form form={incomeForm} layout="vertical" onFinish={confirmBankIncome}>
                    <Form.Item name="revenue_account_id" label={t("finance.bank_income_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={revenueAccounts.map((item) => ({ value: item._id, label: `${item.code} · ${item.name}` }))} placeholder={t("finance.bank_income_account_placeholder")} /></Form.Item>
                    <Form.Item name="description" label={t("finance.entry_description_label")} rules={[{ required: incomeTarget?.entries?.length === 1, message: t("validation.required_field") }]} extra={incomeTarget?.entries?.length > 1 ? t("finance.bulk_description_hint") : undefined}><Input maxLength={200} /></Form.Item>
                    <Form.Item name="tax_treatment" label={t("accounting.tax_treatment")} rules={[{ required: true }]}>
                        <Select options={[
                            { value: "excluded", label: t("accounting.tax_treatment_excluded") },
                            { value: "exempt", label: t("accounting.tax_treatment_exempt") },
                            { value: "taxed", label: t("accounting.tax_treatment_taxed") },
                        ]} />
                    </Form.Item>
                    {incomeTreatment === "taxed" && (
                        <Form.Item name="tax_rate" label={t("accounting.tax_rate")} rules={[{ required: true, type: "number", min: 0.01, max: 100 }]}>
                            <InputNumber min={0} max={100} precision={2} className="w-full" />
                        </Form.Item>
                    )}
                    {incomePreview && (
                        <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.recurring_expense_tax_preview", { base: formatCurrency(incomePreview.base), tax: formatCurrency(incomePreview.tax) })} />
                    )}
                </Form>
            </Modal>
            <Modal title={t("finance.reconciliation_report_title")} open={reportOpen} onCancel={() => setReportOpen(false)} footer={null} width={980}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.reconciliation_report_help_title")} description={t("finance.reconciliation_report_help_desc")} />
                <div className="flex flex-col lg:flex-row gap-3 justify-between mb-4">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <RangePicker value={reportRange} onChange={(value) => { setReportRange(value); if (value) loadReconciliationReport(value, reportStatus); }} allowClear={false} />
                        <Select value={reportStatus} onChange={(value) => { setReportStatus(value); loadReconciliationReport(reportRange, value); }} className="min-w-44" options={[{ value: "all", label: t("finance.reconciliation_status_all") }, { value: "matched", label: t("finance.reconciliation_status_matched") }, { value: "unmatched", label: t("finance.reconciliation_status_unmatched") }]} />
                    </div>
                    <ReportExportButtons hasData={reportRows.length > 0} onExportCsv={exportReportCsv} onExportExcel={exportReportExcel} onExportPdf={exportReportPdf} />
                </div>
                <Table loading={reportLoading} className="module-dark-table" size="small" rowKey="_id" dataSource={reportRows} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} locale={{ emptyText: t("finance.reconciliation_report_empty") }} columns={[{ title: t("finance.col_date"), dataIndex: "entry_date", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") }, { title: t("finance.entry_description_label"), dataIndex: "description", ellipsis: true, render: (value) => value || t("common.na") }, { title: t("finance.col_amount"), dataIndex: "amount", align: "right", render: (value) => formatCurrency(value) }, { title: t("finance.reconciliation_report_status"), dataIndex: "status", render: (value) => <Tag color={value === "matched" ? "success" : "warning"}>{t(`finance.reconciliation_status_${value}`)}</Tag> }, { title: t("finance.col_source"), render: (_, row) => row.movement ? t(SOURCE_LABEL_KEYS[row.movement.source_type] || row.movement.source_type) : t("common.na") }, { title: t("finance.reconciliation_report_reconciled_at"), render: (_, row) => row.movement?.reconciled_at ? dayjs(row.movement.reconciled_at).format("DD/MM/YYYY HH:mm") : t("common.na") }, { title: "", key: "actions", width: 120, render: (_, row) => row.status === "matched" ? <Popconfirm title={t("finance.unmatch_confirm_title")} description={t("finance.unmatch_confirm_desc")} okText={t("finance.unmatch_cta")} cancelText={t("common.cancel")} onConfirm={() => handleUnmatch(row)}><Button size="small" icon={<UndoOutlined />} disabled={submitting}>{t("finance.unmatch_cta")}</Button></Popconfirm> : null }]} />
            </Modal>
        </div>
    );
};

export default BankReconciliationPanel;
