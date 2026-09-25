import { useEffect, useState } from "react";
import { Tabs, Table, Card, DatePicker, Select, Button, Popconfirm, Tag, Row, Col, Alert, Tooltip, Drawer, Empty, Collapse, Form, Switch, Input, InputNumber, Modal, Progress, Upload } from "antd";
import { BookOutlined, CalendarOutlined, InfoCircleOutlined, WarningOutlined, EyeOutlined, ArrowRightOutlined, ClockCircleOutlined, DownOutlined, PlusOutlined, StopOutlined, CheckCircleOutlined, DashboardOutlined, ApartmentOutlined, UnorderedListOutlined, FileTextOutlined, TeamOutlined, CalculatorOutlined, LockOutlined, BarChartOutlined, SafetyCertificateOutlined, QuestionCircleOutlined, PartitionOutlined, UploadOutlined, DownloadOutlined, ToolOutlined, RetweetOutlined } from "@ant-design/icons";
import { Link, useLocation } from "react-router-dom";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import PlanGate from "../components/common/PlanGate";
import EmptyState from "../components/common/EmptyState";
import SectionGuide from "../components/common/SectionGuide";
import VatSettlementCard from "../components/accounting/VatSettlementCard";
import PrepaidExpensesTab from "../components/accounting/PrepaidExpensesTab";
import useIsMobile from "../hooks/useIsMobile";
import { accountingService } from "../services/accountingService";
import { financeService } from "../services/financeService";
import { pointOfSaleService } from "../services/pointOfSaleService";
import { companyService } from "../services/companyService";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";
import { resolveApiErrorMessage } from "../utils/apiError";

// Codes from chartOfAccounts.service.js's default PUC seed - matched by code
// (not name) so a renamed-but-not-recoded account still nets correctly.
const VAT_GENERATED_CODE = "240805";
const VAT_DEDUCTIBLE_CODE = "240810";

const ACCOUNTING_ERROR_CODES = {
    accounting_budget_invalid_period: "accounting.budget_error_invalid_period",
    accounting_budget_period_closed: "accounting.budget_error_period_closed",
    accounting_budget_invalid_items: "accounting.budget_error_invalid_items",
    accounting_budget_invalid_line: "accounting.budget_error_invalid_line",
    accounting_budget_invalid_threshold: "accounting.budget_error_invalid_threshold",
    accounting_budget_duplicate_lines: "accounting.budget_error_duplicate_lines",
    accounting_budget_invalid_account: "accounting.budget_error_invalid_account",
    accounting_budget_invalid_cost_center: "accounting.budget_error_invalid_cost_center",
    accounting_budget_not_found: "accounting.budget_error_not_found",
    accounting_budget_invalid_year: "accounting.budget_error_invalid_year",
    accounting_budget_invalid_annual_amount: "accounting.budget_error_invalid_annual_amount",
    accounting_budget_same_copy_year: "accounting.budget_error_same_copy_year",
    accounting_budget_copy_source_empty: "accounting.budget_error_copy_source_empty",
    chart_account_code_required: "accounting.error_chart_account_code_required",
    chart_account_name_required: "accounting.error_chart_account_name_required",
    chart_account_type_invalid: "accounting.error_chart_account_type_invalid",
    chart_account_code_duplicate: "accounting.error_chart_account_code_duplicate",
    chart_account_parent_not_found: "accounting.error_chart_account_parent_not_found",
    chart_account_not_found: "accounting.error_chart_account_not_found",
    chart_account_active_invalid: "accounting.error_chart_account_active_invalid",
    journal_entry_unbalanced: "accounting.error_journal_entry_unbalanced",
    journal_entry_not_found: "accounting.error_journal_entry_not_found",
    journal_reversal_reason_required: "accounting.error_journal_reversal_reason_required",
    journal_reversal_date_invalid: "accounting.error_journal_reversal_date_invalid",
    journal_reversal_not_allowed: "accounting.error_journal_reversal_not_allowed",
    accounting_period_closed: "accounting.error_period_closed",
    accounting_period_reopening_expired: "accounting.error_period_reopening_expired",
    accounting_period_not_found: "accounting.error_period_not_found",
    accounting_period_already_closed: "accounting.error_period_already_closed",
    accounting_period_not_prior_month: "accounting.error_period_not_prior_month",
    accounting_period_integrity_blocked: "accounting.error_period_integrity_blocked",
    accounting_period_concurrent_change: "accounting.error_period_concurrent_change",
    accounting_period_reopen_reason_required: "accounting.error_period_reopen_reason_required",
    accounting_period_reopen_duration_invalid: "accounting.error_period_reopen_duration_invalid",
    accounting_period_not_closed: "accounting.error_period_not_closed",
    accounting_period_id_required: "accounting.error_period_id_required",
    cost_center_fields_required: "accounting.error_cost_center_fields_required",
    cost_center_length_invalid: "accounting.error_cost_center_length_invalid",
    cost_center_code_duplicate: "accounting.error_cost_center_code_duplicate",
    cost_center_not_found: "accounting.error_cost_center_not_found",
    cost_center_location_not_found: "accounting.error_cost_center_location_not_found",
    cost_center_assignment_invalid: "accounting.error_cost_center_assignment_invalid",
    recurring_expense_description_required: "accounting.error_recurring_description_required",
    recurring_expense_description_too_long: "accounting.error_recurring_description_too_long",
    recurring_expense_amount_invalid: "accounting.error_recurring_amount_invalid",
    recurring_expense_day_invalid: "accounting.error_recurring_day_invalid",
    recurring_expense_tax_treatment_invalid: "accounting.error_recurring_tax_treatment_invalid",
    recurring_expense_tax_rate_invalid: "accounting.error_recurring_tax_rate_invalid",
    recurring_expense_expense_account_unavailable: "accounting.error_recurring_expense_account_unavailable",
    recurring_expense_cash_account_unavailable: "accounting.error_recurring_cash_account_unavailable",
    recurring_expense_not_found: "accounting.error_recurring_not_found",
    recurring_expense_insufficient_funds: "accounting.error_recurring_insufficient_funds",
    recurring_expense_inactive: "accounting.error_recurring_inactive",
    recurring_expense_already_generated: "accounting.error_recurring_already_generated",
    recurring_expense_generation_failed: "accounting.error_recurring_generation_failed",
    withholding_date_invalid: "accounting.error_withholding_date_invalid",
    withholding_concepts_unavailable: "accounting.error_withholding_concepts_unavailable",
    withholding_concept_versions_duplicate: "accounting.error_withholding_versions_duplicate",
    withholding_fields_required: "accounting.error_withholding_fields_required",
    withholding_tax_type_invalid: "accounting.error_withholding_tax_type_invalid",
    withholding_base_type_invalid: "accounting.error_withholding_base_type_invalid",
    withholding_rate_invalid: "accounting.error_withholding_rate_invalid",
    withholding_minimum_base_invalid: "accounting.error_withholding_minimum_base_invalid",
    withholding_date_range_invalid: "accounting.error_withholding_date_range_invalid",
    withholding_municipality_required: "accounting.error_withholding_municipality_required",
    withholding_chart_account_invalid: "accounting.error_withholding_chart_account_invalid",
    withholding_effective_range_overlap: "accounting.error_withholding_effective_range_overlap",
    withholding_concept_not_found: "accounting.error_withholding_concept_not_found",
    withholding_preview_amounts_invalid: "accounting.error_withholding_preview_amounts_invalid",
    withholding_concept_required: "accounting.error_withholding_concept_required",
    withholding_certificate_year_invalid: "accounting.error_withholding_certificate_year_invalid",
    withholding_supplier_not_found: "accounting.error_withholding_supplier_not_found",
    third_party_identity_required: "accounting.error_third_party_identity_required",
    manual_voucher_support_url_invalid: "accounting.error_manual_voucher_support_url_invalid",
    manual_voucher_date_invalid: "accounting.error_manual_voucher_date_invalid",
    manual_voucher_description_required: "accounting.error_manual_voucher_description_required",
    manual_voucher_lines_required: "accounting.error_manual_voucher_lines_required",
    manual_voucher_line_invalid: "accounting.error_manual_voucher_line_invalid",
    manual_voucher_line_side_invalid: "accounting.error_manual_voucher_line_side_invalid",
    manual_voucher_third_party_type_invalid: "accounting.error_manual_voucher_third_party_type_invalid",
    manual_voucher_third_party_name_required: "accounting.error_manual_voucher_third_party_name_required",
    manual_voucher_accounts_invalid: "accounting.error_manual_voucher_accounts_invalid",
    manual_voucher_cost_centers_invalid: "accounting.error_manual_voucher_cost_centers_invalid",
    manual_voucher_third_party_required: "accounting.error_manual_voucher_third_party_required",
    manual_voucher_unbalanced: "accounting.error_manual_voucher_unbalanced",
    manual_voucher_not_found: "accounting.error_manual_voucher_not_found",
    manual_voucher_not_draft: "accounting.error_manual_voucher_not_draft",
    manual_voucher_already_processed: "accounting.error_manual_voucher_already_processed",
    manual_voucher_not_posted: "accounting.error_manual_voucher_not_posted",
    manual_voucher_self_post_not_allowed: "accounting.error_manual_voucher_self_post_not_allowed",
    manual_voucher_void_reason_required: "accounting.error_manual_voucher_void_reason_required",
    manual_voucher_void_date_invalid: "accounting.error_manual_voucher_void_date_invalid",
    opening_balance_date_invalid: "accounting.error_opening_balance_date_invalid",
    opening_balance_lines_required: "accounting.error_opening_balance_lines_required",
    opening_balance_line_invalid: "accounting.error_opening_balance_line_invalid",
    opening_balance_unbalanced: "accounting.error_opening_balance_unbalanced",
    opening_balance_already_exists: "accounting.error_opening_balance_already_exists",
    opening_balance_accounts_invalid: "accounting.error_opening_balance_accounts_invalid",
    opening_balance_cost_centers_invalid: "accounting.error_opening_balance_cost_centers_invalid",
    opening_balance_third_party_type_invalid: "accounting.error_opening_balance_third_party_type_invalid",
    opening_balance_third_party_name_required: "accounting.error_opening_balance_third_party_name_required",
    fiscal_year_invalid: "accounting.error_fiscal_year_invalid",
    fiscal_year_not_elapsed: "accounting.error_fiscal_year_not_elapsed",
    fiscal_year_months_not_closed: "accounting.error_fiscal_year_months_not_closed",
    fiscal_year_already_closed: "accounting.error_fiscal_year_already_closed",
    fiscal_year_concurrent_change: "accounting.error_fiscal_year_concurrent_change",
    fiscal_year_not_found: "accounting.error_fiscal_year_not_found",
    fiscal_year_not_closed: "accounting.error_fiscal_year_not_closed",
    fiscal_year_reopen_reason_required: "accounting.error_fiscal_year_reopen_reason_required",
    fiscal_year_reopen_duration_invalid: "accounting.error_fiscal_year_reopen_duration_invalid",
    financial_statement_note_invalid_year: "accounting.error_note_invalid_year",
    financial_statement_note_title_required: "accounting.error_note_title_required",
    financial_statement_note_title_too_long: "accounting.error_note_title_too_long",
    financial_statement_note_content_required: "accounting.error_note_content_required",
    financial_statement_note_content_too_long: "accounting.error_note_content_too_long",
    financial_statement_note_not_found: "accounting.error_note_not_found",
    fixed_asset_name_required: "accounting.error_fixed_asset_name_required",
    fixed_asset_name_too_long: "accounting.error_fixed_asset_name_too_long",
    fixed_asset_acquisition_date_invalid: "accounting.error_fixed_asset_acquisition_date_invalid",
    fixed_asset_acquisition_cost_invalid: "accounting.error_fixed_asset_acquisition_cost_invalid",
    fixed_asset_salvage_value_invalid: "accounting.error_fixed_asset_salvage_value_invalid",
    fixed_asset_useful_life_invalid: "accounting.error_fixed_asset_useful_life_invalid",
    fixed_asset_asset_account_unavailable: "accounting.error_fixed_asset_asset_account_unavailable",
    fixed_asset_depreciation_account_unavailable: "accounting.error_fixed_asset_depreciation_account_unavailable",
    fixed_asset_accounts_must_differ: "accounting.error_fixed_asset_accounts_must_differ",
    fixed_asset_expense_account_unavailable: "accounting.error_fixed_asset_expense_account_unavailable",
    fixed_asset_cost_center_invalid: "accounting.error_fixed_asset_cost_center_invalid",
    fixed_asset_not_found: "accounting.error_fixed_asset_not_found",
    fixed_asset_not_active: "accounting.error_fixed_asset_not_active",
    fixed_asset_schedule_locked: "accounting.error_fixed_asset_schedule_locked",
    fixed_asset_disposal_reason_required: "accounting.error_fixed_asset_disposal_reason_required",
    fixed_asset_not_depreciable: "accounting.error_fixed_asset_not_depreciable",
    fixed_asset_fully_depreciated: "accounting.error_fixed_asset_fully_depreciated",
    fixed_asset_already_depreciated: "accounting.error_fixed_asset_already_depreciated",
    fixed_asset_depreciation_failed: "accounting.fixed_asset_run_failed",
    fixed_asset_disposal_amount_invalid: "accounting.error_fixed_asset_disposal_amount_invalid",
    fixed_asset_disposal_cash_account_required: "accounting.error_fixed_asset_disposal_cash_account_required",
    fixed_asset_disposal_cash_account_unavailable: "accounting.error_fixed_asset_disposal_cash_account_unavailable",
    recurring_journal_lines_required: "accounting.error_recurring_journal_lines_required",
    recurring_journal_line_invalid: "accounting.error_recurring_journal_line_invalid",
    recurring_journal_line_side_invalid: "accounting.error_recurring_journal_line_side_invalid",
    recurring_journal_third_party_type_invalid: "accounting.error_recurring_journal_third_party_type_invalid",
    recurring_journal_third_party_name_required: "accounting.error_recurring_journal_third_party_name_required",
    recurring_journal_accounts_invalid: "accounting.error_recurring_journal_accounts_invalid",
    recurring_journal_cost_centers_invalid: "accounting.error_recurring_journal_cost_centers_invalid",
    recurring_journal_unbalanced: "accounting.error_recurring_journal_unbalanced",
    recurring_journal_description_required: "accounting.error_recurring_journal_description_required",
    recurring_journal_description_too_long: "accounting.error_recurring_journal_description_too_long",
    recurring_journal_day_invalid: "accounting.error_recurring_journal_day_invalid",
    recurring_journal_not_found: "accounting.error_recurring_journal_not_found",
    recurring_journal_inactive: "accounting.error_recurring_journal_inactive",
    recurring_journal_already_generated: "accounting.error_recurring_journal_already_generated",
    recurring_journal_generation_failed: "accounting.recurring_journal_run_failed",
    exogena_invalid_year: "accounting.error_exogena_invalid_year",
};

const accountingErrorMessage = (error, t, fallbackKey = "accounting.failed") =>
    resolveApiErrorMessage(error, t, ACCOUNTING_ERROR_CODES, fallbackKey);

// Built entirely from data already on screen (no extra request), so unlike
// Reports' export buttons this doesn't call exportReport.js's authorize
// endpoint - that one is gated behind requireModulePermission("reports"),
// which a user with only accounting access wouldn't have.
const exportAccountingExcel = (filename, sheets) => {
    const workbook = XLSX.utils.book_new();
    sheets.forEach(({ name, rows }) => {
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
    });
    XLSX.writeFile(workbook, filename);
};

const { RangePicker } = DatePicker;

const AccountingSectionGuide = ({ sectionKey, ...props }) => (
    <SectionGuide storageKey={`ohnix:accounting-guide:${sectionKey}`} {...props} />
);

const ContextLabel = ({ children, help }) => (
    <span className="inline-flex items-center gap-1.5">
        {children}
        <Tooltip title={help}><QuestionCircleOutlined className="text-[var(--ohnix-text-dim)] cursor-help" /></Tooltip>
    </span>
);

const AccountingQuickStart = ({ onOpenTab }) => {
    const { t } = useI18n();
    return (
        <Card className="accounting-quick-start">
            <div className="accounting-quick-start__heading">
                <div><span>{t("accounting.quick_start_eyebrow")}</span><h3>{t("accounting.onboarding_new_title")}</h3><p>{t("accounting.onboarding_new_body")}</p></div>
                <Tag color="cyan">{t("accounting.quick_start_time")}</Tag>
            </div>
            <div className="accounting-quick-start__steps">
                <button type="button" onClick={() => onOpenTab("chart")}><b>1</b><span><strong>{t("accounting.quick_start_chart")}</strong><small>{t("accounting.quick_start_chart_help")}</small></span><ArrowRightOutlined /></button>
                <Link to="/purchases"><b>2</b><span><strong>{t("accounting.quick_start_operation")}</strong><small>{t("accounting.quick_start_operation_help")}</small></span><ArrowRightOutlined /></Link>
                <button type="button" onClick={() => onOpenTab("journal")}><b>3</b><span><strong>{t("accounting.quick_start_journal")}</strong><small>{t("accounting.quick_start_journal_help")}</small></span><ArrowRightOutlined /></button>
            </div>
        </Card>
    );
};

const ACCOUNT_TYPE_LABEL_KEYS = {
    asset: "accounting.account_type_asset",
    liability: "accounting.account_type_liability",
    equity: "accounting.account_type_equity",
    revenue: "accounting.account_type_revenue",
    expense: "accounting.account_type_expense",
    cost: "accounting.account_type_cost",
};

// "Costo" vs "Gasto" is the classic non-accountant confusion (COGS vs
// operating expense) - only these two get a tooltip, the rest (activo,
// pasivo, patrimonio, ingreso) are self-explanatory enough on their own.
const ACCOUNT_TYPE_HINT_KEYS = {
    expense: "accounting.account_type_expense_hint",
    cost: "accounting.account_type_cost_hint",
};

const SOURCE_TYPE_LABEL_KEYS = {
    order_sale: "accounting.source_order_sale",
    purchase: "accounting.source_purchase",
    order_payment: "accounting.source_order_payment",
    purchase_payment: "accounting.source_purchase_payment",
    order_cancellation: "accounting.source_order_cancellation",
    order_return: "accounting.source_order_return",
    purchase_return: "accounting.source_purchase_return",
    credit_note_restock: "accounting.source_credit_note_restock",
    credit_note_financial: "accounting.source_credit_note_financial",
    period_close: "accounting.source_period_close",
    period_reopen: "accounting.source_period_reopen",
    period_reclose: "accounting.source_period_reclose",
    year_close: "accounting.source_year_close",
    year_reopen: "accounting.source_year_reopen",
    year_reclose: "accounting.source_year_reclose",
    inventory_adjustment: "accounting.source_inventory_adjustment",
    transfer_discrepancy: "accounting.source_transfer_discrepancy",
    manual_journal: "accounting.source_manual_journal",
    manual_journal_reversal: "accounting.source_manual_journal_reversal",
    manual_expense: "accounting.source_manual_expense",
    manual_income: "accounting.source_manual_income",
    recurring_expense: "accounting.source_recurring_expense",
    cash_transfer: "accounting.source_cash_transfer",
    cash_adjustment: "accounting.source_cash_adjustment",
    opening_balance: "accounting.source_opening_balance",
    fixed_asset_depreciation: "accounting.source_fixed_asset_depreciation",
    fixed_asset_disposal: "accounting.source_fixed_asset_disposal",
    recurring_journal: "accounting.source_recurring_journal",
    capital_contribution: "accounting.source_capital_contribution",
    equity_distribution: "accounting.source_equity_distribution",
    vat_settlement: "accounting.source_vat_settlement",
    vat_settlement_void: "accounting.source_vat_settlement_void",
    vat_payment: "accounting.source_vat_payment",
    prepaid_expense: "accounting.source_prepaid_expense",
    prepaid_amortization: "accounting.source_prepaid_amortization",
    prepaid_cancellation: "accounting.source_prepaid_cancellation",
};

// Automatic descriptions are persisted for auditability. Translate only
// formats generated by Ohnix; free-form descriptions always remain verbatim.
const localizedEntryDescription = (entry, t) => {
    const description = String(entry?.description || "");
    const patterns = {
        order_sale: /^(?:Venta|Sale)\s+(.+)$/i,
        purchase: /^(?:Compra|Purchase)\s+(.+)$/i,
        order_payment: /^(?:Pago de pedido|Order payment)\s+(.+)$/i,
        purchase_payment: /^(?:Pago de compra|Purchase payment)\s+(.+)$/i,
        period_close: /^(?:Cierre del periodo|Period close)\s+(.+)$/i,
        period_reclose: /^(?:Cierre del periodo|Period close)\s+(.+)$/i,
    };
    const match = patterns[entry?.source_type]?.exec(description);
    if (match) return t(`accounting.auto_description_${entry.source_type}`, { reference: match[1] });

    if (["order_cancellation", "order_return", "purchase_return", "credit_note_restock", "credit_note_financial"].includes(entry?.source_type)) {
        return t(SOURCE_TYPE_LABEL_KEYS[entry.source_type]);
    }
    if (entry?.source_type === "manual_income" && /^(Ingreso manual|Manual income)$/i.test(description)) {
        return t("accounting.source_manual_income");
    }
    if (entry?.source_type === "manual_expense" && /^(Gasto manual|Manual expense)$/i.test(description)) {
        return t("accounting.source_manual_expense");
    }

    const inventoryMatch = /^(?:Ajuste de inventario|Inventory adjustment):\s*(.+)$/i.exec(description);
    if (entry?.source_type === "inventory_adjustment" && inventoryMatch) {
        return t("accounting.auto_description_inventory_adjustment", { reason: inventoryMatch[1] });
    }
    const discrepancyMatch = /^(?:Faltante en traslado|Transfer discrepancy)\s+(.+)$/i.exec(description);
    if (entry?.source_type === "transfer_discrepancy" && discrepancyMatch) {
        return t("accounting.auto_description_transfer_discrepancy", { reference: discrepancyMatch[1] });
    }
    const transferMatch = /^(?:Transferencia de|Transfer from)\s+(.+)\s+(?:a|to)\s+(.+)$/i.exec(description);
    if (entry?.source_type === "cash_transfer" && transferMatch) {
        return t("accounting.auto_description_cash_transfer", { from: transferMatch[1], to: transferMatch[2] });
    }
    const reopenMatch = /^(?:Reapertura del periodo|Period reopening)\s+([^:]+):\s*(.+)$/i.exec(description);
    if (entry?.source_type === "period_reopen" && reopenMatch) {
        return t("accounting.auto_description_period_reopen", { reference: reopenMatch[1], reason: reopenMatch[2] });
    }
    return description;
};

// Libro mayor for one account: opening balance + every movement in range
// with a running balance, opened from the Chart of Accounts row so a total
// on the balance sheet can always be traced back to what produced it.
const AccountLedgerDrawer = ({ account, onClose }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [ledger, setLedger] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchLedger = async () => {
        if (!account) return;
        setLoading(true);
        try {
            const res = await accountingService.getAccountLedger(account._id, {
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
            });
            setLedger(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLedger();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account]);

    const columns = [
        { title: t("accounting.col_date"), dataIndex: "date", key: "date", render: (v) => dayjs(v).format("DD/MM/YYYY"), width: 110 },
        { title: t("accounting.col_description"), dataIndex: "description", key: "description", ellipsis: true, render: (_, row) => localizedEntryDescription(row, t) },
        {
            title: t("accounting.col_source_type"),
            dataIndex: "source_type",
            key: "source_type",
            render: (v) => <Tag>{t(SOURCE_TYPE_LABEL_KEYS[v] || v)}</Tag>,
        },
        { title: <ContextLabel help={t("accounting.guide_debit_help")}>{t("accounting.lines_col_debit")}</ContextLabel>, dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: <ContextLabel help={t("accounting.guide_credit_help")}>{t("accounting.lines_col_credit")}</ContextLabel>, dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: t("accounting.ledger_col_running_balance"), dataIndex: "running_balance", key: "running_balance", align: "right", render: (v) => formatCurrency(v) },
    ];

    const exportLedger = () => {
        const header = [t("accounting.col_date"), t("accounting.col_description"), t("accounting.col_source_type"), t("accounting.lines_col_debit"), t("accounting.lines_col_credit"), t("accounting.ledger_col_running_balance")];
        const rows = (ledger?.movements || []).map((m) => [
            dayjs(m.date).format("DD/MM/YYYY"),
            localizedEntryDescription(m, t),
            t(SOURCE_TYPE_LABEL_KEYS[m.source_type] || m.source_type),
            m.debit || 0,
            m.credit || 0,
            m.running_balance,
        ]);
        exportAccountingExcel(`libro-mayor-${account.code}-${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}.xlsx`, [{ name: account.code, rows: [header, ...rows] }]);
    };

    return (
        <Drawer
            rootClassName="accounting-drawer"
            open={Boolean(account)}
            onClose={onClose}
            width={isMobile ? "100vw" : 720}
            title={account ? `${account.code} · ${account.name}` : ""}
            styles={{ body: { padding: isMobile ? 16 : 24 } }}
        >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <RangePicker
                    value={dateRange}
                    onChange={(dates) => dates && setDateRange(dates)}
                    format="YYYY-MM-DD"
                    allowClear={false}
                    className="w-full sm:w-auto"
                />
                <Button icon={<CalendarOutlined />} onClick={fetchLedger} loading={loading} block={isMobile}>
                    {t("reports.refresh_report")}
                </Button>
                <Button icon={<DownloadOutlined />} disabled={!ledger?.movements?.length} onClick={exportLedger} block={isMobile}>
                    {t("reports.export_to_excel")}
                </Button>
            </div>
            {ledger && (
                <Row gutter={[16, 16]} className="mb-4">
                    <Col xs={12}>
                        <StatCard title={t("accounting.ledger_opening_balance")} value={ledger.opening_balance} formatter={formatCurrency} />
                    </Col>
                    <Col xs={12}>
                        <StatCard title={t("accounting.ledger_closing_balance")} value={ledger.closing_balance} formatter={formatCurrency} valueStyle={{ fontWeight: 700 }} />
                    </Col>
                </Row>
            )}
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : !ledger?.movements?.length ? (
                    <EmptyState title={t("accounting.ledger_empty")} compact />
                ) : (
                    <div className="space-y-2">
                        {ledger.movements.map((m) => (
                            <div key={m.entry_id} className="rounded-xl p-3 border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-xs text-[var(--ohnix-text-muted)]">{dayjs(m.date).format("DD/MM/YYYY")}</span>
                                    <Tag className="m-0">{t(SOURCE_TYPE_LABEL_KEYS[m.source_type] || m.source_type)}</Tag>
                                </div>
                                <p className="text-sm text-[var(--ohnix-text-primary)] m-0 mb-2 truncate">{localizedEntryDescription(m, t)}</p>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[var(--ohnix-text-muted)]">
                                        {m.debit > 0 && `${t("accounting.lines_col_debit")}: ${formatCurrency(m.debit)}`}
                                        {m.credit > 0 && `${t("accounting.lines_col_credit")}: ${formatCurrency(m.credit)}`}
                                    </span>
                                    <span className="font-semibold text-[var(--ohnix-accent-2)]">{formatCurrency(m.running_balance)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <Table
                    columns={columns}
                    dataSource={ledger?.movements || []}
                    rowKey="entry_id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    className="module-dark-table"
                    size="small"
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: <EmptyState compact title={t("accounting.ledger_empty")} /> }}
                />
            )}
        </Drawer>
    );
};

// Custom accounts are additive to the 9-account default seed - e.g. a
// company's own class-5 expense accounts (never auto-posted to, see
// accountingPosting.service.js's scope note) or a finer split of an
// existing class. parentId is optional: the schema has always supported a
// hierarchy (ChartAccount.parentId), this is just the first UI to use it.
const NewAccountModal = ({ open, accounts, onClose, onCreated }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (values) => {
        setSaving(true);
        try {
            await accountingService.createChartOfAccount(values);
            toast.success(t("accounting.new_account_created"));
            form.resetFields();
            onCreated();
        } catch (err) {
            toast.error(accountingErrorMessage(err, t));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            className="accounting-modal"
            open={open}
            onCancel={onClose}
            title={t("accounting.new_account_title")}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            onOk={() => form.submit()}
            confirmLoading={saving}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.new_account_guidance")} />
                <Form.Item name="code" label={t("accounting.col_code")} extra={t("accounting.new_account_code_hint")} rules={[{ required: true, message: t("accounting.new_account_code_required") }]}>
                    <Input placeholder="5105" />
                </Form.Item>
                <Form.Item name="name" label={t("accounting.col_name")} rules={[{ required: true, message: t("accounting.new_account_name_required") }]}>
                    <Input placeholder="Arrendamientos" />
                </Form.Item>
                <Form.Item name="accountType" label={t("accounting.col_type")} extra={t("accounting.new_account_type_hint")} rules={[{ required: true, message: t("accounting.new_account_type_required") }]}>
                    <Select options={Object.entries(ACCOUNT_TYPE_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) }))} />
                </Form.Item>
                <Form.Item name="parentId" label={t("accounting.new_account_parent_label")} extra={t("accounting.new_account_parent_hint")}>
                    <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={accounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

const ChartOfAccountsTab = () => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ledgerAccount, setLedgerAccount] = useState(null);
    const [newAccountOpen, setNewAccountOpen] = useState(false);

    const load = () => {
        setLoading(true);
        accountingService
            .listChartOfAccounts()
            .then((res) => setAccounts(res?.data || []))
            .catch(() => toast.error(t("accounting.failed")))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleActive = async (account) => {
        try {
            await accountingService.setChartOfAccountActive(account._id, !account.is_active);
            toast.success(account.is_active ? t("accounting.account_deactivated") : t("accounting.account_activated"));
            load();
        } catch (err) {
            toast.error(accountingErrorMessage(err, t));
        }
    };

    const columns = [
        { title: t("accounting.col_code"), dataIndex: "code", key: "code", width: 100 },
        { title: t("accounting.col_name"), dataIndex: "name", key: "name" },
        {
            title: t("accounting.col_type"),
            dataIndex: "account_type",
            key: "account_type",
            render: (v) => {
                const label = t(ACCOUNT_TYPE_LABEL_KEYS[v] || v);
                const hintKey = ACCOUNT_TYPE_HINT_KEYS[v];
                return hintKey ? <Tooltip title={t(hintKey)}>{label}</Tooltip> : label;
            },
        },
        {
            title: t("accounting.col_status"),
            dataIndex: "is_active",
            key: "is_active",
            render: (v) =>
                v ? <Tag color="green">{t("accounting.status_active")}</Tag> : <Tag color="default">{t("accounting.status_inactive")}</Tag>,
        },
        {
            title: "",
            key: "actions",
            width: 260,
            render: (_, record) => (
                <div className="flex gap-2">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => setLedgerAccount(record)}>
                        {t("accounting.ledger_view_button")}
                    </Button>
                    <Popconfirm
                        title={record.is_active ? t("accounting.deactivate_account_confirm") : t("accounting.activate_account_confirm")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={() => toggleActive(record)}
                    >
                        <Button size="small" icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}>
                            {record.is_active ? t("accounting.deactivate_account") : t("accounting.activate_account")}
                        </Button>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="chart" title={t("accounting.guide_chart_title")} summary={t("accounting.tab_chart_of_accounts_caption")} steps={[t("accounting.guide_chart_step_1"), t("accounting.guide_chart_step_2"), t("accounting.guide_chart_step_3")]} result={t("accounting.guide_chart_result")} concepts={[{ label: t("accounting.col_type"), help: t("accounting.guide_chart_type_help") }, { label: t("accounting.ledger_view_button"), help: t("accounting.guide_ledger_help") }]} />
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <span />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)} className="shrink-0">
                    {t("accounting.new_account_button")}
                </Button>
            </div>
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : accounts.length === 0 ? (
                    <EmptyState title={t("accounting.no_chart_accounts")} subtitle={t("accounting.empty_chart_help")} action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)}>{t("accounting.new_account_button")}</Button>} />
                ) : (
                    <div className="space-y-2">
                        {accounts.map((acc) => {
                            const hintKey = ACCOUNT_TYPE_HINT_KEYS[acc.account_type];
                            return (
                                <Card key={acc._id} size="small" className="module-shell overflow-hidden" bodyStyle={{ padding: 12 }}>
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0 truncate">
                                                {acc.code} · {acc.name}
                                            </p>
                                            <Tooltip title={hintKey ? t(hintKey) : null}>
                                                <span className="text-xs text-[var(--ohnix-text-muted)]">
                                                    {t(ACCOUNT_TYPE_LABEL_KEYS[acc.account_type] || acc.account_type)}
                                                </span>
                                            </Tooltip>
                                        </div>
                                        {acc.is_active ? (
                                            <Tag color="green" className="m-0 shrink-0">{t("accounting.status_active")}</Tag>
                                        ) : (
                                            <Tag className="m-0 shrink-0">{t("accounting.status_inactive")}</Tag>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button block size="small" icon={<EyeOutlined />} onClick={() => setLedgerAccount(acc)}>
                                            {t("accounting.ledger_view_button")}
                                        </Button>
                                        <Popconfirm
                                            title={acc.is_active ? t("accounting.deactivate_account_confirm") : t("accounting.activate_account_confirm")}
                                            okText={t("common.yes")}
                                            cancelText={t("common.no")}
                                            onConfirm={() => toggleActive(acc)}
                                        >
                                            <Button block size="small" icon={acc.is_active ? <StopOutlined /> : <CheckCircleOutlined />} />
                                        </Popconfirm>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )
            ) : (
                <Card className="module-shell border border-[var(--ohnix-line-4)]">
                    <Table
                        columns={columns}
                        dataSource={accounts}
                        rowKey="_id"
                        loading={loading}
                        pagination={false}
                        className="module-dark-table"
                        scroll={{ x: "max-content" }}
                        locale={{ emptyText: <EmptyState compact title={t("accounting.no_chart_accounts")} subtitle={t("accounting.empty_chart_help")} action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)}>{t("accounting.new_account_button")}</Button>} /> }}
                    />
                </Card>
            )}
            <AccountLedgerDrawer account={ledgerAccount} onClose={() => setLedgerAccount(null)} />
            <NewAccountModal
                open={newAccountOpen}
                accounts={accounts}
                onClose={() => setNewAccountOpen(false)}
                onCreated={() => {
                    setNewAccountOpen(false);
                    load();
                }}
            />
        </>
    );
};

const ThirdPartyLedgerTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [dateRange, setDateRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [type, setType] = useState(undefined);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const params = () => ({ from: dateRange[0].format("YYYY-MM-DD"), to: dateRange[1].format("YYYY-MM-DD") });
    const load = async () => {
        setLoading(true);
        try {
            const response = await accountingService.listThirdPartyBalances({ ...params(), type });
            setRows(response?.data || []);
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openDetail = async (party) => {
        setDetailLoading(true);
        setDetail({ thirdParty: party, movements: [] });
        try {
            const response = await accountingService.getThirdPartyMovements(party.type, party.id, params());
            setDetail(response?.data || null);
        } catch { toast.error(t("accounting.failed")); }
        finally { setDetailLoading(false); }
    };

    return (
        <>
            <AccountingSectionGuide sectionKey="third-parties" title={t("accounting.guide_third_parties_title")} summary={t("accounting.tab_third_parties_caption")} steps={[t("accounting.guide_third_step_1"), t("accounting.guide_third_step_2")]} result={t("accounting.guide_third_result")} concepts={[{ label: t("accounting.ledger_opening_balance"), help: t("accounting.guide_opening_help") }, { label: t("accounting.ledger_closing_balance"), help: t("accounting.guide_closing_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} allowClear={false} />
                    <Select allowClear value={type} onChange={setType} placeholder={t("accounting.third_party_all_types")} options={[
                        { value: "customer", label: t("accounting.third_party_customer") },
                        { value: "supplier", label: t("accounting.third_party_supplier") },
                        { value: "other", label: t("accounting.third_party_other") },
                    ]} className="w-full sm:w-48" />
                    <Button type="primary" onClick={load} loading={loading}>{t("reports.refresh_report")}</Button>
                </div>
            </Card>
            <Table
                className="module-dark-table"
                rowKey={(row) => `${row.type}:${row.id}`}
                dataSource={rows}
                loading={loading}
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.empty_third_title")} subtitle={t("accounting.empty_third_help")} /> }}
                columns={[
                    { title: t("accounting.third_party_name"), dataIndex: "name" },
                    { title: t("accounting.third_party_document"), dataIndex: "document" },
                    { title: t("accounting.col_type"), dataIndex: "type", render: (value) => t(`accounting.third_party_${value}`) },
                    { title: t("accounting.ledger_closing_balance"), dataIndex: "balance", align: "right", render: formatCurrency },
                    { title: "", render: (_, party) => <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(party)}>{t("accounting.ledger_view_button")}</Button> },
                ]}
            />
            <Drawer rootClassName="accounting-drawer" open={Boolean(detail)} onClose={() => setDetail(null)} width={760} title={detail?.thirdParty?.name || t("accounting.tab_third_parties")}>
                <Row gutter={12} className="mb-4">
                    <Col span={12}><StatCard title={t("accounting.ledger_opening_balance")} value={detail?.openingBalance || 0} formatter={formatCurrency} /></Col>
                    <Col span={12}><StatCard title={t("accounting.ledger_closing_balance")} value={detail?.closingBalance || 0} formatter={formatCurrency} /></Col>
                </Row>
                <Table className="module-dark-table" scroll={{ x: 760 }} loading={detailLoading} rowKey="id" pagination={false} dataSource={detail?.movements || []} columns={[
                    { title: t("accounting.col_date"), dataIndex: "date", render: (value) => dayjs(value).format("DD/MM/YYYY") },
                    { title: t("accounting.lines_col_account"), dataIndex: "chartAccount", render: (account) => `${account.code} · ${account.name}` },
                    { title: t("accounting.lines_col_debit"), dataIndex: "debit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                    { title: t("accounting.lines_col_credit"), dataIndex: "credit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                    { title: t("accounting.ledger_col_running_balance"), dataIndex: "runningBalance", align: "right", render: formatCurrency },
                ]} />
            </Drawer>
        </>
    );
};

const CostCentersTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [centers, setCenters] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [ledger, setLedger] = useState(null);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [ledgerRange, setLedgerRange] = useState([dayjs().startOf("month"), dayjs()]);

    const load = async () => {
        setLoading(true);
        try {
            const [centerResponse, locationResponse] = await Promise.all([accountingService.listCostCenters({ includeInactive: true }), pointOfSaleService.list()]);
            setCenters(centerResponse?.data || []);
            setLocations(locationResponse?.data || []);
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (center = null) => {
        setEditing(center);
        form.setFieldsValue({ code: center?.code || "", name: center?.name || "", is_active: center?.is_active ?? true });
        setOpen(true);
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editing) await accountingService.updateCostCenter(editing._id, values);
            else await accountingService.createCostCenter(values);
            toast.success(t(editing ? "accounting.cost_center_updated" : "accounting.cost_center_created"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(accountingErrorMessage(error, t));
        } finally { setSaving(false); }
    };
    const showLedger = async (center, range = ledgerRange) => {
        setLedgerLoading(true);
        setLedger((current) => ({ ...(current || {}), cost_center: center, movements: current?.cost_center?._id === center._id ? current.movements : [] }));
        try {
            const response = await accountingService.getCostCenterLedger(center._id, { from: range[0].format("YYYY-MM-DD"), to: range[1].format("YYYY-MM-DD") });
            setLedger(response?.data || null);
        } catch { toast.error(t("accounting.failed")); }
        finally { setLedgerLoading(false); }
    };
    const assignLocation = async (location, costCenterId) => {
        try {
            await accountingService.assignLocationCostCenter(location.id, costCenterId);
            setLocations((rows) => rows.map((row) => row.id === location.id ? { ...row, defaultCostCenterId: costCenterId || null } : row));
            toast.success(t("accounting.cost_center_location_saved"));
        } catch (error) { toast.error(accountingErrorMessage(error, t)); }
    };

    return <>
        <AccountingSectionGuide sectionKey="cost-centers" title={t("accounting.guide_cost_centers_title")} summary={t("accounting.tab_cost_centers_caption")} steps={[t("accounting.guide_cost_centers_step_1"), t("accounting.guide_cost_centers_step_2"), t("accounting.guide_cost_centers_step_3")]} result={t("accounting.guide_cost_centers_result")} concepts={[{ label: t("accounting.cost_center"), help: t("accounting.cost_center_help") }]} />
        <div className="flex justify-end mb-4">{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.cost_center_new")}</Button>}</div>
        <Table className="module-dark-table" loading={loading} rowKey="_id" dataSource={centers} pagination={{ pageSize: 15 }} locale={{ emptyText: <EmptyState compact title={t("accounting.empty_cost_centers_title")} subtitle={t("accounting.empty_cost_centers_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.cost_center_new")}</Button> : null} /> }} columns={[
            { title: t("accounting.col_code"), dataIndex: "code", width: 150 },
            { title: t("accounting.col_name"), dataIndex: "name" },
            { title: t("accounting.col_status"), dataIndex: "is_active", render: (active) => <Tag color={active ? "green" : "default"}>{t(active ? "common.active" : "common.inactive")}</Tag> },
            { title: t("common.actions"), width: 210, render: (_, center) => <div className="flex gap-2"><Button size="small" icon={<EyeOutlined />} onClick={() => showLedger(center)}>{t("accounting.cost_center_view_ledger")}</Button>{canEdit && <Button size="small" onClick={() => showEditor(center)}>{t("common.edit")}</Button>}</div> },
        ]} />
        <Card className="module-shell border border-[var(--ohnix-line-4)] mt-6" title={t("accounting.cost_center_automation_title")}>
            <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.cost_center_automation_help")} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {locations.filter((location) => location.isActive).map((location) => (
                    <div key={location.id} className="rounded-xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-surface-card-soft)] p-4">
                        <strong className="block text-[var(--ohnix-text-primary)] mb-2">{location.name}</strong>
                        <Select allowClear showSearch optionFilterProp="label" className="w-full" disabled={!canAdmin} placeholder={t("accounting.cost_center_location_unassigned")} value={location.defaultCostCenterId || undefined} onChange={(value) => assignLocation(location, value)} options={centers.filter((center) => center.is_active).map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} />
                    </div>
                ))}
            </div>
        </Card>
        <Modal className="accounting-modal" title={editing ? t("accounting.cost_center_edit") : t("accounting.cost_center_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} destroyOnHidden>
            <Alert className="dark-alert dark-alert-teal mb-4" showIcon type="info" message={t("accounting.cost_center_form_help")} />
            <Form form={form} layout="vertical">
                <Form.Item name="code" label={t("accounting.col_code")} extra={t("accounting.cost_center_code_help")} rules={[{ required: true, max: 30 }]}><Input /></Form.Item>
                <Form.Item name="name" label={t("accounting.col_name")} rules={[{ required: true, max: 120 }]}><Input /></Form.Item>
                {editing && <Form.Item name="is_active" label={t("accounting.col_status")} valuePropName="checked"><Switch /></Form.Item>}
            </Form>
        </Modal>
        <Drawer rootClassName="accounting-drawer" width={900} open={Boolean(ledger)} onClose={() => setLedger(null)} title={ledger?.cost_center ? `${ledger.cost_center.code} · ${ledger.cost_center.name}` : t("accounting.cost_center_ledger_title")}>
            <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.cost_center_ledger_help")} />
            <div className="flex flex-col sm:flex-row gap-3 mb-4"><RangePicker value={ledgerRange} onChange={(dates) => dates && setLedgerRange(dates)} allowClear={false} /><Button type="primary" loading={ledgerLoading} onClick={() => ledger?.cost_center && showLedger(ledger.cost_center)}>{t("reports.refresh_report")}</Button></div>
            <Row gutter={[16, 16]} className="mb-4"><Col xs={24} sm={12}><StatCard title={t("accounting.lines_col_debit")} value={ledger?.total_debit || 0} formatter={formatCurrency} /></Col><Col xs={24} sm={12}><StatCard title={t("accounting.lines_col_credit")} value={ledger?.total_credit || 0} formatter={formatCurrency} /></Col></Row>
            <Table className="module-dark-table" loading={ledgerLoading} rowKey="id" dataSource={ledger?.movements || []} pagination={{ pageSize: 15 }} scroll={{ x: 760 }} locale={{ emptyText: <Empty description={t("accounting.cost_center_ledger_empty")} /> }} columns={[
                { title: t("accounting.col_date"), dataIndex: "date", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") },
                { title: t("accounting.lines_col_account"), dataIndex: "chart_account", render: (account) => `${account.code} · ${account.name}` },
                { title: t("accounting.col_description"), dataIndex: "description", ellipsis: true },
                { title: t("accounting.lines_col_debit"), dataIndex: "debit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                { title: t("accounting.lines_col_credit"), dataIndex: "credit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
            ]} />
        </Drawer>
    </>;
};

const RecurringExpensesTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const [form] = Form.useForm();
    const [templates, setTemplates] = useState([]);
    const [expenseAccounts, setExpenseAccounts] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [runningId, setRunningId] = useState(null);
    const watchedTreatment = Form.useWatch("tax_treatment", form);
    const watchedAmount = Form.useWatch("amount", form);
    const watchedRate = Form.useWatch("tax_rate", form);
    const taxPreview = watchedTreatment === "taxed" && Number(watchedAmount) > 0 && Number(watchedRate) > 0
        ? { base: Number(watchedAmount) / (1 + Number(watchedRate) / 100), tax: Number(watchedAmount) - Number(watchedAmount) / (1 + Number(watchedRate) / 100) }
        : null;

    const load = async () => {
        setLoading(true);
        try {
            const [templateResponse, chartResponse, cashResponse] = await Promise.all([
                accountingService.listRecurringExpenses({ includeInactive: true }),
                accountingService.listChartOfAccounts(),
                financeService.listCashAccounts(),
            ]);
            setTemplates(templateResponse?.data || []);
            setExpenseAccounts((chartResponse?.data || []).filter((a) => a.account_type === "expense" && a.is_active));
            setCashAccounts((cashResponse?.data || []).filter((a) => a.is_active));
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (template = null) => {
        setEditing(template);
        form.setFieldsValue({
            description: template?.description || "",
            amount: template?.amount ?? undefined,
            day_of_month: template?.day_of_month ?? 1,
            expense_account_id: template?.expense_account?._id,
            cash_account_id: template?.cash_account?._id,
            tax_treatment: template?.tax_treatment || "excluded",
            tax_rate: template?.tax_rate || 19,
            is_active: template?.is_active ?? true,
        });
        setOpen(true);
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editing) await accountingService.updateRecurringExpense(editing._id, values);
            else await accountingService.createRecurringExpense(values);
            toast.success(t(editing ? "accounting.recurring_expense_updated" : "accounting.recurring_expense_created"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(accountingErrorMessage(error, t));
        } finally { setSaving(false); }
    };
    const runNow = async (template) => {
        setRunningId(template._id);
        try {
            await accountingService.runRecurringExpenseNow(template._id);
            toast.success(t("accounting.recurring_expense_run_success"));
            await load();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setRunningId(null); }
    };

    return <>
        <AccountingSectionGuide sectionKey="recurring-expenses" title={t("accounting.guide_recurring_title")} summary={t("accounting.tab_recurring_expenses_caption")} steps={[t("accounting.guide_recurring_step_1"), t("accounting.guide_recurring_step_2")]} result={t("accounting.guide_recurring_result")} concepts={[{ label: t("accounting.recurring_expense_day_of_month"), help: t("accounting.recurring_expense_day_of_month_help") }]} />
        <div className="flex justify-end mb-4">{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.recurring_expense_new")}</Button>}</div>
        <Table
            className="module-dark-table"
            loading={loading}
            rowKey="_id"
            dataSource={templates}
            pagination={{ pageSize: 15 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.empty_recurring_expenses_title")} subtitle={t("accounting.empty_recurring_expenses_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.recurring_expense_new")}</Button> : null} /> }}
            columns={[
                { title: t("accounting.col_description"), dataIndex: "description" },
                { title: t("accounting.col_amount"), dataIndex: "amount", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.recurring_expense_day_of_month"), dataIndex: "day_of_month", width: 90, align: "center" },
                { title: t("accounting.section_expenses"), render: (_, row) => row.expense_account ? `${row.expense_account.code} · ${row.expense_account.name}` : "—" },
                { title: t("accounting.recurring_expense_cash_account"), render: (_, row) => row.cash_account?.name || "—" },
                { title: t("accounting.recurring_expense_vat_column"), render: (_, row) => row.tax_treatment === "taxed" ? <Tag color="blue">{t("accounting.tax_treatment_taxed")} {row.tax_rate}%</Tag> : <Tag>{t(`accounting.tax_treatment_${row.tax_treatment}`)}</Tag> },
                {
                    title: t("accounting.col_status"),
                    render: (_, row) => (
                        <div className="flex flex-col gap-1">
                            <Tag color={row.is_active ? "green" : "default"}>{t(row.is_active ? "common.active" : "common.inactive")}</Tag>
                            {row.last_run_status === "failed" && (
                                <Tooltip title={t(ACCOUNTING_ERROR_CODES[row.last_run_error] || "accounting.error_recurring_generation_failed")}>
                                    <Tag color="red" icon={<WarningOutlined />}>{t("accounting.recurring_expense_last_run_failed")}</Tag>
                                </Tooltip>
                            )}
                            {row.last_generated_period && row.last_run_status !== "failed" && (
                                <span className="text-xs text-[var(--ohnix-text-dim)]">{t("accounting.recurring_expense_last_generated", { period: row.last_generated_period })}</span>
                            )}
                        </div>
                    ),
                },
                {
                    title: t("common.actions"),
                    width: 220,
                    render: (_, template) => (
                        <div className="flex gap-2">
                            {canEdit && (
                                <Button size="small" loading={runningId === template._id} disabled={!template.is_active} onClick={() => runNow(template)}>
                                    {t("accounting.recurring_expense_run_now")}
                                </Button>
                            )}
                            {canEdit && <Button size="small" onClick={() => showEditor(template)}>{t("common.edit")}</Button>}
                        </div>
                    ),
                },
            ]}
        />
        <Modal className="accounting-modal" title={editing ? t("accounting.recurring_expense_edit") : t("accounting.recurring_expense_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} destroyOnHidden>
            <Alert className="dark-alert dark-alert-teal mb-4" showIcon type="info" message={t("accounting.recurring_expense_form_help")} />
            <Form form={form} layout="vertical">
                <Form.Item name="description" label={t("accounting.col_description")} rules={[{ required: true, max: 160 }]}><Input /></Form.Item>
                <Form.Item name="amount" label={t("accounting.col_amount")} extra={t("accounting.recurring_expense_amount_help")} rules={[{ required: true, type: "number" }]}><InputNumber min={0.01} step={1000} className="w-full" /></Form.Item>
                <Form.Item name="day_of_month" label={t("accounting.recurring_expense_day_of_month")} extra={t("accounting.recurring_expense_day_of_month_help")} rules={[{ required: true, type: "number", min: 1, max: 28 }]}><InputNumber min={1} max={28} className="w-full" /></Form.Item>
                <Form.Item name="expense_account_id" label={t("accounting.section_expenses")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={expenseAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} />
                </Form.Item>
                <Form.Item name="cash_account_id" label={t("accounting.recurring_expense_cash_account")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={cashAccounts.map((a) => ({ value: a._id, label: a.name }))} />
                </Form.Item>
                <Row gutter={12}>
                    <Col xs={24} sm={taxPreview !== null || watchedTreatment === "taxed" ? 12 : 24}>
                        <Form.Item name="tax_treatment" label={t("accounting.tax_treatment")} rules={[{ required: true }]}>
                            <Select options={[
                                { value: "excluded", label: t("accounting.tax_treatment_excluded") },
                                { value: "exempt", label: t("accounting.tax_treatment_exempt") },
                                { value: "taxed", label: t("accounting.tax_treatment_taxed") },
                            ]} />
                        </Form.Item>
                    </Col>
                    {watchedTreatment === "taxed" && (
                        <Col xs={24} sm={12}>
                            <Form.Item name="tax_rate" label={t("accounting.tax_rate")} rules={[{ required: true, type: "number", min: 0.01, max: 100 }]}>
                                <InputNumber min={0} max={100} precision={2} className="w-full" />
                            </Form.Item>
                        </Col>
                    )}
                </Row>
                {taxPreview && (
                    <Alert
                        className="dark-alert dark-alert-purple mb-4"
                        type="info"
                        showIcon
                        message={t("accounting.recurring_expense_tax_preview", { base: formatCurrency(taxPreview.base), tax: formatCurrency(taxPreview.tax) })}
                    />
                )}
                {editing && <Form.Item name="is_active" label={t("accounting.col_status")} valuePropName="checked"><Switch /></Form.Item>}
            </Form>
        </Modal>
    </>;
};

const RecurringJournalsTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const [form] = Form.useForm();
    const [templates, setTemplates] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [runningId, setRunningId] = useState(null);
    const watchedLines = Form.useWatch("lines", form) || [];
    const totalDebit = watchedLines.reduce((sum, line) => sum + Number(line?.debit || 0), 0);
    const totalCredit = watchedLines.reduce((sum, line) => sum + Number(line?.credit || 0), 0);
    const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

    const load = async () => {
        setLoading(true);
        try {
            const [templateResponse, chartResponse, costCenterResponse] = await Promise.all([
                accountingService.listRecurringJournalTemplates({ includeInactive: true }),
                accountingService.listChartOfAccounts(),
                accountingService.listCostCenters(),
            ]);
            setTemplates(templateResponse?.data || []);
            setAccounts((chartResponse?.data || []).filter((a) => a.is_active));
            setCostCenters((costCenterResponse?.data || []).filter((c) => c.is_active));
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (template = null) => {
        setEditing(template);
        form.setFieldsValue({
            description: template?.description || "",
            day_of_month: template?.day_of_month ?? 1,
            is_active: template?.is_active ?? true,
            lines: template?.lines?.map((line) => ({
                chart_account_id: line.chart_account._id,
                cost_center_id: line.cost_center?._id,
                debit: line.debit || undefined,
                credit: line.credit || undefined,
                third_party_type: line.third_party?.type,
                third_party_name: line.third_party?.name,
                third_party_document: line.third_party?.document,
            })) || [{}, {}],
        });
        setOpen(true);
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const payload = {
                description: values.description,
                day_of_month: values.day_of_month,
                is_active: values.is_active,
                lines: values.lines.map((line) => ({
                    chart_account_id: line.chart_account_id,
                    cost_center_id: line.cost_center_id,
                    debit: line.debit || 0,
                    credit: line.credit || 0,
                    third_party: line.third_party_type ? { type: line.third_party_type, name: line.third_party_name, document: line.third_party_document } : undefined,
                })),
            };
            if (editing) await accountingService.updateRecurringJournalTemplate(editing._id, payload);
            else await accountingService.createRecurringJournalTemplate(payload);
            toast.success(t(editing ? "accounting.recurring_journal_updated" : "accounting.recurring_journal_created"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(accountingErrorMessage(error, t));
        } finally { setSaving(false); }
    };
    const runNow = async (template) => {
        setRunningId(template._id);
        try {
            await accountingService.runRecurringJournalTemplateNow(template._id);
            toast.success(t("accounting.recurring_journal_run_success"));
            await load();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setRunningId(null); }
    };

    return <>
        <AccountingSectionGuide sectionKey="recurring-journals" title={t("accounting.guide_recurring_journal_title")} summary={t("accounting.tab_recurring_journals_caption")} steps={[t("accounting.guide_recurring_journal_step_1"), t("accounting.guide_recurring_journal_step_2")]} result={t("accounting.guide_recurring_journal_result")} concepts={[{ label: t("accounting.recurring_expense_day_of_month"), help: t("accounting.recurring_expense_day_of_month_help") }]} />
        <div className="flex justify-end mb-4">{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.recurring_journal_new")}</Button>}</div>
        <Table
            className="module-dark-table"
            loading={loading}
            rowKey="_id"
            dataSource={templates}
            pagination={{ pageSize: 15 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.empty_recurring_journals_title")} subtitle={t("accounting.empty_recurring_journals_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.recurring_journal_new")}</Button> : null} /> }}
            columns={[
                { title: t("accounting.col_description"), dataIndex: "description" },
                { title: t("accounting.col_amount"), render: (_, row) => formatCurrency(row.lines.reduce((sum, l) => sum + Number(l.debit || 0), 0)) },
                { title: t("accounting.recurring_expense_day_of_month"), dataIndex: "day_of_month", width: 90, align: "center" },
                {
                    title: t("accounting.col_status"),
                    render: (_, row) => (
                        <div className="flex flex-col gap-1">
                            <Tag color={row.is_active ? "green" : "default"}>{t(row.is_active ? "common.active" : "common.inactive")}</Tag>
                            {row.last_run_status === "failed" && (
                                <Tooltip title={t(ACCOUNTING_ERROR_CODES[row.last_run_error] || "accounting.recurring_journal_run_failed")}>
                                    <Tag color="red" icon={<WarningOutlined />}>{t("accounting.recurring_expense_last_run_failed")}</Tag>
                                </Tooltip>
                            )}
                            {row.last_generated_period && row.last_run_status !== "failed" && (
                                <span className="text-xs text-[var(--ohnix-text-dim)]">{t("accounting.recurring_expense_last_generated", { period: row.last_generated_period })}</span>
                            )}
                        </div>
                    ),
                },
                {
                    title: t("common.actions"),
                    width: 220,
                    render: (_, template) => (
                        <div className="flex gap-2">
                            {canEdit && (
                                <Button size="small" loading={runningId === template._id} disabled={!template.is_active} onClick={() => runNow(template)}>
                                    {t("accounting.recurring_expense_run_now")}
                                </Button>
                            )}
                            {canEdit && <Button size="small" onClick={() => showEditor(template)}>{t("common.edit")}</Button>}
                        </div>
                    ),
                },
            ]}
        />
        <Modal className="accounting-modal" title={editing ? t("accounting.recurring_journal_edit") : t("accounting.recurring_journal_new")} open={open} onCancel={() => setOpen(false)} onOk={save} okButtonProps={{ disabled: !balanced }} confirmLoading={saving} width={980} destroyOnHidden>
            <Alert className="dark-alert dark-alert-teal mb-4" showIcon type="info" message={t("accounting.recurring_journal_form_help")} />
            <Form form={form} layout="vertical">
                <Row gutter={16}>
                    <Col xs={24} md={16}><Form.Item name="description" label={t("accounting.col_description")} rules={[{ required: true, max: 160 }]}><Input /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name="day_of_month" label={t("accounting.recurring_expense_day_of_month")} extra={t("accounting.recurring_expense_day_of_month_help")} rules={[{ required: true, type: "number", min: 1, max: 28 }]}><InputNumber min={1} max={28} className="w-full" /></Form.Item></Col>
                </Row>
                <Form.List name="lines">
                    {(fields, { add, remove }) => (
                        <div className="space-y-3">
                            {fields.map(({ key, name }) => (
                                <div key={key} className="border-b border-[var(--ohnix-line-3)] pb-2">
                                    <Row gutter={8} align="middle">
                                        <Col xs={24} md={9}><Form.Item name={[name, "chart_account_id"]} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder={t("accounting.lines_col_account")} options={accounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} /></Form.Item></Col>
                                        <Col xs={10} md={5}><Form.Item name={[name, "debit"]}><InputNumber min={0} precision={2} className="w-full" placeholder={t("accounting.lines_col_debit")} /></Form.Item></Col>
                                        <Col xs={10} md={5}><Form.Item name={[name, "credit"]}><InputNumber min={0} precision={2} className="w-full" placeholder={t("accounting.lines_col_credit")} /></Form.Item></Col>
                                        <Col xs={4} md={5}><Button danger disabled={fields.length <= 2} onClick={() => remove(name)}>{t("common.delete")}</Button></Col>
                                    </Row>
                                    <Row gutter={8}>
                                        <Col xs={24} md={8}><Form.Item name={[name, "cost_center_id"]}><Select allowClear showSearch optionFilterProp="label" placeholder={t("accounting.cost_center_optional")} options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} /></Form.Item></Col>
                                        <Col xs={24} md={4}><Form.Item name={[name, "third_party_type"]}><Select allowClear placeholder={t("accounting.col_type")} options={[{ value: "customer", label: t("accounting.third_party_customer") }, { value: "supplier", label: t("accounting.third_party_supplier") }, { value: "other", label: t("accounting.third_party_other") }]} /></Form.Item></Col>
                                        <Col xs={24} md={7}><Form.Item name={[name, "third_party_name"]}><Input placeholder={t("accounting.third_party_name")} /></Form.Item></Col>
                                        <Col xs={24} md={5}><Form.Item name={[name, "third_party_document"]}><Input placeholder={t("accounting.third_party_document")} /></Form.Item></Col>
                                    </Row>
                                </div>
                            ))}
                            <Button onClick={() => add({})} icon={<PlusOutlined />}>{t("accounting.voucher_add_line")}</Button>
                        </div>
                    )}
                </Form.List>
                <Alert className="mt-4" type={balanced ? "success" : "warning"} showIcon message={`${t("accounting.lines_col_debit")}: ${formatCurrency(totalDebit)} · ${t("accounting.lines_col_credit")}: ${formatCurrency(totalCredit)}`} description={balanced ? t("accounting.voucher_balanced") : t("accounting.voucher_unbalanced")} />
                {editing && <Form.Item name="is_active" label={t("accounting.col_status")} valuePropName="checked" className="mt-4"><Switch /></Form.Item>}
            </Form>
        </Modal>
    </>;
};

const FixedAssetsTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [disposeForm] = Form.useForm();
    const [assets, setAssets] = useState([]);
    const [assetAccounts, setAssetAccounts] = useState([]);
    const [expenseAccounts, setExpenseAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [runningId, setRunningId] = useState(null);
    const [disposeAsset, setDisposeAsset] = useState(null);
    const [disposing, setDisposing] = useState(false);
    const watchedDisposalAmount = Form.useWatch("disposal_amount", disposeForm);
    const watchedCost = Form.useWatch("acquisition_cost", form);
    const watchedSalvage = Form.useWatch("salvage_value", form);
    const watchedLife = Form.useWatch("useful_life_months", form);
    const monthlyPreview = Number(watchedCost) > 0 && Number(watchedLife) > 0
        ? (Number(watchedCost) - Number(watchedSalvage || 0)) / Number(watchedLife)
        : null;
    const editingLocked = Boolean(editing) && editing.months_depreciated > 0;

    const load = async () => {
        setLoading(true);
        try {
            const [assetResponse, chartResponse, costCenterResponse, cashResponse] = await Promise.all([
                accountingService.listFixedAssets({ includeInactive: true }),
                accountingService.listChartOfAccounts(),
                accountingService.listCostCenters(),
                financeService.listCashAccounts(),
            ]);
            setAssets(assetResponse?.data || []);
            setAssetAccounts((chartResponse?.data || []).filter((a) => a.account_type === "asset" && a.is_active));
            setExpenseAccounts((chartResponse?.data || []).filter((a) => a.account_type === "expense" && a.is_active));
            setCostCenters((costCenterResponse?.data || []).filter((c) => c.is_active));
            setCashAccounts((cashResponse?.data || []).filter((a) => a.is_active));
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (asset = null) => {
        setEditing(asset);
        form.setFieldsValue({
            name: asset?.name || "",
            description: asset?.description || "",
            acquisition_date: asset ? dayjs(asset.acquisition_date) : dayjs(),
            acquisition_cost: asset?.acquisition_cost ?? undefined,
            salvage_value: asset?.salvage_value ?? 0,
            useful_life_months: asset?.useful_life_months ?? 36,
            asset_account_id: asset?.asset_account?._id,
            depreciation_account_id: asset?.depreciation_account?._id,
            expense_account_id: asset?.expense_account?._id,
            cost_center_id: asset?.cost_center?._id,
        });
        setOpen(true);
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const payload = { ...values, acquisition_date: values.acquisition_date.toISOString() };
            if (editing) await accountingService.updateFixedAsset(editing._id, payload);
            else await accountingService.createFixedAsset(payload);
            toast.success(t(editing ? "accounting.fixed_asset_updated" : "accounting.fixed_asset_created"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(accountingErrorMessage(error, t));
        } finally { setSaving(false); }
    };
    const runNow = async (asset) => {
        setRunningId(asset._id);
        try {
            await accountingService.runFixedAssetDepreciationNow(asset._id);
            toast.success(t("accounting.fixed_asset_run_success"));
            await load();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setRunningId(null); }
    };
    const openDispose = (asset) => {
        setDisposeAsset(asset);
        disposeForm.setFieldsValue({ reason: "", disposal_amount: 0, cash_account_id: undefined });
    };
    const confirmDispose = async () => {
        const values = await disposeForm.validateFields();
        setDisposing(true);
        try {
            await accountingService.disposeFixedAsset(disposeAsset._id, {
                reason: values.reason,
                disposalAmount: values.disposal_amount || 0,
                cashAccountId: values.cash_account_id,
            });
            toast.success(t("accounting.fixed_asset_disposed"));
            setDisposeAsset(null);
            disposeForm.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(accountingErrorMessage(error, t));
        } finally { setDisposing(false); }
    };
    return <>
        <AccountingSectionGuide sectionKey="fixed-assets" title={t("accounting.guide_fixed_assets_title")} summary={t("accounting.tab_fixed_assets_caption")} steps={[t("accounting.guide_fixed_assets_step_1"), t("accounting.guide_fixed_assets_step_2"), t("accounting.guide_fixed_assets_step_3")]} result={t("accounting.guide_fixed_assets_result")} concepts={[{ label: t("accounting.fixed_asset_salvage_value"), help: t("accounting.guide_fixed_assets_salvage_help") }, { label: t("accounting.fixed_asset_useful_life"), help: t("accounting.guide_fixed_assets_life_help") }]} />
        <div className="flex justify-end mb-4">{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.fixed_asset_new")}</Button>}</div>
        <Table
            className="module-dark-table"
            loading={loading}
            rowKey="_id"
            dataSource={assets}
            pagination={{ pageSize: 15 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.empty_fixed_assets_title")} subtitle={t("accounting.empty_fixed_assets_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.fixed_asset_new")}</Button> : null} /> }}
            columns={[
                { title: t("accounting.col_description"), dataIndex: "name" },
                { title: t("accounting.fixed_asset_acquisition_cost"), dataIndex: "acquisition_cost", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.fixed_asset_monthly_depreciation"), dataIndex: "monthly_depreciation", align: "right", render: (v) => formatCurrency(v) },
                {
                    title: t("accounting.fixed_asset_progress"),
                    render: (_, row) => (
                        <div className="min-w-32">
                            <Progress percent={Math.round((row.months_depreciated / row.useful_life_months) * 100)} size="small" status={row.status === "disposed" ? "exception" : undefined} />
                            <span className="text-xs text-[var(--ohnix-text-dim)]">{row.months_depreciated}/{row.useful_life_months} {t("accounting.fixed_asset_months")}</span>
                        </div>
                    ),
                },
                {
                    title: t("accounting.col_status"),
                    render: (_, row) => (
                        <div className="flex flex-col gap-1">
                            <Tag color={row.status === "active" ? "green" : row.status === "fully_depreciated" ? "blue" : "default"}>{t(`accounting.fixed_asset_status_${row.status}`)}</Tag>
                            {row.status === "disposed" && row.disposal_gain_loss != null && (
                                <span className="text-xs" style={{ color: row.disposal_gain_loss >= 0 ? "var(--ohnix-status-success)" : "var(--ohnix-status-warning)" }}>
                                    {row.disposal_gain_loss >= 0 ? t("accounting.fixed_asset_disposal_gain") : t("accounting.fixed_asset_disposal_loss")}: {formatCurrency(Math.abs(row.disposal_gain_loss))}
                                </span>
                            )}
                            {row.last_run_status === "failed" && (
                                <Tooltip title={t(ACCOUNTING_ERROR_CODES[row.last_run_error] || "accounting.fixed_asset_run_failed")}>
                                    <Tag color="red" icon={<WarningOutlined />}>{t("accounting.fixed_asset_last_run_failed")}</Tag>
                                </Tooltip>
                            )}
                        </div>
                    ),
                },
                {
                    title: t("common.actions"),
                    width: 260,
                    render: (_, asset) => (
                        <div className="flex gap-2">
                            {canEdit && asset.status === "active" && (
                                <Button size="small" loading={runningId === asset._id} onClick={() => runNow(asset)}>
                                    {t("accounting.fixed_asset_run_now")}
                                </Button>
                            )}
                            {canEdit && asset.status === "active" && <Button size="small" onClick={() => showEditor(asset)}>{t("common.edit")}</Button>}
                            {canAdmin && asset.status === "active" && <Button size="small" danger onClick={() => openDispose(asset)}>{t("accounting.fixed_asset_dispose_action")}</Button>}
                        </div>
                    ),
                },
            ]}
        />
        <Modal className="accounting-modal" title={editing ? t("accounting.fixed_asset_edit") : t("accounting.fixed_asset_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} destroyOnHidden>
            <Alert className="dark-alert dark-alert-teal mb-4" showIcon type="info" message={t("accounting.fixed_asset_form_help")} />
            {editingLocked && <Alert className="mb-4" type="warning" showIcon message={t("accounting.fixed_asset_schedule_locked_help")} />}
            <Form form={form} layout="vertical">
                <Form.Item name="name" label={t("accounting.col_description")} rules={[{ required: true, max: 160 }]}><Input /></Form.Item>
                <Form.Item name="description" label={t("accounting.note_content_label")}><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
                <Row gutter={12}>
                    <Col xs={24} sm={12}><Form.Item name="acquisition_date" label={t("accounting.fixed_asset_acquisition_date")} rules={[{ required: true }]}><DatePicker className="w-full" disabled={editingLocked} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="acquisition_cost" label={t("accounting.fixed_asset_acquisition_cost")} rules={[{ required: true, type: "number" }]}><InputNumber min={0.01} step={1000} className="w-full" disabled={editingLocked} /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col xs={24} sm={12}><Form.Item name="salvage_value" label={t("accounting.fixed_asset_salvage_value")} extra={t("accounting.fixed_asset_salvage_value_help")} rules={[{ required: true, type: "number" }]}><InputNumber min={0} step={1000} className="w-full" disabled={editingLocked} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="useful_life_months" label={t("accounting.fixed_asset_useful_life")} extra={t("accounting.fixed_asset_useful_life_help")} rules={[{ required: true, type: "number", min: 1, max: 600 }]}><InputNumber min={1} max={600} className="w-full" disabled={editingLocked} /></Form.Item></Col>
                </Row>
                {monthlyPreview !== null && (
                    <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.fixed_asset_monthly_preview", { amount: formatCurrency(monthlyPreview) })} />
                )}
                <Form.Item name="asset_account_id" label={t("accounting.fixed_asset_asset_account")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={assetAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} />
                </Form.Item>
                <Form.Item name="depreciation_account_id" label={t("accounting.fixed_asset_depreciation_account")} extra={t("accounting.fixed_asset_depreciation_account_help")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={assetAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} />
                </Form.Item>
                <Form.Item name="expense_account_id" label={t("accounting.fixed_asset_expense_account")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={expenseAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} />
                </Form.Item>
                <Form.Item name="cost_center_id" label={t("accounting.cost_center_optional")}>
                    <Select allowClear showSearch optionFilterProp="label" options={costCenters.map((c) => ({ value: c._id, label: `${c.code} · ${c.name}` }))} />
                </Form.Item>
            </Form>
        </Modal>
        <Modal className="accounting-modal" title={disposeAsset ? t("accounting.fixed_asset_dispose_title", { name: disposeAsset.name }) : ""} open={Boolean(disposeAsset)} onCancel={() => setDisposeAsset(null)} onOk={confirmDispose} confirmLoading={disposing} okButtonProps={{ danger: true }} okText={t("accounting.fixed_asset_dispose_action")} destroyOnHidden>
            <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.fixed_asset_dispose_guidance")} />
            <Form form={disposeForm} layout="vertical">
                <Form.Item name="reason" label={t("accounting.fixed_asset_dispose_reason")} rules={[{ required: true, message: t("accounting.fixed_asset_dispose_reason_required") }]}><Input.TextArea rows={3} /></Form.Item>
                <Form.Item name="disposal_amount" label={t("accounting.fixed_asset_disposal_amount")} extra={t("accounting.fixed_asset_disposal_amount_help")} rules={[{ required: true, type: "number", min: 0 }]}><InputNumber min={0} step={1000} className="w-full" /></Form.Item>
                {Number(watchedDisposalAmount) > 0 && (
                    <Form.Item name="cash_account_id" label={t("accounting.fixed_asset_disposal_cash_account")} rules={[{ required: true, message: t("validation.required_field") }]}>
                        <Select showSearch optionFilterProp="label" options={cashAccounts.map((a) => ({ value: a._id, label: a.name }))} />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    </>;
};

const ManualVouchersTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [vouchers, setVouchers] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const watchedLines = Form.useWatch("lines", form) || [];
    const totalDebit = watchedLines.reduce((sum, line) => sum + Number(line?.debit || 0), 0);
    const totalCredit = watchedLines.reduce((sum, line) => sum + Number(line?.credit || 0), 0);
    const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

    const load = async () => {
        setLoading(true);
        try {
            const [voucherRes, accountRes, costCenterRes] = await Promise.all([
                accountingService.listManualVouchers(),
                accountingService.listChartOfAccounts(),
                accountingService.listCostCenters(),
            ]);
            setVouchers(voucherRes?.data || []);
            setAccounts((accountRes?.data || []).filter((account) => account.is_active));
            setCostCenters(costCenterRes?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (voucher = null) => {
        setEditing(voucher);
        form.setFieldsValue({
            entry_date: voucher ? dayjs(voucher.entry_date) : dayjs(),
            description: voucher?.description || "",
            support_url: voucher?.support_url || "",
            lines: voucher?.lines?.map((line) => ({
                chart_account_id: line.chart_account._id,
                debit: line.debit || undefined,
                credit: line.credit || undefined,
                description: line.description || "",
                third_party: line.third_party || undefined,
                cost_center_id: line.cost_center?._id || undefined,
            })) || [{ debit: undefined, credit: undefined }, { debit: undefined, credit: undefined }],
        });
        setOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const payload = {
                ...values,
                entry_date: values.entry_date.format("YYYY-MM-DD"),
                lines: values.lines.map((line) => ({
                    ...line,
                    debit: Number(line.debit || 0),
                    credit: Number(line.credit || 0),
                })),
            };
            if (editing) await accountingService.updateManualVoucher(editing._id, payload);
            else await accountingService.createManualVoucher(payload);
            toast.success(t("accounting.voucher_saved"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (error?.errorFields) return;
            toast.error(accountingErrorMessage(error, t));
        } finally {
            setSaving(false);
        }
    };

    const post = async (voucher) => {
        try {
            await accountingService.postManualVoucher(voucher._id);
            toast.success(t("accounting.voucher_posted"));
            await load();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        }
    };

    const voidVoucher = (voucher) => {
        let reason = "";
        Modal.confirm({
            className: "accounting-modal",
            title: t("accounting.voucher_void_title"),
            content: <Input.TextArea rows={3} placeholder={t("accounting.voucher_void_reason")} onChange={(event) => { reason = event.target.value; }} />,
            okText: t("accounting.voucher_void"),
            okButtonProps: { danger: true },
            onOk: async () => {
                if (!reason.trim()) throw new Error(t("accounting.voucher_void_reason_required"));
                await accountingService.voidManualVoucher(voucher._id, { reason });
                toast.success(t("accounting.voucher_voided"));
                await load();
            },
        });
    };

    const statusTag = (status) => ({
        draft: <Tag>{t("accounting.voucher_status_draft")}</Tag>,
        posted: <Tag color="green">{t("accounting.voucher_status_posted")}</Tag>,
        voided: <Tag color="red">{t("accounting.voucher_status_voided")}</Tag>,
    }[status]);

    const columns = [
        { title: t("accounting.col_date"), dataIndex: "entry_date", key: "date", render: (value) => dayjs(value).format("DD/MM/YYYY") },
        { title: t("accounting.col_description"), dataIndex: "description", key: "description", ellipsis: true },
        { title: t("accounting.col_status"), dataIndex: "status", key: "status", render: statusTag },
        { title: t("accounting.col_total"), key: "total", align: "right", render: (_, voucher) => formatCurrency(voucher.lines.reduce((sum, line) => sum + line.debit, 0)) },
        {
            title: t("common.actions"), key: "actions", render: (_, voucher) => (
                <div className="flex gap-2">
                    {voucher.status === "draft" && canEdit && <Button size="small" onClick={() => showEditor(voucher)}>{t("common.edit")}</Button>}
                    {voucher.status === "draft" && canEdit && (
                        <Popconfirm title={t("accounting.voucher_post_confirm")} onConfirm={() => post(voucher)}>
                            <Button size="small" type="primary">{t("accounting.voucher_post")}</Button>
                        </Popconfirm>
                    )}
                    {voucher.status === "posted" && canAdmin && <Button size="small" danger onClick={() => voidVoucher(voucher)}>{t("accounting.voucher_void")}</Button>}
                </div>
            ),
        },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="vouchers" title={t("accounting.guide_vouchers_title")} summary={t("accounting.tab_vouchers_caption")} steps={[t("accounting.guide_voucher_step_1"), t("accounting.guide_voucher_step_2"), t("accounting.guide_voucher_step_3")]} result={t("accounting.guide_voucher_result")} concepts={[{ label: t("accounting.voucher_status_draft"), help: t("accounting.guide_draft_help") }, { label: t("accounting.voucher_status_posted"), help: t("accounting.guide_posted_help") }, { label: t("accounting.voucher_maker_checker_label"), help: t("accounting.voucher_maker_checker_help") }]} />
            <div className="flex items-center justify-between gap-3 mb-4">
                <span />
                {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.voucher_new")}</Button>}
            </div>
            <Table
                className="module-dark-table"
                columns={columns}
                dataSource={vouchers}
                rowKey="_id"
                loading={loading}
                scroll={{ x: "max-content" }}
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.empty_vouchers_title")} subtitle={t("accounting.empty_vouchers_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.voucher_new")}</Button> : null} /> }}
                expandable={{
                    expandedRowRender: (voucher) => (
                        <div className="space-y-3">
                            {voucher.support_url && <a href={voucher.support_url} target="_blank" rel="noreferrer">{t("accounting.voucher_open_support")}</a>}
                            <Table
                                className="module-dark-table"
                                size="small"
                                pagination={false}
                                rowKey="_id"
                                dataSource={voucher.lines}
                                columns={[
                                    { title: t("accounting.lines_col_account"), render: (_, line) => `${line.chart_account.code} · ${line.chart_account.name}` },
                                    { title: t("accounting.cost_center"), render: (_, line) => line.cost_center ? `${line.cost_center.code} · ${line.cost_center.name}` : "—" },
                                    { title: t("accounting.lines_col_debit"), dataIndex: "debit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                                    { title: t("accounting.lines_col_credit"), dataIndex: "credit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                                ]}
                            />
                            {voucher.void_reason && <Alert type="error" showIcon message={voucher.void_reason} />}
                        </div>
                    ),
                }}
            />
            <Modal className="accounting-modal" title={editing ? t("accounting.voucher_edit") : t("accounting.voucher_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} okButtonProps={{ disabled: !balanced }} width={980} destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.voucher_editor_guidance")} />
                    <Row gutter={16}>
                        <Col xs={24} md={8}><Form.Item name="entry_date" label={t("accounting.col_date")} rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item></Col>
                        <Col xs={24} md={16}><Form.Item name="description" label={t("accounting.col_description")} rules={[{ required: true }]}><Input /></Form.Item></Col>
                    </Row>
                    <Form.Item name="support_url" label={t("accounting.voucher_support_url")} extra={t("accounting.voucher_support_hint")}><Input type="url" /></Form.Item>
                    <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.voucher_third_party_guidance")} />
                    <Form.List name="lines">
                        {(fields, { add, remove }) => (
                            <div className="space-y-3">
                                {fields.map(({ key, name }) => (
                                    <div key={key} className="border-b border-[var(--ohnix-line-3)] pb-2">
                                        <Row gutter={8} align="middle">
                                            <Col xs={24} md={9}><Form.Item name={[name, "chart_account_id"]} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder={t("accounting.lines_col_account")} options={accounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} /></Form.Item></Col>
                                            <Col xs={10} md={5}><Form.Item name={[name, "debit"]}><InputNumber min={0} precision={2} className="w-full" placeholder={t("accounting.lines_col_debit")} /></Form.Item></Col>
                                            <Col xs={10} md={5}><Form.Item name={[name, "credit"]}><InputNumber min={0} precision={2} className="w-full" placeholder={t("accounting.lines_col_credit")} /></Form.Item></Col>
                                            <Col xs={4} md={5}><Button danger disabled={fields.length <= 2} onClick={() => remove(name)}>{t("common.delete")}</Button></Col>
                                        </Row>
                                        <Row gutter={8}>
                                            <Col xs={24} md={8}><Form.Item name={[name, "cost_center_id"]}><Select allowClear showSearch optionFilterProp="label" placeholder={t("accounting.cost_center_optional")} options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} /></Form.Item></Col>
                                            <Col xs={24} md={4}><Form.Item name={[name, "third_party", "type"]}><Select allowClear placeholder={t("accounting.col_type")} options={[{ value: "customer", label: t("accounting.third_party_customer") }, { value: "supplier", label: t("accounting.third_party_supplier") }, { value: "other", label: t("accounting.third_party_other") }]} /></Form.Item></Col>
                                            <Col xs={24} md={7}><Form.Item name={[name, "third_party", "name"]}><Input placeholder={t("accounting.third_party_name")} /></Form.Item></Col>
                                            <Col xs={24} md={5}><Form.Item name={[name, "third_party", "document"]}><Input placeholder={t("accounting.third_party_document")} /></Form.Item></Col>
                                        </Row>
                                    </div>
                                ))}
                                <Button onClick={() => add({})} icon={<PlusOutlined />}>{t("accounting.voucher_add_line")}</Button>
                            </div>
                        )}
                    </Form.List>
                    <Alert className="mt-4" type={balanced ? "success" : "warning"} showIcon message={`${t("accounting.lines_col_debit")}: ${formatCurrency(totalDebit)} · ${t("accounting.lines_col_credit")}: ${formatCurrency(totalCredit)}`} description={balanced ? t("accounting.voucher_balanced") : t("accounting.voucher_unbalanced")} />
                </Form>
            </Modal>
        </>
    );
};

const JournalTab = ({ initialSourceType, initialSourceId }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().subtract(30, "days"), dayjs()]);
    const [sourceType, setSourceType] = useState(initialSourceType);
    const [sourceId, setSourceId] = useState(initialSourceId);
    const [entries, setEntries] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [costCenterId, setCostCenterId] = useState();
    const [loading, setLoading] = useState(false);
    const [reverseEntry, setReverseEntry] = useState(null);
    const [reverseSaving, setReverseSaving] = useState(false);
    const [reverseForm] = Form.useForm();

    const fetchEntries = async (overrides = {}) => {
        // "sourceId" in overrides (not a !== undefined check) so an explicit
        // clear - {sourceId: undefined}, e.g. dropping the deep-link pin -
        // is distinguishable from "no override passed, keep current state".
        const effectiveSourceType = "sourceType" in overrides ? overrides.sourceType : sourceType;
        const effectiveSourceId = "sourceId" in overrides ? overrides.sourceId : sourceId;
        setLoading(true);
        try {
            const res = await accountingService.listJournalEntries({
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
                sourceType: effectiveSourceType,
                sourceId: effectiveSourceId,
                costCenterId,
            });
            setEntries(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        accountingService.listCostCenters().then((response) => setCostCenters(response?.data || [])).catch(() => {});
        fetchEntries({ sourceType: initialSourceType, sourceId: initialSourceId });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSourceType, initialSourceId]);

    // A deep link (e.g. "view in accounting" from a transfer discrepancy)
    // pins one entry by sourceId; any manual filter change below should
    // drop that pin instead of silently re-applying it underneath.
    const handleSourceTypeChange = (value) => {
        setSourceType(value);
        setSourceId(undefined);
        fetchEntries({ sourceType: value, sourceId: undefined });
    };

    const linesColumns = [
        { title: t("accounting.cost_center"), key: "cost_center", render: (_, l) => l.cost_center ? `${l.cost_center.code} · ${l.cost_center.name}` : "—" },
        { title: t("accounting.lines_col_account"), key: "account", render: (_, l) => `${l.chart_account.code} · ${l.chart_account.name}` },
        { title: t("accounting.lines_col_debit"), dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: t("accounting.lines_col_credit"), dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
    ];

    const submitReversal = async (values) => {
        setReverseSaving(true);
        try { await accountingService.reverseJournalEntry(reverseEntry._id, { reason: values.reason, entry_date: values.entry_date.toISOString() }); toast.success(t("accounting.journal_reversal_success")); setReverseEntry(null); reverseForm.resetFields(); await fetchEntries(); }
        catch (error) { toast.error(accountingErrorMessage(error, t)); }
        finally { setReverseSaving(false); }
    };

    const columns = [
        { title: t("accounting.col_date"), dataIndex: "entry_date", key: "entry_date", render: (v) => dayjs(v).format("DD/MM/YYYY"), width: 120 },
        { title: t("accounting.col_description"), dataIndex: "description", key: "description", ellipsis: true, render: (_, row) => localizedEntryDescription(row, t) },
        {
            title: t("accounting.col_source_type"),
            dataIndex: "source_type",
            key: "source_type",
            render: (v) => <Tag>{t(SOURCE_TYPE_LABEL_KEYS[v] || v)}</Tag>,
        },
        {
            title: t("accounting.col_total"),
            key: "total",
            align: "right",
            render: (_, entry) => formatCurrency(entry.lines.reduce((sum, l) => sum + l.debit, 0)),
        },
        { title: t("common.actions"), key: "actions", render: (_, entry) => !["period_close", "period_reopen", "period_reclose", "manual_journal_reversal"].includes(entry.source_type) ? <Button size="small" danger onClick={() => { setReverseEntry(entry); reverseForm.setFieldsValue({ entry_date: dayjs() }); }}>{t("accounting.journal_reverse")}</Button> : null },
    ];

    const exportJournal = () => {
        const header = [t("accounting.col_date"), t("accounting.col_description"), t("accounting.col_source_type"), t("accounting.lines_col_account"), t("accounting.cost_center"), t("accounting.lines_col_debit"), t("accounting.lines_col_credit")];
        const rows = entries.flatMap((entry) => entry.lines.map((line) => [
            dayjs(entry.entry_date).format("DD/MM/YYYY"),
            localizedEntryDescription(entry, t),
            t(SOURCE_TYPE_LABEL_KEYS[entry.source_type] || entry.source_type),
            `${line.chart_account.code} · ${line.chart_account.name}`,
            line.cost_center ? `${line.cost_center.code} · ${line.cost_center.name}` : "",
            line.debit || 0,
            line.credit || 0,
        ]));
        exportAccountingExcel(`libro-diario-${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}.xlsx`, [{ name: t("accounting.tab_journal"), rows: [header, ...rows] }]);
    };

    return (
        <>
            <AccountingSectionGuide sectionKey="journal" title={t("accounting.guide_journal_title")} summary={t("accounting.tab_journal_caption")} steps={[t("accounting.guide_journal_step_1"), t("accounting.guide_journal_step_2")]} result={t("accounting.guide_journal_result")} concepts={[{ label: t("accounting.lines_col_debit"), help: t("accounting.guide_debit_help") }, { label: t("accounting.lines_col_credit"), help: t("accounting.guide_credit_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                    <Select
                        allowClear
                        placeholder={t("accounting.source_type_filter_placeholder")}
                        className="w-full sm:w-56"
                        value={sourceType}
                        onChange={handleSourceTypeChange}
                        options={Object.entries(SOURCE_TYPE_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) }))}
                    />
                    <Select allowClear showSearch optionFilterProp="label" placeholder={t("accounting.cost_center")} className="w-full sm:w-56" value={costCenterId} onChange={setCostCenterId} options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} />
                    <Button type="primary" className="hover:shadow-[var(--ohnix-accent-glow-hover)] w-full sm:w-auto" icon={<CalendarOutlined />} onClick={() => fetchEntries()} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                    <Button className="w-full sm:w-auto" icon={<DownloadOutlined />} disabled={!entries.length} onClick={exportJournal}>
                        {t("reports.export_to_excel")}
                    </Button>
                    {sourceId && (
                        <Tag
                            closable
                            color="gold"
                            onClose={(e) => {
                                e.preventDefault();
                                setSourceId(undefined);
                                fetchEntries({ sourceId: undefined });
                            }}
                        >
                            {t("accounting.source_id_filter_active")}
                        </Tag>
                    )}
                </div>
            </Card>
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : entries.length === 0 ? (
                    <EmptyState title={t("accounting.no_entries")} subtitle={t("accounting.empty_journal_help")} />
                ) : (
                    <Collapse
                        expandIconPosition="end"
                        expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} className="text-[var(--ohnix-text-muted)]" />}
                        className="custom-tabs"
                        items={entries.map((entry) => ({
                            key: entry._id,
                            label: (
                                <div className="flex items-center justify-between gap-2 min-w-0 pr-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-[var(--ohnix-text-primary)] m-0 truncate">{localizedEntryDescription(entry, t)}</p>
                                        <p className="text-xs text-[var(--ohnix-text-muted)] m-0">{dayjs(entry.entry_date).format("DD/MM/YYYY")}</p>
                                    </div>
                                    <span className="text-sm font-semibold text-[var(--ohnix-accent-2)] shrink-0">
                                        {formatCurrency(entry.lines.reduce((sum, l) => sum + l.debit, 0))}
                                    </span>
                                </div>
                            ),
                            children: (
                                <div className="space-y-2">
                                    <Tag className="mb-1">{t(SOURCE_TYPE_LABEL_KEYS[entry.source_type] || entry.source_type)}</Tag>
                                    {entry.lines.map((l) => (
                                        <div key={l._id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[var(--ohnix-line-3)] last:border-0">
                                            <span className="text-[var(--ohnix-text-soft)] truncate">{l.chart_account.code} · {l.chart_account.name}</span>
                                            <span className="text-[var(--ohnix-text-primary)] font-medium shrink-0">
                                                {l.debit > 0 ? formatCurrency(l.debit) : `(${formatCurrency(l.credit)})`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ),
                        }))}
                    />
                )
            ) : (
                <Card className="module-shell border border-[var(--ohnix-line-4)]">
                    <Table
                        columns={columns}
                        dataSource={entries}
                        rowKey="_id"
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        className="module-dark-table"
                        scroll={{ x: "max-content" }}
                        locale={{ emptyText: <EmptyState compact title={t("accounting.no_entries")} subtitle={t("accounting.empty_journal_help")} /> }}
                        expandable={{
                            expandedRowRender: (entry) => <Table className="module-dark-table" columns={linesColumns} dataSource={entry.lines} rowKey="_id" pagination={false} size="small" scroll={{ x: "max-content" }} />,
                        }}
                    />
                </Card>
            )}
            <Modal className="accounting-modal" open={Boolean(reverseEntry)} title={t("accounting.journal_reverse_title")} onCancel={() => setReverseEntry(null)} onOk={() => reverseForm.submit()} confirmLoading={reverseSaving} destroyOnHidden>
                <Alert className="dark-alert dark-alert-purple mb-4" type="warning" showIcon message={t("accounting.journal_reverse_help")} />
                <Form form={reverseForm} layout="vertical" onFinish={submitReversal}>
                    <Form.Item name="entry_date" label={t("accounting.journal_reverse_date")} rules={[{ required: true, message: t("validation.required_field") }]}><DatePicker className="w-full" /></Form.Item>
                    <Form.Item name="reason" label={t("accounting.journal_reverse_reason")} rules={[{ required: true, message: t("accounting.error_journal_reversal_reason_required") }]}><Input.TextArea rows={4} maxLength={500} showCount /></Form.Item>
                </Form>
            </Modal>
        </>
    );
};

const PeriodsTab = () => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canClose = hasPermission("accounting", "admin");
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [checkingPeriodId, setCheckingPeriodId] = useState(null);
    const [fiscalYears, setFiscalYears] = useState([]);
    const [fiscalYearsLoading, setFiscalYearsLoading] = useState(true);
    const [checkingYear, setCheckingYear] = useState(null);
    const [selectedYear, setSelectedYear] = useState();

    const load = async () => {
        setLoading(true);
        try {
            const res = await accountingService.listAccountingPeriods();
            setPeriods(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    const loadFiscalYears = async () => {
        setFiscalYearsLoading(true);
        try {
            const res = await accountingService.listFiscalYearClosures();
            setFiscalYears(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setFiscalYearsLoading(false);
        }
    };

    useEffect(() => {
        load();
        loadFiscalYears();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Years the user can pick to close: every past year with at least one
    // AccountingPeriod, regardless of whether it's already closed - closing
    // an already-closed year just surfaces "already closed" from the
    // readiness check instead of silently omitting it from the list.
    const currentYear = dayjs().year();
    const closableYears = [...new Set(periods.map((p) => p.year))].filter((year) => year < currentYear).sort((a, b) => b - a);

    const reviewAndCloseYear = async (year) => {
        if (!year) return;
        setCheckingYear(year);
        try {
            const response = await accountingService.getFiscalYearCloseReadiness(year);
            const readiness = response?.data;
            const openMonths = readiness?.open_months || [];
            const alreadyClosed = readiness?.closure?.status === "closed";
            Modal.confirm({
                className: "accounting-modal",
                title: t("accounting.fiscal_year_close_readiness_title", { year }),
                width: 580,
                icon: null,
                content: (
                    <div className="space-y-3 mt-4">
                        {!readiness?.year_elapsed ? (
                            <Alert type="error" showIcon message={t("accounting.fiscal_year_not_elapsed_title")} description={t("accounting.fiscal_year_not_elapsed_desc")} />
                        ) : alreadyClosed ? (
                            <Alert type="error" showIcon message={t("accounting.fiscal_year_already_closed_title")} description={t("accounting.fiscal_year_already_closed_desc")} />
                        ) : openMonths.length > 0 ? (
                            <Alert type="error" showIcon message={t("accounting.fiscal_year_months_not_closed_title")} description={t("accounting.fiscal_year_months_not_closed_desc", { months: openMonths.map((m) => String(m).padStart(2, "0")).join(", ") })} />
                        ) : (
                            <Alert className="dark-alert dark-alert-teal" type="success" showIcon message={t("accounting.fiscal_year_ready_title")} description={t("accounting.fiscal_year_ready_desc", { year })} />
                        )}
                        <p className="text-xs text-[var(--ohnix-text-muted)] m-0">{t("accounting.fiscal_year_close_footer")}</p>
                    </div>
                ),
                okText: readiness?.can_close ? t("accounting.fiscal_year_close_action") : t("accounting.close_readiness_blocked_cta"),
                okButtonProps: { disabled: !readiness?.can_close },
                cancelText: t("common.cancel"),
                onOk: readiness?.can_close ? () => handleCloseYear(year) : undefined,
            });
        } catch (err) {
            toast.error(accountingErrorMessage(err, t, "accounting.close_readiness_failed"));
        } finally {
            setCheckingYear(null);
        }
    };

    const handleCloseYear = async (year) => {
        try {
            await accountingService.closeFiscalYear(year);
            toast.success(t("accounting.fiscal_year_closed", { year }));
            await loadFiscalYears();
        } catch (err) {
            toast.error(accountingErrorMessage(err, t));
        }
    };

    const handleReopenYear = (closure) => {
        let reason = "";
        let durationHours = 24;
        Modal.confirm({
            className: "accounting-modal",
            title: t("accounting.fiscal_year_reopen_title", { year: closure.year }),
            content: (
                <div className="space-y-3 mt-4">
                    <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.fiscal_year_reopen_guidance")} />
                    <Input.TextArea rows={3} placeholder={t("accounting.reopen_period_reason")} onChange={(event) => { reason = event.target.value; }} />
                    <InputNumber min={1} max={168} defaultValue={24} addonAfter={t("accounting.hours")} onChange={(value) => { durationHours = value; }} />
                </div>
            ),
            okText: t("accounting.fiscal_year_reopen_action"),
            onOk: async () => {
                if (!reason.trim()) throw new Error(t("accounting.reopen_period_reason_required"));
                await accountingService.reopenFiscalYear(closure.year, { reason, durationHours });
                toast.success(t("accounting.fiscal_year_reopened", { year: closure.year }));
                await loadFiscalYears();
            },
        });
    };

    const handleClose = async (id) => {
        try {
            await accountingService.closeAccountingPeriod(id);
            toast.success(t("accounting.period_closed"));
            load();
        } catch (err) {
            toast.error(accountingErrorMessage(err, t));
        }
    };

    const reviewAndClose = async (period) => {
        setCheckingPeriodId(period._id);
        try {
            const response = await accountingService.getAccountingPeriodCloseReadiness(period._id);
            const readiness = response?.data;
            const blockers = readiness?.blockers?.operational_differences || [];
            const warnings = readiness?.warnings || {};
            Modal.confirm({
                className: "accounting-modal",
                title: t("accounting.close_readiness_title", { period: `${String(period.month).padStart(2, "0")}/${period.year}` }),
                width: 620,
                icon: null,
                content: <div className="space-y-3 mt-4">
                    {blockers.length > 0 ? <Alert type="error" showIcon message={t("accounting.close_readiness_blocked_title")} description={t("accounting.close_readiness_blocked_desc", { count: blockers.length })} /> : <Alert className="dark-alert dark-alert-teal" type="success" showIcon message={t("accounting.close_readiness_ok_title")} description={t("accounting.close_readiness_ok_desc")} />}
                    {(warnings.unmatched_statement_entries > 0 || warnings.unmatched_cash_movements > 0) && (
                        <Alert
                            className="dark-alert dark-alert-amber"
                            type="warning"
                            showIcon
                            message={t("accounting.close_readiness_reconciliation_title")}
                            description={
                                <div className="space-y-2">
                                    <p className="m-0">{t("accounting.close_readiness_reconciliation_desc", { entries: warnings.unmatched_statement_entries || 0, movements: warnings.unmatched_cash_movements || 0 })}</p>
                                    <a href="/finance/reconciliation" target="_blank" rel="noreferrer" className="text-[var(--ohnix-accent)] hover:underline text-xs font-medium">{t("accounting.close_readiness_reconciliation_link")}</a>
                                </div>
                            }
                        />
                    )}
                    {(warnings.accounting_differences || []).length > 0 && <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.close_readiness_accounting_title")} description={t("accounting.close_readiness_accounting_desc", { count: warnings.accounting_differences.length })} />}
                    {warnings.unsettled_vat_period && <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.close_readiness_vat_title")} description={t("accounting.close_readiness_vat_desc", { period: warnings.unsettled_vat_period.period_number, year: warnings.unsettled_vat_period.year, periodicity: t(`accounting.vat_periodicity_${warnings.unsettled_vat_period.periodicity}`).toLowerCase() })} />}
                    <p className="text-xs text-[var(--ohnix-text-muted)] m-0">{t("accounting.close_readiness_footer")}</p>
                </div>,
                okText: blockers.length > 0 ? t("accounting.close_readiness_blocked_cta") : t("accounting.close_period"),
                okButtonProps: { disabled: blockers.length > 0 },
                cancelText: t("common.cancel"),
                onOk: blockers.length > 0 ? undefined : () => handleClose(period._id),
            });
        } catch (err) { toast.error(accountingErrorMessage(err, t, "accounting.close_readiness_failed")); }
        finally { setCheckingPeriodId(null); }
    };

    const handleReopen = (period) => {
        let reason = "";
        let durationHours = 24;
                        Modal.confirm({
            className: "accounting-modal",
            title: t("accounting.reopen_period_title"),
            content: (
                <div className="space-y-3 mt-4">
                    <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.reopen_period_guidance")} />
                    <Input.TextArea rows={3} placeholder={t("accounting.reopen_period_reason")} onChange={(event) => { reason = event.target.value; }} />
                    <InputNumber min={1} max={168} defaultValue={24} addonAfter={t("accounting.hours")} onChange={(value) => { durationHours = value; }} />
                </div>
            ),
            okText: t("accounting.reopen_period"),
            onOk: async () => {
                if (!reason.trim()) throw new Error(t("accounting.reopen_period_reason_required"));
                await accountingService.reopenAccountingPeriod(period._id, { reason, durationHours });
                toast.success(t("accounting.period_reopened"));
                await load();
            },
        });
    };

    const columns = [
        {
            title: t("accounting.col_period"),
            key: "period",
            render: (_, p) => `${String(p.month).padStart(2, "0")}/${p.year}`,
        },
        {
            title: t("accounting.col_status"),
            dataIndex: "status",
            key: "status",
            render: (v, p) => v === "closed"
                ? <Tag color="default">{t("accounting.status_closed")}</Tag>
                : p.reopened_until
                  ? <Tag color={dayjs(p.reopened_until).isAfter(dayjs()) ? "orange" : "red"}>{t(dayjs(p.reopened_until).isAfter(dayjs()) ? "accounting.status_reopened" : "accounting.status_reopening_expired")}</Tag>
                  : <Tag color="green">{t("accounting.status_open")}</Tag>,
        },
        {
            title: t("accounting.col_closed_at"),
            dataIndex: "closed_at",
            key: "closed_at",
            render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
        },
        {
            title: t("accounting.reopened_until"),
            dataIndex: "reopened_until",
            key: "reopened_until",
            render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—",
        },
        {
            title: "",
            key: "actions",
            render: (_, p) =>
                p.status === "open" && canClose ? (
                    <Button size="small" loading={checkingPeriodId === p._id} onClick={() => reviewAndClose(p)}>{t("accounting.close_period")}</Button>
                ) : p.status === "closed" && canClose ? (
                    <Button size="small" onClick={() => handleReopen(p)}>{t("accounting.reopen_period")}</Button>
                ) : null,
        },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="periods" title={t("accounting.guide_periods_title")} summary={t("accounting.tab_periods_caption")} steps={[t("accounting.guide_period_step_1"), t("accounting.guide_period_step_2"), t("accounting.guide_period_step_3")]} result={t("accounting.guide_period_result")} concepts={[{ label: t("accounting.close_period"), help: t("accounting.guide_close_help") }, { label: t("accounting.reopen_period"), help: t("accounting.guide_reopen_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={columns}
                    dataSource={periods}
                    rowKey="_id"
                    loading={loading}
                    pagination={false}
                    className="module-dark-table"
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: <EmptyState compact title={t("accounting.no_periods")} subtitle={t("accounting.empty_periods_help")} /> }}
                    expandable={{
                        rowExpandable: (period) => period.reopenings?.length > 0,
                        expandedRowRender: (period) => (
                            <Table className="module-dark-table" size="small" pagination={false} rowKey="_id" dataSource={period.reopenings} columns={[
                                { title: t("accounting.reopen_period_reason"), dataIndex: "reason" },
                                { title: t("accounting.reopened_at"), dataIndex: "reopened_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
                                { title: t("accounting.reopened_until"), dataIndex: "expires_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
                                { title: t("accounting.reclosed_at"), dataIndex: "reclosed_at", render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—" },
                            ]} />
                        ),
                    }}
                />
            </Card>

            <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mt-8 mb-3">{t("accounting.fiscal_year_section_title")}</h3>
            <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.fiscal_year_section_help")} />
            {canClose && (
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <Select
                            placeholder={t("accounting.fiscal_year_select_placeholder")}
                            className="w-full sm:w-48"
                            value={selectedYear}
                            onChange={setSelectedYear}
                            options={closableYears.map((year) => ({ value: year, label: year }))}
                        />
                        <Button type="primary" disabled={!selectedYear} loading={checkingYear === selectedYear} onClick={() => reviewAndCloseYear(selectedYear)}>
                            {t("accounting.fiscal_year_verify_and_close")}
                        </Button>
                    </div>
                </Card>
            )}
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={[
                        { title: t("accounting.col_fiscal_year"), dataIndex: "year", key: "year" },
                        {
                            title: t("accounting.col_status"),
                            dataIndex: "status",
                            key: "status",
                            render: (v) => v === "closed" ? <Tag color="default">{t("accounting.status_closed")}</Tag> : <Tag color="orange">{t("accounting.status_reopened")}</Tag>,
                        },
                        { title: t("accounting.col_closed_at"), dataIndex: "closed_at", key: "closed_at", render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—") },
                        { title: t("accounting.reopened_until"), dataIndex: "reopened_until", key: "reopened_until", render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—") },
                        {
                            title: "",
                            key: "actions",
                            render: (_, closure) => canClose && closure.status === "closed" ? <Button size="small" onClick={() => handleReopenYear(closure)}>{t("accounting.fiscal_year_reopen_action")}</Button> : null,
                        },
                    ]}
                    dataSource={fiscalYears}
                    rowKey="_id"
                    loading={fiscalYearsLoading}
                    pagination={false}
                    className="module-dark-table"
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: <EmptyState compact title={t("accounting.no_fiscal_year_closures")} subtitle={t("accounting.empty_fiscal_year_closures_help")} /> }}
                    expandable={{
                        rowExpandable: (closure) => closure.reopenings?.length > 0,
                        expandedRowRender: (closure) => (
                            <Table className="module-dark-table" size="small" pagination={false} rowKey="_id" dataSource={closure.reopenings} columns={[
                                { title: t("accounting.reopen_period_reason"), dataIndex: "reason" },
                                { title: t("accounting.reopened_at"), dataIndex: "reopened_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
                                { title: t("accounting.reopened_until"), dataIndex: "expires_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
                                { title: t("accounting.reclosed_at"), dataIndex: "reclosed_at", render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—" },
                            ]} />
                        ),
                    }}
                />
            </Card>
        </>
    );
};

const FinancialStatementsTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const [incomeRange, setIncomeRange] = useState([dayjs().subtract(30, "days"), dayjs()]);
    const [asOfDate, setAsOfDate] = useState(dayjs());
    const [balanceCostCenterId, setBalanceCostCenterId] = useState();
    const [income, setIncome] = useState(null);
    const [balance, setBalance] = useState(null);
    const [incomeLoading, setIncomeLoading] = useState(false);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [costCenters, setCostCenters] = useState([]);
    const [incomeCostCenterId, setIncomeCostCenterId] = useState();
    const [comparisonOpen, setComparisonOpen] = useState(false);
    const [comparison, setComparison] = useState(null);
    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [cashFlowRange, setCashFlowRange] = useState([dayjs().startOf("month"), dayjs()]);
    const [cashFlow, setCashFlow] = useState(null);
    const [cashFlowLoading, setCashFlowLoading] = useState(false);
    const [equityRange, setEquityRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [equity, setEquity] = useState(null);
    const [equityLoading, setEquityLoading] = useState(false);
    const [notesYear, setNotesYear] = useState(dayjs().year());
    const [notes, setNotes] = useState([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [noteModal, setNoteModal] = useState(null);
    const [noteForm] = Form.useForm();
    const [noteSaving, setNoteSaving] = useState(false);

    const loadNotes = async (year = notesYear) => {
        setNotesLoading(true);
        try {
            const res = await accountingService.listFinancialStatementNotes(year);
            setNotes(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setNotesLoading(false);
        }
    };

    useEffect(() => {
        loadNotes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notesYear]);

    const showNoteEditor = (note = null) => {
        setNoteModal(note || {});
        noteForm.setFieldsValue({ title: note?.title || "", content: note?.content || "" });
    };

    const saveNote = async () => {
        const values = await noteForm.validateFields();
        setNoteSaving(true);
        try {
            if (noteModal?._id) await accountingService.updateFinancialStatementNote(noteModal._id, values);
            else await accountingService.createFinancialStatementNote({ year: notesYear, ...values });
            toast.success(t(noteModal?._id ? "accounting.note_updated" : "accounting.note_created"));
            setNoteModal(null);
            noteForm.resetFields();
            await loadNotes();
        } catch (error) {
            if (!error?.errorFields) toast.error(accountingErrorMessage(error, t));
        } finally {
            setNoteSaving(false);
        }
    };

    const deleteNote = async (note) => {
        try {
            await accountingService.deleteFinancialStatementNote(note._id);
            toast.success(t("accounting.note_deleted"));
            await loadNotes();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        }
    };

    const fetchIncome = async () => {
        setIncomeLoading(true);
        try {
            const res = await accountingService.getIncomeStatement({
                from: incomeRange[0].format("YYYY-MM-DD"),
                to: incomeRange[1].format("YYYY-MM-DD"),
                costCenterId: incomeCostCenterId,
            });
            setIncome(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setIncomeLoading(false);
        }
    };

    const fetchComparison = async () => {
        setComparisonLoading(true);
        try {
            const res = await accountingService.getIncomeStatementComparison({
                from: incomeRange[0].format("YYYY-MM-DD"),
                to: incomeRange[1].format("YYYY-MM-DD"),
            });
            setComparison(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setComparisonLoading(false);
        }
    };

    const toggleComparison = () => {
        const next = !comparisonOpen;
        setComparisonOpen(next);
        if (next) fetchComparison();
    };

    const fetchBalance = async () => {
        setBalanceLoading(true);
        try {
            const res = await accountingService.getBalanceSheet({ asOf: asOfDate.format("YYYY-MM-DD"), costCenterId: balanceCostCenterId });
            setBalance(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setBalanceLoading(false);
        }
    };

    const fetchCashFlow = async () => {
        setCashFlowLoading(true);
        try {
            const res = await accountingService.getCashFlowStatement({ from: cashFlowRange[0].format("YYYY-MM-DD"), to: cashFlowRange[1].format("YYYY-MM-DD") });
            setCashFlow(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setCashFlowLoading(false);
        }
    };

    const fetchEquityChanges = async () => {
        setEquityLoading(true);
        try {
            const res = await accountingService.getEquityChangesStatement({ from: equityRange[0].format("YYYY-MM-DD"), to: equityRange[1].format("YYYY-MM-DD") });
            setEquity(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setEquityLoading(false);
        }
    };

    useEffect(() => {
        accountingService.listCostCenters().then((response) => setCostCenters(response?.data || [])).catch(() => {});
        fetchIncome();
        fetchCashFlow();
        fetchBalance();
        fetchEquityChanges();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const exportIncomeStatement = () => {
        const header = [t("accounting.col_code"), t("accounting.col_account"), t("accounting.col_amount")];
        const section = (title, items) => [[title], ...items.map((item) => [item.code, item.name, item.amount]), []];
        const rows = [
            ...section(t("accounting.section_revenue"), income.revenue || []),
            ...section(t("accounting.section_costs"), income.costs || []),
            ...section(t("accounting.section_expenses"), income.expenses || []),
            [t("accounting.total_revenue"), "", income.total_revenue],
            [t("accounting.total_costs"), "", income.total_costs],
            [t("accounting.gross_profit"), "", income.gross_profit],
            [t("accounting.total_expenses"), "", income.total_expenses],
            [t("accounting.net_income"), "", income.net_income],
        ];
        exportAccountingExcel(`estado-de-resultados-${incomeRange[0].format("YYYY-MM-DD")}_${incomeRange[1].format("YYYY-MM-DD")}.xlsx`, [{ name: t("accounting.income_statement_title"), rows: [header, ...rows] }]);
    };

    const exportBalanceSheet = () => {
        const header = [t("accounting.col_code"), t("accounting.col_account"), t("accounting.col_amount")];
        const section = (title, items) => [[title], ...items.map((item) => [item.code, item.name, item.amount]), []];
        const rows = [
            ...section(t("accounting.section_assets"), balance.assets || []),
            ...section(t("accounting.section_liabilities"), balance.liabilities || []),
            ...section(t("accounting.section_equity"), [...(balance.equity || []), { code: "", name: t("accounting.current_earnings_row"), amount: balance.current_earnings }]),
            [t("accounting.total_assets"), "", balance.total_assets],
            [t("accounting.total_liabilities"), "", balance.total_liabilities],
            [t("accounting.total_equity"), "", balance.total_equity],
        ];
        exportAccountingExcel(`balance-general-${asOfDate.format("YYYY-MM-DD")}.xlsx`, [{ name: t("accounting.balance_sheet_title"), rows: [header, ...rows] }]);
    };

    const exportCashFlow = () => {
        const header = [t("accounting.col_description"), t("accounting.col_amount")];
        const section = (title, category) => [[title], ...category.lines.map((line) => [t(SOURCE_TYPE_LABEL_KEYS[line.source_type] || line.source_type), line.amount]), [t("common.total"), category.total], []];
        const rows = [
            [t("accounting.cash_flow_beginning"), cashFlow.beginning_balance],
            [],
            ...section(t("accounting.cash_flow_operating"), cashFlow.categories.operating),
            ...section(t("accounting.cash_flow_investing"), cashFlow.categories.investing),
            ...section(t("accounting.cash_flow_financing"), cashFlow.categories.financing),
            ...section(t("accounting.cash_flow_adjustments"), cashFlow.categories.adjustments),
            [t("accounting.cash_flow_net_change"), cashFlow.net_change],
            [t("accounting.cash_flow_ending"), cashFlow.ending_balance],
        ];
        exportAccountingExcel(`flujo-de-efectivo-${cashFlowRange[0].format("YYYY-MM-DD")}_${cashFlowRange[1].format("YYYY-MM-DD")}.xlsx`, [{ name: t("accounting.cash_flow_title"), rows: [header, ...rows] }]);
    };

    const exportEquityChanges = () => {
        const header = [t("accounting.col_account"), t("accounting.equity_opening_balance"), t("accounting.equity_capital_contributions"), t("accounting.equity_period_result"), t("accounting.equity_distributions"), t("accounting.equity_other_movements"), t("accounting.equity_closing_balance")];
        const row = (name, r) => [name, r.opening_balance, r.capital_contributions, r.period_result, r.distributions, r.other_movements, r.closing_balance];
        const rows = [
            ...(equity.accounts || []).map((account) => row(`${account.code} · ${account.name}`, account)),
            ...(equity.current_earnings_row ? [row(t("accounting.current_earnings_row"), equity.current_earnings_row)] : []),
            row(t("common.total"), equity.totals),
        ];
        exportAccountingExcel(`estado-de-cambios-en-el-patrimonio-${equityRange[0].format("YYYY-MM-DD")}_${equityRange[1].format("YYYY-MM-DD")}.xlsx`, [{ name: t("accounting.equity_changes_title"), rows: [header, ...rows] }]);
    };

    const accountColumns = [
        { title: t("accounting.col_code"), dataIndex: "code", key: "code", width: 100 },
        {
            title: t("accounting.col_account"),
            dataIndex: "name",
            key: "name",
            // "Resultado del ejercicio" is a computed row appended in the
            // equity table below, not a real chart-of-accounts entry - it
            // has no code, which is the tell used here to style it as
            // derived rather than let it silently look like a real account.
            render: (name, record) =>
                record.code ? (
                    name
                ) : (
                    <Tooltip title={t("accounting.current_earnings_row_hint")}>
                        <span className="italic text-[var(--ohnix-text-muted)]">
                            {name}
                            <span className="ml-2 inline-flex items-center rounded-full bg-[var(--ohnix-hover-overlay)] px-1.5 py-0.5 text-[9px] font-semibold uppercase not-italic tracking-wide text-[var(--ohnix-text-dim)]">
                                {t("accounting.calculated_row_badge")}
                            </span>
                        </span>
                    </Tooltip>
                ),
        },
        { title: t("accounting.col_amount"), dataIndex: "amount", key: "amount", align: "right", render: (v) => formatCurrency(v) },
    ];

    return (
        <div className="space-y-8">
            <AccountingSectionGuide sectionKey="statements" title={t("accounting.guide_statements_title")} summary={t("accounting.guide_statements_summary")} steps={[t("accounting.guide_statements_step_1"), t("accounting.guide_statements_step_2")]} result={t("accounting.guide_statements_result")} concepts={[{ label: t("accounting.income_statement_title"), help: t("accounting.guide_income_help") }, { label: t("accounting.balance_sheet_title"), help: t("accounting.guide_balance_help") }]} />
            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.income_statement_title")}</h3>
                <Alert
                    message={t("accounting.gross_margin_disclaimer")}
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    className="mb-4 dark-alert dark-alert-purple"
                />
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <RangePicker value={incomeRange} onChange={(dates) => dates && setIncomeRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                        <Select allowClear showSearch optionFilterProp="label" className="w-full sm:w-64" placeholder={t("accounting.cost_center_all")} value={incomeCostCenterId} onChange={setIncomeCostCenterId} options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} />
                        <Button type="primary" className="hover:shadow-[var(--ohnix-accent-glow-hover)]" icon={<CalendarOutlined />} onClick={() => { fetchIncome(); if (comparisonOpen) fetchComparison(); }} loading={incomeLoading}>
                            {t("reports.refresh_report")}
                        </Button>
                        <Button onClick={toggleComparison} loading={comparisonLoading}>
                            {comparisonOpen ? t("accounting.income_statement_compare_hide") : t("accounting.income_statement_compare_show")}
                        </Button>
                        <Button icon={<DownloadOutlined />} disabled={!income} onClick={exportIncomeStatement}>
                            {t("reports.export_to_excel")}
                        </Button>
                    </div>
                </Card>
                {comparisonOpen && (
                    <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.income_statement_compare_help")} />
                        <Table
                            className="module-dark-table"
                            loading={comparisonLoading}
                            rowKey={(row) => row.cost_center?.id || "none"}
                            dataSource={comparison?.columns || []}
                            pagination={false}
                            size="small"
                            scroll={{ x: "max-content" }}
                            locale={{ emptyText: <EmptyState compact title={t("accounting.empty_cost_centers_title")} /> }}
                            columns={[
                                { title: t("accounting.cost_center"), render: (_, row) => (row.cost_center ? `${row.cost_center.code} · ${row.cost_center.name}` : t("accounting.cost_center_none")) },
                                { title: t("accounting.total_revenue"), dataIndex: "total_revenue", align: "right", render: (v) => formatCurrency(v) },
                                { title: t("accounting.total_costs"), dataIndex: "total_costs", align: "right", render: (v) => formatCurrency(v) },
                                { title: t("accounting.gross_profit"), dataIndex: "gross_profit", align: "right", render: (v) => <strong>{formatCurrency(v)}</strong> },
                                { title: t("accounting.total_expenses"), dataIndex: "total_expenses", align: "right", render: (v) => formatCurrency(v) },
                                { title: t("accounting.net_income"), dataIndex: "net_income", align: "right", render: (v) => <strong>{formatCurrency(v)}</strong> },
                            ]}
                            summary={() =>
                                comparison?.totals && (
                                    <Table.Summary.Row>
                                        <Table.Summary.Cell index={0}><strong>{t("common.total")}</strong></Table.Summary.Cell>
                                        <Table.Summary.Cell index={1} align="right"><strong>{formatCurrency(comparison.totals.total_revenue)}</strong></Table.Summary.Cell>
                                        <Table.Summary.Cell index={2} align="right"><strong>{formatCurrency(comparison.totals.total_costs)}</strong></Table.Summary.Cell>
                                        <Table.Summary.Cell index={3} align="right"><strong>{formatCurrency(comparison.totals.gross_profit)}</strong></Table.Summary.Cell>
                                        <Table.Summary.Cell index={4} align="right"><strong>{formatCurrency(comparison.totals.total_expenses)}</strong></Table.Summary.Cell>
                                        <Table.Summary.Cell index={5} align="right"><strong>{formatCurrency(comparison.totals.net_income)}</strong></Table.Summary.Cell>
                                    </Table.Summary.Row>
                                )
                            }
                        />
                    </Card>
                )}
                {income && (
                    <>
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_revenue")} value={income.total_revenue} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-success)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_costs")} value={income.total_costs} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.gross_profit")} value={income.gross_profit} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)", fontWeight: 700 }} />
                            </Col>
                        </Row>
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={12}>
                                <StatCard title={t("accounting.total_expenses")} value={income.total_expenses} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <StatCard title={t("accounting.net_income")} value={income.net_income} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-success)", fontWeight: 700 }} />
                            </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_revenue")}>
                                    <Table columns={accountColumns} dataSource={income.revenue} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} locale={{ emptyText: <EmptyState compact title={t("common.no_data")} subtitle={t("accounting.section_revenue_empty")} /> }} />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_costs")}>
                                    <Table columns={accountColumns} dataSource={income.costs} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} locale={{ emptyText: <EmptyState compact title={t("common.no_data")} subtitle={t("accounting.section_costs_empty")} /> }} />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_expenses")}>
                                    <Table columns={accountColumns} dataSource={income.expenses} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} locale={{ emptyText: <EmptyState compact title={t("common.no_data")} subtitle={t("accounting.section_expenses_empty")} /> }} />
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>

            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.balance_sheet_title")}</h3>
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <DatePicker value={asOfDate} onChange={(d) => d && setAsOfDate(d)} format="YYYY-MM-DD" allowClear={false} />
                        <Select allowClear showSearch optionFilterProp="label" className="w-full sm:w-64" placeholder={t("accounting.cost_center_all")} value={balanceCostCenterId} onChange={setBalanceCostCenterId} options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} />
                        <Button type="primary" className="hover:shadow-[var(--ohnix-accent-glow-hover)]" icon={<CalendarOutlined />} onClick={fetchBalance} loading={balanceLoading}>
                            {t("reports.refresh_report")}
                        </Button>
                        <Button icon={<DownloadOutlined />} disabled={!balance} onClick={exportBalanceSheet}>
                            {t("reports.export_to_excel")}
                        </Button>
                    </div>
                </Card>
                {balance && (
                    <>
                        {!balance.balanced && (balanceCostCenterId
                            ? <Alert message={t("accounting.balance_sheet_cost_center_imbalance_note")} type="info" showIcon icon={<InfoCircleOutlined />} className="mb-4 dark-alert dark-alert-purple" />
                            : <Alert message={t("accounting.not_balanced_warning")} type="error" showIcon icon={<WarningOutlined />} className="mb-4 dark-alert dark-alert-rose" />
                        )}
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_assets")} value={balance.total_assets} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_liabilities")} value={balance.total_liabilities} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_equity")} value={balance.total_equity} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-success)", fontWeight: 700 }} />
                            </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_assets")}>
                                    <Table columns={accountColumns} dataSource={balance.assets} rowKey="code" pagination={false} loading={balanceLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} locale={{ emptyText: <EmptyState compact title={t("common.no_data")} subtitle={t("accounting.section_assets_empty")} /> }} />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_liabilities")}>
                                    <Table columns={accountColumns} dataSource={balance.liabilities} rowKey="code" pagination={false} loading={balanceLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} locale={{ emptyText: <EmptyState compact title={t("common.no_data")} subtitle={t("accounting.section_liabilities_empty")} /> }} />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_equity")}>
                                    <Table
                                        columns={accountColumns}
                                        dataSource={[...balance.equity, { code: "", name: t("accounting.current_earnings_row"), amount: balance.current_earnings }]}
                                        rowKey={(r) => r.code || "current_earnings"}
                                        pagination={false}
                                        loading={balanceLoading}
                                        size="small"
                                        className="module-dark-table"
                                        scroll={{ x: "max-content" }}
                                    />
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>

            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.equity_changes_title")}</h3>
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <RangePicker value={equityRange} onChange={(dates) => dates && setEquityRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                        <Button type="primary" className="hover:shadow-[var(--ohnix-accent-glow-hover)]" icon={<CalendarOutlined />} onClick={fetchEquityChanges} loading={equityLoading}>
                            {t("reports.refresh_report")}
                        </Button>
                        <Button icon={<DownloadOutlined />} disabled={!equity} onClick={exportEquityChanges}>
                            {t("reports.export_to_excel")}
                        </Button>
                    </div>
                </Card>
                {equity && (
                    <Card className="module-shell border border-[var(--ohnix-line-4)]">
                        <Table
                            columns={[
                                {
                                    title: t("accounting.col_account"),
                                    dataIndex: "name",
                                    render: (name, record) =>
                                        record.code ? (
                                            name
                                        ) : (
                                            <Tooltip title={t("accounting.current_earnings_row_hint")}>
                                                <span className="italic text-[var(--ohnix-text-muted)]">
                                                    {name}
                                                    <span className="ml-2 inline-flex items-center rounded-full bg-[var(--ohnix-hover-overlay)] px-1.5 py-0.5 text-[9px] font-semibold uppercase not-italic tracking-wide text-[var(--ohnix-text-dim)]">
                                                        {t("accounting.calculated_row_badge")}
                                                    </span>
                                                </span>
                                            </Tooltip>
                                        ),
                                },
                                { title: t("accounting.equity_opening_balance"), dataIndex: "opening_balance", align: "right", render: formatCurrency },
                                { title: t("accounting.equity_capital_contributions"), dataIndex: "capital_contributions", align: "right", render: formatCurrency },
                                { title: t("accounting.equity_period_result"), dataIndex: "period_result", align: "right", render: formatCurrency },
                                { title: t("accounting.equity_distributions"), dataIndex: "distributions", align: "right", render: (v) => v ? <span className="text-[var(--ohnix-status-warning)]">-{formatCurrency(v)}</span> : formatCurrency(0) },
                                { title: t("accounting.equity_other_movements"), dataIndex: "other_movements", align: "right", render: formatCurrency },
                                { title: t("accounting.equity_closing_balance"), dataIndex: "closing_balance", align: "right", render: (v) => <strong>{formatCurrency(v)}</strong> },
                            ]}
                            dataSource={[
                                ...equity.accounts,
                                ...(equity.current_earnings_row ? [{ code: "", name: t("accounting.current_earnings_row"), ...equity.current_earnings_row }] : []),
                            ]}
                            rowKey={(r) => r.id || "current_earnings"}
                            pagination={false}
                            loading={equityLoading}
                            size="small"
                            className="module-dark-table"
                            scroll={{ x: "max-content" }}
                            summary={() => (
                                <Table.Summary.Row>
                                    <Table.Summary.Cell index={0}><strong>{t("common.total")}</strong></Table.Summary.Cell>
                                    <Table.Summary.Cell index={1} align="right">{formatCurrency(equity.totals.opening_balance)}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={2} align="right">{formatCurrency(equity.totals.capital_contributions)}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={3} align="right">{formatCurrency(equity.totals.period_result)}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={4} align="right">{formatCurrency(equity.totals.distributions)}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={5} align="right">{formatCurrency(equity.totals.other_movements)}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={6} align="right"><strong>{formatCurrency(equity.totals.closing_balance)}</strong></Table.Summary.Cell>
                                </Table.Summary.Row>
                            )}
                        />
                    </Card>
                )}
            </div>

            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.cash_flow_title")}</h3>
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <RangePicker value={cashFlowRange} onChange={(dates) => dates && setCashFlowRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                        <Button type="primary" className="hover:shadow-[var(--ohnix-accent-glow-hover)]" icon={<CalendarOutlined />} onClick={fetchCashFlow} loading={cashFlowLoading}>
                            {t("reports.refresh_report")}
                        </Button>
                        <Button icon={<DownloadOutlined />} disabled={!cashFlow} onClick={exportCashFlow}>
                            {t("reports.export_to_excel")}
                        </Button>
                    </div>
                </Card>
                {cashFlow && (
                    <>
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.cash_flow_beginning")} value={cashFlow.beginning_balance} formatter={formatCurrency} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.cash_flow_net_change")} value={cashFlow.net_change} formatter={formatCurrency} valueStyle={{ color: cashFlow.net_change >= 0 ? "var(--ohnix-status-success)" : "var(--ohnix-status-warning)", fontWeight: 700 }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.cash_flow_ending")} value={cashFlow.ending_balance} formatter={formatCurrency} valueStyle={{ fontWeight: 700 }} />
                            </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                            {["operating", "investing", "financing", "adjustments"].map((key) => (
                                <Col xs={24} md={12} key={key}>
                                    <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t(`accounting.cash_flow_${key}`)}>
                                        <Table
                                            columns={[
                                                { title: t("accounting.col_description"), dataIndex: "source_type", render: (v) => t(SOURCE_TYPE_LABEL_KEYS[v] || v) },
                                                { title: t("accounting.col_amount"), dataIndex: "amount", align: "right", render: (v) => formatCurrency(v) },
                                            ]}
                                            dataSource={cashFlow.categories[key].lines}
                                            rowKey="source_type"
                                            pagination={false}
                                            size="small"
                                            className="module-dark-table"
                                            scroll={{ x: "max-content" }}
                                            locale={{ emptyText: <EmptyState compact title={t("common.no_data")} /> }}
                                            summary={() => cashFlow.categories[key].lines.length > 0 && (
                                                <Table.Summary.Row>
                                                    <Table.Summary.Cell index={0}><strong>{t("common.total")}</strong></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={1} align="right"><strong>{formatCurrency(cashFlow.categories[key].total)}</strong></Table.Summary.Cell>
                                                </Table.Summary.Row>
                                            )}
                                        />
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </>
                )}
            </div>

            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.notes_title")}</h3>
                <Alert className="mb-4 dark-alert dark-alert-purple" type="info" showIcon message={t("accounting.notes_help")} />
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <Select
                            className="w-full sm:w-40"
                            value={notesYear}
                            onChange={setNotesYear}
                            options={Array.from({ length: 6 }, (_, i) => dayjs().year() - i).map((year) => ({ value: year, label: year }))}
                        />
                        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showNoteEditor()}>{t("accounting.note_new")}</Button>}
                    </div>
                </Card>
                {notesLoading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : notes.length === 0 ? (
                    <Card className="module-shell border border-[var(--ohnix-line-4)]">
                        <EmptyState compact title={t("accounting.notes_empty_title")} subtitle={t("accounting.notes_empty_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showNoteEditor()}>{t("accounting.note_new")}</Button> : null} />
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {notes.map((note) => (
                            <div key={note._id} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-4)] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <h4 className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0">{note.title}</h4>
                                    {canEdit && (
                                        <div className="flex gap-2 shrink-0">
                                            <Button size="small" onClick={() => showNoteEditor(note)}>{t("common.edit")}</Button>
                                            <Popconfirm title={t("accounting.note_delete_confirm")} onConfirm={() => deleteNote(note)}>
                                                <Button size="small" danger>{t("common.delete")}</Button>
                                            </Popconfirm>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-[var(--ohnix-text-soft)] whitespace-pre-wrap mt-2 mb-0">{note.content}</p>
                            </div>
                        ))}
                    </div>
                )}
                <Modal className="accounting-modal" title={noteModal?._id ? t("accounting.note_edit") : t("accounting.note_new")} open={Boolean(noteModal)} onCancel={() => setNoteModal(null)} onOk={saveNote} confirmLoading={noteSaving} destroyOnHidden>
                    <Form form={noteForm} layout="vertical">
                        <Form.Item name="title" label={t("accounting.note_title_label")} rules={[{ required: true, message: t("validation.required_field") }]}><Input maxLength={200} showCount /></Form.Item>
                        <Form.Item name="content" label={t("accounting.note_content_label")} rules={[{ required: true, message: t("validation.required_field") }]}><Input.TextArea rows={8} maxLength={20000} showCount /></Form.Item>
                    </Form>
                </Modal>
            </div>
        </div>
    );
};

// Landing tab: the handful of numbers a non-accountant actually wants at a
// glance, plus links out to the CxC/CxP, IVA and bank-reconciliation tools
// that already exist in Reports/Finance - linked, not rebuilt here, so
// there's exactly one place each of those numbers is computed.
const OverviewTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [income, setIncome] = useState(null);
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            accountingService.getIncomeStatement({ from: dayjs().startOf("month").format("YYYY-MM-DD"), to: dayjs().format("YYYY-MM-DD") }),
            accountingService.getBalanceSheet({ asOf: dayjs().format("YYYY-MM-DD") }),
        ])
            .then(([incomeRes, balanceRes]) => {
                setIncome(incomeRes?.data || null);
                setBalance(balanceRes?.data || null);
            })
            .catch(() => toast.error(t("accounting.failed")))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const netVat = balance
        ? (balance.liabilities.find((a) => a.code === VAT_GENERATED_CODE)?.amount || 0) -
          (balance.liabilities.find((a) => a.code === VAT_DEDUCTIBLE_CODE)?.amount || 0)
        : 0;

    // state.tab/.sub deep-links straight into Reports.jsx's "advanced" tab and
    // (Reports.jsx forwards .sub as defaultSubTab) AdvancedReports.jsx's own
    // "vat"/"cartera" sub-tab - without it these cards dropped the visitor on
    // Reports.jsx's unrelated default "stock" tab, several clicks away from
    // what the card actually promised.
    const relatedLinks = [
        { to: "/reports", state: { tab: "advanced", sub: "cartera" }, titleKey: "accounting.overview_link_cartera_title", descKey: "accounting.overview_link_cartera_desc" },
        { to: "/reports", state: { tab: "advanced", sub: "vat" }, titleKey: "accounting.overview_link_vat_title", descKey: "accounting.overview_link_vat_desc" },
        { to: "/finance", titleKey: "accounting.overview_link_reconciliation_title", descKey: "accounting.overview_link_reconciliation_desc" },
    ];

    return (
        <div className="space-y-6">
            <AccountingSectionGuide sectionKey="overview" title={t("accounting.guide_overview_title")} summary={t("accounting.tab_overview_caption")} steps={[t("accounting.guide_overview_step_1"), t("accounting.guide_overview_step_2")]} result={t("accounting.guide_overview_result")} concepts={[{ label: t("accounting.overview_gross_profit"), help: t("accounting.guide_profit_help") }, { label: t("accounting.overview_net_vat_payable"), help: t("accounting.guide_vat_help") }]} />
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_gross_profit")} value={income?.gross_profit || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "var(--ohnix-status-info)", fontWeight: 700 }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_total_assets")} value={balance?.total_assets || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "var(--ohnix-status-success)" }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_total_liabilities")} value={balance?.total_liabilities || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={netVat >= 0 ? t("accounting.overview_net_vat_payable") : t("accounting.overview_net_vat_credit")}
                        value={Math.abs(netVat)}
                        formatter={formatCurrency}
                        loading={loading}
                        description={t("accounting.overview_net_vat_help")}
                        valueStyle={{ color: netVat >= 0 ? "var(--ohnix-status-danger)" : "var(--ohnix-status-success)", fontWeight: 700 }}
                    />
                </Col>
            </Row>
            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.overview_related_tools_title")}</h3>
                <Row gutter={[16, 16]}>
                    {relatedLinks.map((link) => (
                        <Col xs={24} md={8} key={link.titleKey}>
                            <Link to={link.to} state={link.state}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)] h-full hover:border-[var(--ohnix-accent)] transition-colors" size="small">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-[var(--ohnix-text-primary)] mb-1">{t(link.titleKey)}</p>
                                            <p className="text-xs text-[var(--ohnix-text-muted)]">{t(link.descKey)}</p>
                                        </div>
                                        <ArrowRightOutlined className="text-[var(--ohnix-text-dim)] shrink-0 mt-1" />
                                    </div>
                                </Card>
                            </Link>
                        </Col>
                    ))}
                </Row>
            </div>
        </div>
    );
};


// Captures the facts a future retención en la fuente / ReteICA engine will
// need (agente retenedor status, municipio, actividad CIIU, tarifa ICA) -
// deliberately does NOT calculate or post anything itself yet, since no
// automatic withholding logic exists server-side (see chartOfAccounts.
// service.js's PUC seed, which still has no Retefuente/ReteICA accounts).
// Saving this now just means the company doesn't have to re-enter it once
// that engine ships, and gives their accountant something concrete to
// review ahead of time.
const WithholdingConceptsCard = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [concepts, setConcepts] = useState([]);
    const [liabilityAccounts, setLiabilityAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [conceptResponse, accountResponse] = await Promise.all([
                accountingService.listWithholdingConcepts(),
                accountingService.listChartOfAccounts(),
            ]);
            setConcepts(conceptResponse?.data || []);
            setLiabilityAccounts((accountResponse?.data || []).filter((account) => account.account_type === "liability" && account.is_active));
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showCreate = () => {
        form.resetFields();
        form.setFieldsValue({ tax_type: "income", base_type: "subtotal", effective_from: dayjs(), minimum_base_amount: 0 });
        setOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            await accountingService.createWithholdingConcept({
                ...values,
                effective_from: values.effective_from.startOf("day").toISOString(),
                effective_to: values.effective_to?.endOf("day").toISOString() || null,
            });
            toast.success(t("accounting.withholding_created"));
            setOpen(false);
            await load();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (concept) => {
        try {
            await accountingService.setWithholdingConceptActive(concept.id, !concept.is_active);
            toast.success(t("accounting.withholding_status_updated"));
            await load();
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        }
    };

    const activeCount = concepts.filter((concept) => concept.is_active).length;
    const columns = [
        { title: t("accounting.withholding_code"), dataIndex: "code", width: 110, render: (value) => <Tag color="cyan">{value}</Tag> },
        { title: t("accounting.withholding_concept"), dataIndex: "name", width: 210 },
        { title: t("accounting.col_type"), dataIndex: "tax_type", render: (value) => t(`accounting.withholding_type_${value}`) },
        { title: t("accounting.withholding_rate"), dataIndex: "rate_percent", align: "right", render: (value) => `${value}%` },
        { title: t("accounting.withholding_minimum_base"), dataIndex: "minimum_base_amount", align: "right", render: formatCurrency },
        { title: t("accounting.lines_col_account"), dataIndex: "chart_account", width: 210, render: (account) => account ? `${account.code} · ${account.name}` : "—" },
        { title: t("common.status"), dataIndex: "is_active", render: (active) => <Tag color={active ? "success" : "default"}>{t(active ? "common.active" : "common.inactive")}</Tag> },
        ...(canAdmin ? [{ title: "", fixed: "right", width: 105, render: (_, concept) => <Button size="small" onClick={() => toggle(concept)}>{t(concept.is_active ? "accounting.deactivate_account" : "accounting.activate_account")}</Button> }] : []),
    ];

    return (
        <>
            <Card className="module-shell withholding-concepts-card border border-[var(--ohnix-line-4)]" title={<span className="flex items-center gap-2"><SafetyCertificateOutlined className="text-[var(--ohnix-accent)]" />{t("accounting.withholding_concepts_title")}</span>} extra={canAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={showCreate}>{t("accounting.withholding_new")}</Button>}>
                <div className="withholding-concepts-hero">
                    <div><span>{t("accounting.withholding_engine_label")}</span><strong>{t("accounting.withholding_engine_active")}</strong><p>{t("accounting.withholding_concepts_desc")}</p></div>
                    <div className="withholding-concepts-count"><strong>{activeCount}</strong><span>{t("accounting.withholding_active_count")}</span></div>
                </div>
                <Table className="module-dark-table" loading={loading} rowKey="id" columns={columns} dataSource={concepts} scroll={{ x: 1100 }} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty description={t("accounting.withholding_empty")} /> }} />
            </Card>
            <Modal className="accounting-modal" open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} title={t("accounting.withholding_new_title")} width={760} destroyOnHidden>
                <Alert className="dark-alert dark-alert-teal mb-5" showIcon type="info" message={t("accounting.withholding_immutable_notice")} />
                <Form form={form} layout="vertical"><Row gutter={16}>
                    <Col xs={24} sm={8}><Form.Item name="code" label={t("accounting.withholding_code")} rules={[{ required: true }]}><Input maxLength={30} /></Form.Item></Col>
                    <Col xs={24} sm={16}><Form.Item name="name" label={t("accounting.withholding_concept")} rules={[{ required: true }]}><Input maxLength={120} /></Form.Item></Col>
                    <Col xs={24} sm={8}><Form.Item name="tax_type" label={t("accounting.col_type")} extra={t("accounting.withholding_type_hint")} rules={[{ required: true }]}><Select options={["income", "vat", "ica"].map((value) => ({ value, label: t(`accounting.withholding_type_${value}`) }))} /></Form.Item></Col>
                    <Col xs={24} sm={8}><Form.Item name="base_type" label={t("accounting.withholding_base_type")} extra={t("accounting.withholding_base_hint")} rules={[{ required: true }]}><Select options={["subtotal", "vat", "total"].map((value) => ({ value, label: t(`accounting.withholding_base_${value}`) }))} /></Form.Item></Col>
                    <Col xs={24} sm={8}><Form.Item name="rate_percent" label={t("accounting.withholding_rate")} extra={t("accounting.withholding_rate_hint")} rules={[{ required: true }]}><InputNumber className="w-full" min={0.0001} max={100} precision={4} addonAfter="%" /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="minimum_base_amount" label={t("accounting.withholding_minimum_base")} extra={t("accounting.withholding_minimum_hint")} rules={[{ required: true }]}><InputNumber className="w-full" min={0} precision={2} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="chart_account_id" label={t("accounting.withholding_liability_account")} extra={t("accounting.withholding_account_hint")} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={liabilityAccounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="effective_from" label={t("accounting.withholding_effective_from")} rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="effective_to" label={t("accounting.withholding_effective_to")}><DatePicker className="w-full" /></Form.Item></Col>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.tax_type !== next.tax_type}>{({ getFieldValue }) => getFieldValue("tax_type") === "ica" && <Col span={24}><Form.Item name="municipality_code" label={t("accounting.taxes_ica_municipality_label")} rules={[{ required: true }, { pattern: /^\d{5}$/, message: t("accounting.taxes_ica_municipality_error") }]}><Input maxLength={5} placeholder="11001" /></Form.Item></Col>}</Form.Item>
                </Row></Form>
            </Modal>
        </>
    );
};

const WithholdingReportCard = () => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [taxType, setTaxType] = useState();
    const [report, setReport] = useState({ totals: {}, by_type: [], rows: [] });
    const [loading, setLoading] = useState(false);
    const [certificate, setCertificate] = useState(null);
    const [certificateLoadingId, setCertificateLoadingId] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const response = await accountingService.getWithholdingReport({ from: dateRange?.[0]?.format("YYYY-MM-DD"), to: dateRange?.[1]?.format("YYYY-MM-DD"), taxType });
            setReport(response?.data || { totals: {}, by_type: [], rows: [] });
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showCertificate = async (row) => {
        setCertificateLoadingId(row.id);
        try {
            const response = await accountingService.getWithholdingCertificate(row.supplier.id, dayjs(row.purchase.date).year());
            setCertificate(response?.data || null);
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setCertificateLoadingId(null); }
    };

    const columns = [
        { title: t("accounting.withholding_report_date"), dataIndex: ["purchase", "date"], width: 120, render: (value) => dayjs(value).format("DD MMM YYYY") },
        { title: t("accounting.withholding_report_document"), dataIndex: ["purchase", "number"], width: 130, render: (value) => <strong>{value}</strong> },
        { title: t("accounting.withholding_report_supplier"), dataIndex: ["supplier", "name"], width: 210, render: (value, row) => <div><strong>{value}</strong><small className="block text-[var(--ohnix-text-dim)]">{row.supplier.document || "—"}</small></div> },
        { title: t("accounting.withholding_concept"), dataIndex: "concept_name", width: 210, render: (value, row) => <div>{value}<Tag className="ml-2" color="cyan">{t(`accounting.withholding_type_${row.tax_type}`)}</Tag></div> },
        { title: t("accounting.withholding_report_base"), dataIndex: "base_amount", align: "right", render: formatCurrency },
        { title: t("accounting.withholding_rate"), dataIndex: "rate_percent", align: "right", render: (value) => `${value}%` },
        { title: t("accounting.withholding_report_net"), dataIndex: "net_withheld_amount", align: "right", render: (value) => <strong className="text-[var(--ohnix-accent)]">{formatCurrency(value)}</strong> },
        { title: "", fixed: "right", width: 125, render: (_, row) => <Button size="small" icon={<SafetyCertificateOutlined />} loading={certificateLoadingId === row.id} onClick={() => showCertificate(row)}>{t("accounting.withholding_certificate_view")}</Button> },
    ];

    const downloadCertificate = async () => {
        setPdfLoading(true);
        try {
            await accountingService.downloadWithholdingCertificate(certificate.supplier.id, certificate.year, certificate.supplier.identification, currentLanguage);
            toast.success(t("accounting.withholding_certificate_downloaded"));
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setPdfLoading(false); }
    };

    return <>
        <Card className="module-shell withholding-report-card border border-[var(--ohnix-line-4)]" title={<span className="flex items-center gap-2"><BarChartOutlined className="text-[var(--ohnix-accent)]" />{t("accounting.withholding_report_title")}</span>}>
            <div className="withholding-report-intro"><div><span>{t("accounting.withholding_report_eyebrow")}</span><h3>{t("accounting.withholding_report_heading")}</h3><p>{t("accounting.withholding_report_desc")}</p></div><SafetyCertificateOutlined /></div>
            <div className="withholding-report-filters"><RangePicker value={dateRange} onChange={setDateRange} allowClear={false} /><Select allowClear value={taxType} onChange={setTaxType} placeholder={t("accounting.withholding_report_all_types")} options={["income", "vat", "ica"].map((value) => ({ value, label: t(`accounting.withholding_type_${value}`) }))} /><Button type="primary" icon={<CalculatorOutlined />} loading={loading} onClick={load}>{t("accounting.withholding_report_consult")}</Button></div>
            <Row gutter={[12, 12]} className="mb-5">{[["base", "withholding_report_total_base"], ["withheld", "withholding_report_caused"], ["reversed", "withholding_report_reversed"], ["net", "withholding_report_current"]].map(([key, label]) => <Col xs={12} lg={6} key={key}><div className={`withholding-report-kpi withholding-report-kpi--${key}`}><span>{t(`accounting.${label}`)}</span><strong>{formatCurrency(report.totals?.[key] || 0)}</strong></div></Col>)}</Row>
            <Table className="module-dark-table" loading={loading} rowKey="id" columns={columns} dataSource={report.rows || []} scroll={{ x: 1180 }} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div><strong>{t("accounting.withholding_report_empty_title")}</strong><p>{t("accounting.withholding_report_empty_desc")}</p></div>} /> }} />
        </Card>
        <Drawer rootClassName="accounting-drawer" className="withholding-certificate-drawer" width={isMobile ? "100%" : 620} open={Boolean(certificate)} onClose={() => setCertificate(null)} title={t("accounting.withholding_certificate_title")} extra={<Button type="primary" icon={<FileTextOutlined />} loading={pdfLoading} onClick={downloadCertificate}>{t("accounting.withholding_certificate_download")}</Button>}>
            {certificate && <div className="withholding-certificate" id="withholding-certificate-print"><div className="withholding-certificate__brand"><span>OHNIX</span><small>{t("accounting.withholding_certificate_generated")}</small></div><h2>{t("accounting.withholding_certificate_heading")}</h2><p>{t("accounting.withholding_certificate_period", { year: certificate.year })}</p><div className="withholding-certificate__party"><span>{t("accounting.withholding_certificate_withholder")}</span><strong>{certificate.company?.legalName || certificate.company?.name || t("accounting.withholding_certificate_company_missing")}</strong><small>{certificate.company?.taxIdentification ? `NIT ${certificate.company.taxIdentification}${certificate.company.taxIdentificationDv ? `-${certificate.company.taxIdentificationDv}` : ""}` : t("accounting.withholding_certificate_nit_missing")}</small></div><div className="withholding-certificate__party"><span>{t("accounting.withholding_report_supplier")}</span><strong>{certificate.supplier.name}</strong><small>{certificate.supplier.identification || "—"}</small></div><Row gutter={[12, 12]}>{certificate.by_type.map((item) => <Col span={24} key={item.tax_type}><div className="withholding-certificate__line"><div><strong>{t(`accounting.withholding_type_${item.tax_type}`)}</strong><small>{t("accounting.withholding_certificate_documents", { count: item.documents })}</small></div><div><span>{t("accounting.withholding_report_current")}</span><strong>{formatCurrency(item.net)}</strong></div></div></Col>)}</Row><div className="withholding-certificate__total"><span>{t("accounting.withholding_certificate_total")}</span><strong>{formatCurrency(certificate.totals.net || 0)}</strong></div>{!certificate.company?.taxIdentification && <Alert className="dark-alert dark-alert-amber mt-5" type="warning" showIcon message={t("accounting.withholding_certificate_complete_company")} />}<Alert className="dark-alert dark-alert-teal mt-5" type="info" showIcon message={t("accounting.withholding_certificate_notice")} /></div>}
        </Drawer>
    </>;
};

// NOT a certified DIAN exógena file - see exogenaReport.service.js's own
// comment. This groups what Ohnix already has (pagos por proveedor,
// retenciones por concepto) the way Formato 1001 asks for it, as a starting
// point for whoever actually files the exógena - the disclaimer below is
// deliberately not collapsible/dismissable the way other Alerts here are.
const ExogenaReportCard = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [year, setYear] = useState(dayjs().year() - 1);
    const [report, setReport] = useState({ suppliers: [], totals: {} });
    const [loading, setLoading] = useState(false);

    const load = async (targetYear = year) => {
        setLoading(true);
        try {
            const response = await accountingService.getExogenaReport(targetYear);
            setReport(response?.data || { suppliers: [], totals: {} });
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const exportExogena = () => {
        const header = [t("accounting.exogena_col_document"), t("accounting.exogena_col_supplier"), t("accounting.exogena_col_total_payments"), t("accounting.withholding_concept"), t("accounting.exogena_col_concept_code"), t("accounting.withholding_report_base"), t("accounting.exogena_col_withheld")];
        const rows = report.suppliers.flatMap((supplier) =>
            supplier.retentions.length > 0
                ? supplier.retentions.map((retention) => [supplier.document || "", supplier.name, supplier.total_payments, retention.concept_name, retention.concept_code, retention.base_amount, retention.withheld_amount])
                : [[supplier.document || "", supplier.name, supplier.total_payments, "", "", "", ""]]
        );
        exportAccountingExcel(`informacion-exogena-${year}.xlsx`, [{ name: t("accounting.exogena_title"), rows: [header, ...rows] }]);
    };

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.exogena_title")}>
            <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.exogena_disclaimer")} />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <Select
                    className="w-full sm:w-40"
                    value={year}
                    onChange={(value) => { setYear(value); load(value); }}
                    options={Array.from({ length: 6 }, (_, i) => dayjs().year() - i).map((y) => ({ value: y, label: y }))}
                />
                <Button type="primary" icon={<CalendarOutlined />} loading={loading} onClick={() => load()}>{t("reports.refresh_report")}</Button>
                <Button icon={<DownloadOutlined />} disabled={!report.suppliers.length} onClick={exportExogena}>{t("reports.export_to_excel")}</Button>
            </div>
            <Row gutter={[16, 16]} className="mb-4">
                <Col xs={24} sm={12}><StatCard title={t("accounting.exogena_col_total_payments")} value={report.totals?.total_payments || 0} formatter={formatCurrency} /></Col>
                <Col xs={24} sm={12}><StatCard title={t("accounting.exogena_col_withheld")} value={report.totals?.total_withheld || 0} formatter={formatCurrency} /></Col>
            </Row>
            <Table
                className="module-dark-table"
                loading={loading}
                rowKey="supplier_id"
                dataSource={report.suppliers}
                pagination={{ pageSize: 10 }}
                scroll={{ x: "max-content" }}
                locale={{ emptyText: <EmptyState compact title={t("common.no_data")} subtitle={t("accounting.exogena_empty_help")} /> }}
                columns={[
                    { title: t("accounting.exogena_col_supplier"), dataIndex: "name", render: (value, row) => <div><strong>{value}</strong><small className="block text-[var(--ohnix-text-dim)]">{row.document || "—"}</small></div> },
                    { title: t("accounting.exogena_col_total_payments"), dataIndex: "total_payments", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.exogena_col_withheld"), dataIndex: "total_withheld", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.withholding_concept"), render: (_, row) => row.retentions.length ? row.retentions.map((r) => <Tag key={r.concept_code} className="mb-1">{r.concept_name}: {formatCurrency(r.withheld_amount)}</Tag>) : "—" },
                ]}
                expandable={{
                    rowExpandable: (row) => row.retentions.length > 0,
                    expandedRowRender: (row) => (
                        <Table
                            className="module-dark-table"
                            size="small"
                            pagination={false}
                            rowKey="concept_code"
                            dataSource={row.retentions}
                            columns={[
                                { title: t("accounting.exogena_col_concept_code"), dataIndex: "concept_code", width: 100 },
                                { title: t("accounting.withholding_concept"), dataIndex: "concept_name" },
                                { title: t("accounting.withholding_report_base"), dataIndex: "base_amount", align: "right", render: (v) => formatCurrency(v) },
                                { title: t("accounting.exogena_col_withheld"), dataIndex: "withheld_amount", align: "right", render: (v) => formatCurrency(v) },
                            ]}
                        />
                    ),
                }}
            />
        </Card>
    );
};

// Records which income-tax regime (Ordinario vs RST) and, for RST, which
// Art. 908 ET activity group applies - RentaReportCard reads this indirectly
// through the server (rentaDeclaration.service.js), it never recomputes it
// client-side. Same "configuration fact the user enters, ideally with their
// accountant" convention as WithholdingConfigCard below.
const TaxRegimeConfigCard = () => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await companyService.getMyCompany();
            const company = res?.data?.company || res?.data || null;
            form.setFieldsValue({
                taxRegime: company?.taxRegime || undefined,
                simpleRegimeGroup: company?.simpleRegimeGroup || undefined,
            });
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async (values) => {
        setSaving(true);
        try {
            await companyService.updateMyCompany(values);
            toast.success(t("accounting.taxes_config_saved"));
        } catch (err) {
            toast.error(accountingErrorMessage(err, t));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.renta_config_title")} loading={loading}>
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("accounting.renta_config_desc")}</p>
            <Form form={form} layout="vertical" onFinish={handleSave} disabled={loading || saving}>
                <Row gutter={16}>
                    <Col xs={24} sm={12}>
                        <Form.Item name="taxRegime" label={t("accounting.renta_regime_label")} extra={t("accounting.renta_regime_hint")}>
                            <Select allowClear placeholder={t("accounting.renta_regime_placeholder")} options={["ordinario", "simple"].map((value) => ({ value, label: t(`accounting.renta_regime_${value}`) }))} />
                        </Form.Item>
                    </Col>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.taxRegime !== next.taxRegime}>
                        {({ getFieldValue }) => getFieldValue("taxRegime") === "simple" && (
                            <Col xs={24} sm={12}>
                                <Form.Item name="simpleRegimeGroup" label={t("accounting.renta_simple_group_label")} extra={t("accounting.renta_simple_group_hint")}>
                                    <Select allowClear placeholder={t("accounting.renta_simple_group_placeholder")} options={["group1", "group2", "group3", "group4"].map((value) => ({ value, label: t(`accounting.renta_simple_${value}`) }))} />
                                </Form.Item>
                            </Col>
                        )}
                    </Form.Item>
                </Row>
                <Button type="primary" htmlType="submit" loading={saving}>{t("common.save")}</Button>
            </Form>
        </Card>
    );
};

// NOT a certified DIAN filing - every number here is a server-computed
// estimate (rentaDeclaration.service.js), with `rates_verified` surfacing
// whether an accountant has confirmed the underlying rate/bracket table yet
// (see IncomeTaxYearConfig/SimpleRegimeBracket's schema comments). The
// disclaimer Alert at the bottom is deliberately not collapsible, same
// convention as ExogenaReportCard's.
const RentaReportCard = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [year, setYear] = useState(dayjs().year() - 1);
    const [adjustments, setAdjustments] = useState(0);
    const [declaration, setDeclaration] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);

    const load = async (targetYear = year, targetAdjustments = adjustments) => {
        setLoading(true);
        try {
            const response = await accountingService.getRentaDeclaration({ year: targetYear, manualAdjustments: targetAdjustments });
            setDeclaration(response?.data || null);
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const downloadPdf = async () => {
        setPdfLoading(true);
        try {
            await accountingService.downloadRentaDeclarationPdf({ year, manualAdjustments: adjustments });
        } catch (error) {
            toast.error(accountingErrorMessage(error, t));
        } finally { setPdfLoading(false); }
    };

    const exportExcel = () => {
        if (!declaration?.configured) return;
        const rateInfo = declaration.ordinary
            ? [[t("accounting.renta_col_tarifa"), `${declaration.ordinary.rate_percent}%`], [t("accounting.renta_col_impuesto_estimado"), declaration.ordinary.estimated_tax], [t("accounting.renta_col_withholdings_suffered"), declaration.ordinary.withholdings_suffered], [t("accounting.renta_col_anticipo"), declaration.ordinary.anticipo.amount], [t("accounting.renta_col_balance_due"), declaration.ordinary.balance_due]]
            : declaration.simple
                ? [[t("accounting.renta_col_tarifa"), `${declaration.simple.bracket.rate_percent}%`], [t("accounting.renta_col_impuesto_estimado"), declaration.simple.estimated_tax]]
                : [];
        const rows = [
            [t("accounting.renta_col_patrimonio_bruto"), declaration.patrimonio_bruto],
            [t("accounting.renta_col_patrimonio_liquido"), declaration.patrimonio_liquido],
            [t("accounting.renta_col_ingresos"), declaration.total_revenue],
            [t("accounting.renta_col_costos"), declaration.total_costs],
            [t("accounting.renta_col_gastos"), declaration.total_expenses],
            [t("accounting.renta_col_utilidad_contable"), declaration.net_income],
            [t("accounting.renta_col_ajustes"), declaration.manual_adjustments],
            [t("accounting.renta_col_renta_liquida"), declaration.taxable_income],
            ...rateInfo,
        ];
        exportAccountingExcel(`declaracion-renta-estimada-${year}.xlsx`, [{ name: t("accounting.renta_title"), rows }]);
    };

    const notConfiguredMessage = () => {
        const reason = declaration?.reason;
        if (reason === "tax_regime_not_set") return t("accounting.renta_not_configured_regime");
        if (reason === "simple_regime_group_missing") return t("accounting.renta_not_configured_group");
        if (reason === "year_config_missing" || reason === "brackets_missing") return t("accounting.renta_not_configured_year", { year });
        return t("accounting.renta_not_configured_generic");
    };

    const estimatedTax = declaration?.ordinary?.estimated_tax ?? declaration?.simple?.estimated_tax ?? 0;

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={<span className="flex items-center gap-2"><CalculatorOutlined className="text-[var(--ohnix-accent)]" />{t("accounting.renta_title")}</span>}>
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("accounting.renta_desc")}</p>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <label className="block text-xs text-[var(--ohnix-text-dim)] mb-1">{t("accounting.renta_year_label")}</label>
                    <Select value={year} style={{ width: 120 }} onChange={(value) => { setYear(value); load(value, adjustments); }} options={Array.from({ length: 6 }, (_, i) => dayjs().year() - i).map((y) => ({ value: y, label: y }))} />
                </div>
                <div>
                    <label className="block text-xs text-[var(--ohnix-text-dim)] mb-1">{t("accounting.renta_adjustments_label")}</label>
                    <InputNumber value={adjustments} onChange={(value) => setAdjustments(value || 0)} className="w-48" />
                </div>
                <Button type="primary" icon={<CalculatorOutlined />} loading={loading} onClick={() => load(year, adjustments)}>{t("accounting.renta_calculate")}</Button>
            </div>

            {declaration && !declaration.configured && (
                <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={notConfiguredMessage()} />
            )}

            {declaration?.configured && (
                <>
                    {!declaration.rates_verified && (
                        <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.renta_unverified_notice")} />
                    )}
                    <Row gutter={[12, 12]} className="mb-4">
                        <Col xs={12} lg={6}><StatCard title={t("accounting.renta_col_patrimonio_bruto")} value={declaration.patrimonio_bruto} formatter={formatCurrency} /></Col>
                        <Col xs={12} lg={6}><StatCard title={t("accounting.renta_col_patrimonio_liquido")} value={declaration.patrimonio_liquido} formatter={formatCurrency} /></Col>
                        <Col xs={12} lg={6}><StatCard title={t("accounting.renta_col_renta_liquida")} value={declaration.taxable_income} formatter={formatCurrency} /></Col>
                        <Col xs={12} lg={6}><StatCard title={t("accounting.renta_col_impuesto_estimado")} value={estimatedTax} formatter={formatCurrency} valueStyle={{ fontWeight: 700, color: "var(--ohnix-status-warning)" }} /></Col>
                    </Row>
                    {declaration.ordinary && (
                        <Row gutter={[12, 12]} className="mb-4">
                            <Col xs={12} lg={8}><StatCard title={t("accounting.renta_col_withholdings_suffered")} value={declaration.ordinary.withholdings_suffered} formatter={formatCurrency} /></Col>
                            <Col xs={12} lg={8}><StatCard title={t("accounting.renta_col_anticipo")} value={declaration.ordinary.anticipo.amount} formatter={formatCurrency} /></Col>
                            <Col xs={24} lg={8}><StatCard title={t(declaration.ordinary.balance_due < 0 ? "accounting.renta_col_balance_favor" : "accounting.renta_col_balance_due")} value={Math.abs(declaration.ordinary.balance_due)} formatter={formatCurrency} valueStyle={{ fontWeight: 700 }} /></Col>
                        </Row>
                    )}
                    <div className="flex gap-2 mb-2">
                        <Button icon={<FileTextOutlined />} loading={pdfLoading} onClick={downloadPdf}>{t("accounting.renta_download_pdf")}</Button>
                        <Button icon={<DownloadOutlined />} onClick={exportExcel}>{t("reports.export_to_excel")}</Button>
                    </div>
                </>
            )}
            <Alert className="dark-alert dark-alert-teal mt-3" type="info" showIcon message={t("accounting.renta_disclaimer")} />
        </Card>
    );
};

const WithholdingConfigCard = () => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await companyService.getMyCompany();
            const company = res?.data?.company || res?.data || null;
            form.setFieldsValue({
                isWithholdingAgent: company?.isWithholdingAgent || false,
                icaMunicipalityCode: company?.icaMunicipalityCode || undefined,
                icaActivityCode: company?.icaActivityCode || undefined,
                icaRatePerThousand: company?.icaRatePerThousand ?? undefined,
            });
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async (values) => {
        setSaving(true);
        try {
            await companyService.updateMyCompany(values);
            toast.success(t("accounting.taxes_config_saved"));
        } catch (err) {
            toast.error(accountingErrorMessage(err, t));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card
            className="module-shell border border-[var(--ohnix-line-4)]"
            title={t("accounting.taxes_withholding_config_title")}
            extra={<Tag icon={<CheckCircleOutlined />} color="success">{t("accounting.withholding_engine_active")}</Tag>}
            loading={loading}
        >
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("accounting.taxes_withholding_config_desc")}</p>
            <Form form={form} layout="vertical" onFinish={handleSave} disabled={loading || saving}>
                <Form.Item
                    name="isWithholdingAgent"
                    label={t("accounting.taxes_is_withholding_agent_label")}
                    valuePropName="checked"
                    extra={t("accounting.taxes_is_withholding_agent_hint")}
                >
                    <Switch />
                </Form.Item>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] mb-2 mt-2">{t("accounting.taxes_reteica_title")}</p>
                <Row gutter={16}>
                    <Col xs={24} sm={8}>
                        <Form.Item
                            name="icaMunicipalityCode"
                            label={t("accounting.taxes_ica_municipality_label")}
                            extra={t("accounting.taxes_ica_municipality_hint")}
                            rules={[{ pattern: /^\d{5}$/, message: t("accounting.taxes_ica_municipality_error") }]}
                        >
                            <Input placeholder="11001" maxLength={5} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Form.Item
                            name="icaActivityCode"
                            label={t("accounting.taxes_ica_activity_label")}
                            extra={t("accounting.taxes_ica_activity_hint")}
                            rules={[{ pattern: /^\d{4}$/, message: t("accounting.taxes_ica_activity_error") }]}
                        >
                            <Input placeholder="4711" maxLength={4} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Form.Item
                            name="icaRatePerThousand"
                            label={t("accounting.taxes_ica_rate_label")}
                            extra={t("accounting.taxes_ica_rate_hint")}
                        >
                            <InputNumber className="w-full" min={0} max={50} step={0.1} placeholder="6.9" />
                        </Form.Item>
                    </Col>
                </Row>
                <Button type="primary" htmlType="submit" loading={saving}>
                    {t("common.save")}
                </Button>
            </Form>
        </Card>
    );
};

const TaxesTab = () => {
    const { t } = useI18n();
    return (
        <div className="space-y-6">
            <AccountingSectionGuide sectionKey="taxes" title={t("accounting.guide_taxes_title")} summary={t("accounting.tab_taxes_caption")} steps={[t("accounting.guide_taxes_step_1"), t("accounting.guide_taxes_step_2"), t("accounting.guide_taxes_step_3")]} result={t("accounting.guide_taxes_result")} concepts={[{ label: t("accounting.taxes_vat_title"), help: t("accounting.guide_tax_vat_help") }, { label: t("accounting.withholding_concepts_title"), help: t("accounting.guide_withholding_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.taxes_vat_title")}>
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-3">{t("accounting.taxes_vat_desc")}</p>
                <Link to="/reports">
                    <Button icon={<ArrowRightOutlined />}>{t("accounting.taxes_vat_link")}</Button>
                </Link>
            </Card>
            <VatSettlementCard />
            <WithholdingConfigCard />
            <WithholdingConceptsCard />
            <WithholdingReportCard />
            <ExogenaReportCard />
            <TaxRegimeConfigCard />
            <RentaReportCard />
            <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.taxes_professional_review_notice")} />
        </div>
    );
};

// Balance de comprobación: every account with its opening balance, this
// period's debit/credit movement, and closing balance - the "does
// everything still tie out" check, distinct from the Estados Financieros
// tab which only shows one slice of the chart (revenue/cost/expense or
// asset/liability/equity) at a time.
const BudgetsTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const [form] = Form.useForm();
    const [period, setPeriod] = useState(dayjs());
    const [view, setView] = useState("month");
    const [dimension, setDimension] = useState("all");
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [report, setReport] = useState({ rows: [], summary: {} });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editor, setEditor] = useState(null);
    const showBudgetError = (error) => toast.error(accountingErrorMessage(error, t));

    const load = async ({ nextPeriod = period, nextDimension = dimension, nextView = view, refreshCatalogs = false } = {}) => {
        setLoading(true);
        try {
            const requests = [nextView === "year" ? accountingService.getAnnualBudgetReport({ year: nextPeriod.year(), costCenterId: nextDimension }) : accountingService.getBudgetReport({ year: nextPeriod.year(), month: nextPeriod.month() + 1, costCenterId: nextDimension })];
            if (refreshCatalogs || accounts.length === 0) requests.push(accountingService.listChartOfAccounts(), accountingService.listCostCenters());
            const [reportResponse, accountResponse, centerResponse] = await Promise.all(requests);
            setReport(reportResponse?.data || { rows: [], summary: {} });
            if (accountResponse) setAccounts((accountResponse.data || []).filter((account) => account.is_active && ["revenue", "cost", "expense"].includes(account.account_type)));
            if (centerResponse) setCostCenters(centerResponse.data || []);
        } catch (error) { showBudgetError(error); }
        finally { setLoading(false); }
    };
    useEffect(() => { load({ refreshCatalogs: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const changePeriod = (value) => { if (value) { setPeriod(value); load({ nextPeriod: value }); } };
    const changeView = (value) => { setView(value); setEditor(null); load({ nextView: value }); };
    const changeDimension = (value) => { const next = value || "all"; setDimension(next); load({ nextDimension: next }); };
    const openEditor = (row = null) => {
        setEditor(row || {});
        form.setFieldsValue({ chart_account_id: row?.chart_account?.id, cost_center_id: row ? row.cost_center?.id : dimension === "all" ? undefined : dimension, amount: row?.budget, alert_threshold_percent: row?.alert_threshold_percent ?? 10 });
    };
    const openAnnualEditor = (row = null) => {
        setEditor({ annual: true, row });
        form.setFieldsValue({ chart_account_id: row?.chart_account?.id, cost_center_id: row ? row.cost_center?.id : dimension === "all" ? undefined : dimension, annual_amount: row?.budget, alert_threshold_percent: row?.months?.find(Boolean)?.alert_threshold_percent ?? 10 });
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editor?.annual) await accountingService.distributeAnnualBudget({ year: period.year(), ...values });
            else await accountingService.saveBudgets({ year: period.year(), month: period.month() + 1, items: [values] });
            toast.success(t("accounting.budget_saved"));
            setEditor(null);
            const nextDimension = values.cost_center_id || "all";
            setDimension(nextDimension);
            await load({ nextDimension });
        } catch (error) { if (!error?.errorFields) showBudgetError(error); }
        finally { setSaving(false); }
    };
    const copyPreviousYear = async () => {
        setSaving(true);
        try {
            const response = await accountingService.copyAnnualBudget({ source_year: period.year() - 1, target_year: period.year(), cost_center_id: dimension });
            toast.success(t("accounting.budget_copy_success", { copied: response?.data?.copied || 0, skipped: response?.data?.skipped || 0 }));
            await load();
        } catch (error) { showBudgetError(error); }
        finally { setSaving(false); }
    };
    const remove = async (id) => {
        try { await accountingService.deleteBudget(id); toast.success(t("accounting.budget_deleted")); await load(); }
        catch (error) { showBudgetError(error); }
    };
    const statusTag = (status) => status === "behind" ? <Tag color="orange">{t("accounting.budget_status_behind")}</Tag> : status === "over" ? <Tag color="red">{t("accounting.budget_status_over")}</Tag> : <Tag color="green">{t("accounting.budget_status_on_track")}</Tag>;
    const summary = report.summary || {};

    return <>
        <AccountingSectionGuide sectionKey="budgets" title={t("accounting.guide_budgets_title")} summary={t("accounting.tab_budgets_caption")} steps={[t("accounting.guide_budgets_step_1"), t("accounting.guide_budgets_step_2"), t("accounting.guide_budgets_step_3")]} result={t("accounting.guide_budgets_result")} concepts={[{ label: t("accounting.budget_variance"), help: t("accounting.budget_variance_help") }, { label: t("accounting.budget_threshold"), help: t("accounting.budget_threshold_help") }]} />
        <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4"><div className="flex flex-col sm:flex-row sm:items-center gap-3"><Select value={view} onChange={changeView} className="w-full sm:w-40" options={[{ value: "month", label: t("accounting.budget_monthly_view") }, { value: "year", label: t("accounting.budget_annual_view") }]} /><DatePicker picker={view === "year" ? "year" : "month"} value={period} onChange={changePeriod} allowClear={false} className="w-full sm:w-auto" /><Select value={dimension} onChange={changeDimension} className="w-full sm:w-64" options={[{ value: "all", label: t("accounting.budget_company_wide") }, ...costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))]} />{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => view === "year" ? openAnnualEditor() : openEditor()}>{view === "year" ? t("accounting.budget_distribute") : t("accounting.budget_new")}</Button>}{canEdit && view === "year" && <Popconfirm title={t("accounting.budget_copy_confirm", { year: period.year() - 1 })} onConfirm={copyPreviousYear}><Button loading={saving}>{t("accounting.budget_copy_previous")}</Button></Popconfirm>}</div></Card>
        <Row gutter={[16, 16]} className="mb-4"><Col xs={24} sm={12} lg={6}><StatCard title={t("accounting.budget_planned_revenue")} value={summary.planned_revenue || 0} formatter={formatCurrency} /></Col><Col xs={24} sm={12} lg={6}><StatCard title={t("accounting.budget_actual_revenue")} value={summary.actual_revenue || 0} formatter={formatCurrency} /></Col><Col xs={24} sm={12} lg={6}><StatCard title={t("accounting.budget_planned_spend")} value={summary.planned_spend || 0} formatter={formatCurrency} /></Col><Col xs={24} sm={12} lg={6}><StatCard title={t("accounting.budget_actual_spend")} value={summary.actual_spend || 0} formatter={formatCurrency} /></Col></Row>
        {summary.alert_count > 0 && <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.budget_alert_banner", { count: summary.alert_count })} />}
        <Table className="module-dark-table" loading={loading} rowKey={(row) => row.id || `${row.chart_account.id}:${row.cost_center?.id || "all"}`} dataSource={report.rows || []} scroll={{ x: view === "year" ? 2200 : 1050 }} pagination={{ pageSize: 15 }} locale={{ emptyText: <EmptyState compact title={t("accounting.empty_budgets_title")} subtitle={t("accounting.empty_budgets_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => view === "year" ? openAnnualEditor() : openEditor()}>{view === "year" ? t("accounting.budget_distribute") : t("accounting.budget_new")}</Button> : null} /> }} columns={view === "year" ? [
            { title: t("accounting.col_account"), fixed: "left", width: 220, render: (_, row) => `${row.chart_account.code} · ${row.chart_account.name}` },
            { title: t("accounting.budget_annual_total"), dataIndex: "budget", align: "right", width: 140, render: formatCurrency },
            { title: t("accounting.budget_actual"), dataIndex: "actual", align: "right", width: 140, render: formatCurrency },
            { title: t("accounting.budget_variance"), dataIndex: "variance", align: "right", width: 140, render: formatCurrency },
                            ...Array.from({ length: 12 }, (_, index) => ({ title: dayjs().month(index).format("MMM"), width: 135, render: (_, row) => { const item = row.months[index]; return item ? <Tooltip title={`${t("accounting.budget_actual")}: ${formatCurrency(item.actual)}`}><span className={item.alert ? "text-[var(--ohnix-status-danger)]" : ""}>{formatCurrency(item.budget)}{item.alert ? " ⚠" : ""}</span></Tooltip> : "—"; } })),
            ...(canEdit ? [{ title: t("common.actions"), fixed: "right", width: 100, render: (_, row) => <Button size="small" onClick={() => openAnnualEditor(row)}>{t("common.edit")}</Button> }] : []),
        ] : [
            { title: t("accounting.col_account"), render: (_, row) => `${row.chart_account.code} · ${row.chart_account.name}` },
            { title: t("accounting.cost_center"), render: (_, row) => row.cost_center ? `${row.cost_center.code} · ${row.cost_center.name}` : t("accounting.budget_company_wide") },
            { title: t("accounting.budget_amount"), dataIndex: "budget", align: "right", render: formatCurrency },
            { title: t("accounting.budget_actual"), dataIndex: "actual", align: "right", render: formatCurrency },
            { title: t("accounting.budget_variance"), dataIndex: "variance", align: "right", render: formatCurrency },
            { title: t("accounting.budget_execution"), width: 150, render: (_, row) => <Progress percent={Math.max(0, Math.min(100, row.achievement_percent ?? 0))} size="small" status={row.alert ? "exception" : "normal"} format={() => row.achievement_percent == null ? "—" : `${row.achievement_percent}%`} /> },
            { title: t("accounting.col_status"), dataIndex: "status", render: statusTag },
            ...(canEdit ? [{ title: t("common.actions"), width: 150, render: (_, row) => <div className="flex gap-2"><Button size="small" onClick={() => openEditor(row)}>{t("common.edit")}</Button><Popconfirm title={t("accounting.budget_delete_confirm")} onConfirm={() => remove(row.id)}><Button size="small" danger>{t("common.delete")}</Button></Popconfirm></div> }] : []),
        ]} />
        <Modal className="accounting-modal" open={Boolean(editor)} title={editor?.annual ? t("accounting.budget_distribute") : editor?.id ? t("accounting.budget_edit") : t("accounting.budget_new")} onCancel={() => setEditor(null)} onOk={save} confirmLoading={saving} destroyOnHidden><Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={editor?.annual ? t("accounting.budget_annual_form_help") : t("accounting.budget_form_help")} /><Form form={form} layout="vertical"><Form.Item name="chart_account_id" label={t("accounting.col_account")} rules={[{ required: true }]}><Select disabled={Boolean(editor?.id || editor?.row)} showSearch optionFilterProp="label" options={accounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} /></Form.Item><Form.Item name="cost_center_id" label={t("accounting.cost_center_optional")} extra={t("accounting.budget_global_help")}><Select disabled={Boolean(editor?.id || editor?.row)} allowClear showSearch optionFilterProp="label" options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} /></Form.Item>{editor?.annual ? <Form.Item name="annual_amount" label={t("accounting.budget_annual_amount")} rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-full" /></Form.Item> : <Form.Item name="amount" label={t("accounting.budget_amount")} rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>}<Form.Item name="alert_threshold_percent" label={t("accounting.budget_threshold")} extra={t("accounting.budget_threshold_help")} rules={[{ required: true }]}><InputNumber min={0} max={1000} precision={2} addonAfter="%" className="w-full" /></Form.Item></Form></Modal>
    </>;
};

const TrialBalanceTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().startOf("month"), dayjs()]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [costCenters, setCostCenters] = useState([]);
    const [costCenterId, setCostCenterId] = useState();

    const fetchRows = async () => {
        setLoading(true);
        try {
            const res = await accountingService.getTrialBalance({
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
                costCenterId,
            });
            setRows(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        accountingService.listCostCenters().then((response) => setCostCenters(response?.data || [])).catch(() => {});
        fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totals = rows.reduce(
        (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
        { debit: 0, credit: 0 }
    );

    const columns = [
        { title: t("accounting.col_code"), dataIndex: "code", key: "code", width: 100 },
        { title: t("accounting.col_name"), dataIndex: "name", key: "name" },
        { title: <ContextLabel help={t("accounting.guide_opening_help")}>{t("accounting.trial_balance_col_opening")}</ContextLabel>, dataIndex: "opening_balance", key: "opening_balance", align: "right", render: (v) => formatCurrency(v) },
        { title: <ContextLabel help={t("accounting.guide_debit_help")}>{t("accounting.lines_col_debit")}</ContextLabel>, dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: <ContextLabel help={t("accounting.guide_credit_help")}>{t("accounting.lines_col_credit")}</ContextLabel>, dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: <ContextLabel help={t("accounting.guide_closing_help")}>{t("accounting.trial_balance_col_closing")}</ContextLabel>, dataIndex: "closing_balance", key: "closing_balance", align: "right", render: (v) => <strong>{formatCurrency(v)}</strong> },
    ];

    const exportTrialBalance = () => {
        const header = [t("accounting.col_code"), t("accounting.col_name"), t("accounting.trial_balance_col_opening"), t("accounting.lines_col_debit"), t("accounting.lines_col_credit"), t("accounting.trial_balance_col_closing")];
        const rows_ = rows.map((r) => [r.code, r.name, r.opening_balance, r.debit, r.credit, r.closing_balance]);
        rows_.push(["", t("common.total"), "", totals.debit, totals.credit, ""]);
        exportAccountingExcel(`balance-comprobacion-${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}.xlsx`, [{ name: t("accounting.tab_trial_balance"), rows: [header, ...rows_] }]);
    };

    return (
        <>
            <AccountingSectionGuide sectionKey="trial-balance" title={t("accounting.guide_trial_title")} summary={t("accounting.tab_trial_balance_caption")} steps={[t("accounting.guide_trial_step_1"), t("accounting.guide_trial_step_2")]} result={t("accounting.guide_trial_result")} concepts={[{ label: t("accounting.trial_balance_col_opening"), help: t("accounting.guide_opening_help") }, { label: t("accounting.trial_balance_col_closing"), help: t("accounting.guide_closing_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} format="YYYY-MM-DD" allowClear={false} className="w-full sm:w-auto" />
                    <Select allowClear showSearch optionFilterProp="label" className="w-full sm:w-64" placeholder={t("accounting.cost_center_all")} value={costCenterId} onChange={setCostCenterId} options={costCenters.map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} />
                    <Button type="primary" className="hover:shadow-[var(--ohnix-accent-glow-hover)] w-full sm:w-auto" icon={<CalendarOutlined />} onClick={fetchRows} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                    <Button className="w-full sm:w-auto" icon={<DownloadOutlined />} disabled={!rows.length} onClick={exportTrialBalance}>
                        {t("reports.export_to_excel")}
                    </Button>
                </div>
            </Card>
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={columns}
                    dataSource={rows}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    className="module-dark-table"
                    scroll={{ x: "max-content" }}
                    size={isMobile ? "small" : "middle"}
                    locale={{ emptyText: <EmptyState compact title={t("accounting.no_chart_accounts")} subtitle={t("accounting.empty_chart_help")} /> }}
                    summary={() =>
                        rows.length > 0 && (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={3}>{t("accounting.trial_balance_totals_row")}</Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><strong>{formatCurrency(totals.debit)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right"><strong>{formatCurrency(totals.credit)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={3} />
                            </Table.Summary.Row>
                        )
                    }
                />
            </Card>
        </>
    );
};

const OpeningBalanceTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [form] = Form.useForm();
    const [accounts, setAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [saving, setSaving] = useState(false);
    const [created, setCreated] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState("");
    const lines = Form.useWatch("lines", form) || [];
    useEffect(() => {
        Promise.all([accountingService.listChartOfAccounts(), accountingService.listCostCenters()])
            .then(([accountResponse, costCenterResponse]) => {
                setAccounts(accountResponse?.data || []);
                setCostCenters(costCenterResponse?.data || []);
            })
            .catch(() => { setAccounts([]); setCostCenters([]); });
    }, []);
    const totals = lines.reduce((sum, line) => ({ debit: sum.debit + Number(line?.debit || 0), credit: sum.credit + Number(line?.credit || 0) }), { debit: 0, credit: 0 });
    const balanced = Math.abs(totals.debit - totals.credit) < 0.005 && totals.debit > 0;
    const normalizeHeader = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "");
    const parseImportAmount = (value) => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        const raw = String(value ?? "").trim().replace(/\s/g, "");
        if (!raw) return 0;
        const normalized = raw.includes(",") && raw.includes(".")
            ? (raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""))
            : raw.replace(",", ".");
        const amount = Number(normalized);
        return Number.isFinite(amount) && amount >= 0 ? amount : 0;
    };
    const importOpeningFile = async (file) => {
        setImporting(true); setImportError("");
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (!rows.length) throw new Error(t("accounting.opening_balance_import_empty"));
            const byCode = new Map(accounts.map((account) => [String(account.code), account]));
            const costCenterByCode = new Map(costCenters.map((center) => [String(center.code), center]));
            const imported = rows.map((row, index) => {
                const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
                const code = String(normalized.codigo || normalized.code || "").trim();
                const account = byCode.get(code);
                if (!account || !account.is_active) throw new Error(t("accounting.opening_balance_import_row_invalid", { row: index + 2 }));
                const costCenterCode = String(normalized.centrocosto || normalized.costcenter || normalized.costcentercode || "").trim();
                const costCenter = costCenterCode ? costCenterByCode.get(costCenterCode) : null;
                if (costCenterCode && (!costCenter || !costCenter.is_active)) throw new Error(t("accounting.opening_balance_import_cost_center_invalid", { row: index + 2 }));
                const debit = parseImportAmount(normalized.debito || normalized.debit || 0);
                const credit = parseImportAmount(normalized.credito || normalized.credit || 0);
                const importedType = normalizeHeader(normalized.tipotercero || normalized.thirdpartytype || "");
                const thirdPartyType = ({ cliente: "customer", customer: "customer", proveedor: "supplier", supplier: "supplier", otro: "other", other: "other" })[importedType];
                if (importedType && !thirdPartyType) throw new Error(t("accounting.opening_balance_import_third_party_invalid", { row: index + 2 }));
                const thirdPartyName = String(normalized.tercero || normalized.nombretercero || normalized.thirdparty || normalized.thirdpartyname || "").trim();
                const thirdPartyDocument = String(normalized.documentotercero || normalized.thirdpartydocument || "").trim();
                if ((thirdPartyType || thirdPartyDocument) && !thirdPartyName) throw new Error(t("accounting.opening_balance_import_third_party_name_required", { row: index + 2 }));
                return { chart_account_id: account._id, debit, credit, cost_center_id: costCenter?._id, third_party: thirdPartyType || thirdPartyName || thirdPartyDocument ? { type: thirdPartyType || "other", name: thirdPartyName, document: thirdPartyDocument || undefined } : undefined, description: String(normalized.descripcion || normalized.description || "").trim() || null };
            });
            form.setFieldsValue({ lines: imported });
        } catch (error) { setImportError(error.message || t("accounting.opening_balance_import_failed")); }
        finally { setImporting(false); }
        return false;
    };
    const save = async (values) => {
        setSaving(true);
        try {
            await accountingService.createOpeningBalance({ entry_date: values.entry_date.toISOString(), description: values.description, lines: values.lines });
            setCreated(true); toast.success(t("accounting.opening_balance_created"));
        } catch (error) { toast.error(accountingErrorMessage(error, t)); }
        finally { setSaving(false); }
    };
    return <>
        <AccountingSectionGuide sectionKey="opening-balance" title={t("accounting.opening_balance_title")} summary={t("accounting.opening_balance_summary")} steps={[t("accounting.opening_balance_step_1"), t("accounting.opening_balance_step_2"), t("accounting.opening_balance_step_3")]} result={t("accounting.opening_balance_result")} concepts={[{ label: t("accounting.lines_col_debit"), help: t("accounting.guide_debit_help") }, { label: t("accounting.lines_col_credit"), help: t("accounting.guide_credit_help") }]} />
        {created ? <Card className="module-shell"><EmptyState title={t("accounting.opening_balance_created_title")} subtitle={t("accounting.opening_balance_created_help")} action={<Button type="primary" onClick={() => { setCreated(false); form.resetFields(); }}>{t("accounting.opening_balance_new")}</Button>} /></Card> : <Card className="module-shell"><Form form={form} layout="vertical" initialValues={{ entry_date: dayjs(), lines: [{}, {}] }} onFinish={save}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Form.Item name="entry_date" label={t("accounting.opening_balance_date")} rules={[{ required: true, message: t("validation.required_field") }]}><DatePicker className="w-full" /></Form.Item><Form.Item name="description" label={t("accounting.col_description")} initialValue={t("accounting.opening_balance_default_description")}><Input /></Form.Item></div>
            <div className="flex flex-wrap items-center gap-3 mb-4"><Upload accept=".csv,.xlsx,.xls" showUploadList={false} beforeUpload={importOpeningFile} disabled={importing}><Button icon={<UploadOutlined />} loading={importing}>{t("accounting.opening_balance_import")}</Button></Upload><span className="text-xs text-[var(--ohnix-text-muted)]">{t("accounting.opening_balance_import_hint")}</span></div>
            {importError && <Alert className="mb-4" type="error" showIcon message={importError} />}
            <Form.List name="lines">{(fields, { add, remove }) => <div className="space-y-3">
                {fields.map((field, index) => <div key={field.key} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-4)] p-3">
                    <Row gutter={8} align="middle">
                        <Col xs={24} md={10}><Form.Item name={[field.name, "chart_account_id"]} label={index === 0 ? t("accounting.lines_col_account") : undefined} rules={[{ required: true, message: t("validation.required_field") }]}><Select showSearch optionFilterProp="label" options={accounts.filter((a) => a.is_active).map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} placeholder={t("accounting.opening_balance_account_placeholder")} /></Form.Item></Col>
                        <Col xs={12} md={5}><Form.Item name={[field.name, "debit"]} label={index === 0 ? t("accounting.lines_col_debit") : undefined}><InputNumber min={0} precision={2} className="w-full" /></Form.Item></Col>
                        <Col xs={12} md={5}><Form.Item name={[field.name, "credit"]} label={index === 0 ? t("accounting.lines_col_credit") : undefined}><InputNumber min={0} precision={2} className="w-full" /></Form.Item></Col>
                        <Col xs={24} md={4}>{fields.length > 2 ? <Button danger type="text" onClick={() => remove(field.name)}>{t("common.delete")}</Button> : <span />}</Col>
                    </Row>
                    <Row gutter={8}>
                        <Col xs={24} md={6}><Form.Item name={[field.name, "cost_center_id"]} label={index === 0 ? t("accounting.cost_center_optional") : undefined}><Select allowClear showSearch optionFilterProp="label" placeholder={t("accounting.cost_center_optional")} options={costCenters.filter((center) => center.is_active).map((center) => ({ value: center._id, label: `${center.code} · ${center.name}` }))} /></Form.Item></Col>
                        <Col xs={24} md={6}><Form.Item name={[field.name, "third_party", "type"]} label={index === 0 ? t("accounting.opening_balance_third_party_type") : undefined}><Select allowClear placeholder={t("accounting.opening_balance_third_party_type")} options={[{ value: "customer", label: t("accounting.third_party_customer") }, { value: "supplier", label: t("accounting.third_party_supplier") }, { value: "other", label: t("accounting.third_party_other") }]} /></Form.Item></Col>
                        <Col xs={24} md={6}><Form.Item name={[field.name, "third_party", "name"]} label={index === 0 ? t("accounting.third_party_name") : undefined}><Input placeholder={t("accounting.third_party_name")} /></Form.Item></Col>
                        <Col xs={24} md={6}><Form.Item name={[field.name, "third_party", "document"]} label={index === 0 ? t("accounting.third_party_document") : undefined}><Input placeholder={t("accounting.third_party_document")} /></Form.Item></Col>
                    </Row>
                </div>)}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({})}>{t("accounting.opening_balance_add_line")}</Button>
            </div>}</Form.List>
            <Alert className="mt-5" type={balanced ? "success" : "warning"} showIcon message={`${t("accounting.lines_col_debit")}: ${formatCurrency(totals.debit)} · ${t("accounting.lines_col_credit")}: ${formatCurrency(totals.credit)}`} description={balanced ? t("accounting.opening_balance_balanced") : t("accounting.opening_balance_unbalanced")} />
            <div className="flex justify-end mt-5"><Button type="primary" htmlType="submit" loading={saving} disabled={!balanced}>{t("accounting.opening_balance_post")}</Button></div>
        </Form></Card>}
    </>;
};

const AccountingAuditTab = () => {
    const { t } = useI18n();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [range, setRange] = useState([dayjs().subtract(30, "day"), dayjs()]);
    const [entityType, setEntityType] = useState();
    const [action, setAction] = useState();
    const load = async () => {
        setLoading(true);
        try {
            const response = await accountingService.listAudit({ from: range?.[0]?.startOf("day").toISOString(), to: range?.[1]?.endOf("day").toISOString(), entity_type: entityType, action });
            setRows(response?.data || []);
        } catch { toast.error(t("accounting.audit_load_failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [entityType, action]);
    const actionLabel = (value) => t(`accounting.audit_action_${value}`, { defaultValue: value });
    const entityLabel = (value) => ({
        journal_entry: t("accounting.audit_entity_journal"),
        accounting_budget: t("accounting.audit_entity_budget"),
        cash_account: t("accounting.audit_entity_cash"),
        chart_account: t("accounting.audit_entity_chart_account"),
        cost_center: t("accounting.audit_entity_cost_center"),
        point_of_sale_cost_center: t("accounting.audit_entity_pos_cost_center"),
        withholding_concept: t("accounting.audit_entity_withholding_concept"),
    }[value] || value);
    return <>
        <AccountingSectionGuide sectionKey="audit" title={t("accounting.audit_title")} summary={t("accounting.audit_summary")} steps={[t("accounting.audit_step_1"), t("accounting.audit_step_2")]} result={t("accounting.audit_result")} concepts={[{ label: t("accounting.audit_entity_journal"), help: t("accounting.audit_entity_help") }]} />
        <Card className="module-shell mb-4"><div className="flex flex-wrap gap-3 items-center"><DatePicker.RangePicker value={range} onChange={(value) => value && setRange(value)} /><Select allowClear className="w-56" placeholder={t("accounting.audit_entity_filter")} value={entityType} onChange={setEntityType} options={[{ value: "journal_entry", label: t("accounting.audit_entity_journal") }, { value: "accounting_budget", label: t("accounting.audit_entity_budget") }, { value: "cash_account", label: t("accounting.audit_entity_cash") }, { value: "chart_account", label: t("accounting.audit_entity_chart_account") }, { value: "cost_center", label: t("accounting.audit_entity_cost_center") }, { value: "point_of_sale_cost_center", label: t("accounting.audit_entity_pos_cost_center") }, { value: "withholding_concept", label: t("accounting.audit_entity_withholding_concept") }]} /><Select allowClear className="w-48" placeholder={t("accounting.audit_action_filter")} value={action} onChange={setAction} options={[{ value: "posted", label: t("accounting.audit_action_posted") }, { value: "created", label: t("accounting.audit_action_created") }, { value: "updated", label: t("accounting.audit_action_updated") }, { value: "deleted", label: t("accounting.audit_action_deleted") }, { value: "activated", label: t("accounting.audit_action_activated") }, { value: "deactivated", label: t("accounting.audit_action_deactivated") }, { value: "chart_account_changed", label: t("accounting.audit_action_chart_account_changed") }]} /><Button type="primary" onClick={load} loading={loading}>{t("reports.refresh_report")}</Button></div></Card>
        <Card className="module-shell"><Table className="module-dark-table" rowKey="_id" loading={loading} dataSource={rows} pagination={{ pageSize: 20 }} expandable={{ expandedRowRender: (row) => <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-96">{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre> }} columns={[{ title: t("accounting.audit_date"), dataIndex: "created_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") }, { title: t("accounting.audit_entity"), dataIndex: "entity_type", render: entityLabel }, { title: t("accounting.audit_action"), dataIndex: "action", render: actionLabel }, { title: t("accounting.audit_user"), render: (_, row) => row.actor?.username || row.actor?.email || "—" }, { title: t("accounting.audit_reference"), dataIndex: "entity_id", ellipsis: true }]} locale={{ emptyText: <EmptyState compact title={t("accounting.audit_empty_title")} subtitle={t("accounting.audit_empty_help")} /> }} /></Card>
    </>;
};

const Accounting = () => {
    const { t } = useI18n();
    const { can, loading: subscriptionLoading } = useSubscription();
    const location = useLocation();
    const deepLink = location.state || {};
    const [activeTab, setActiveTab] = useState(deepLink.tab || "overview");
    const [status, setStatus] = useState(null);
    const hasAccounting = can("accounting");

    useEffect(() => {
        if (!hasAccounting) return;
        accountingService
            .getStatus()
            .then(({ data }) => setStatus(data))
            .catch(() => setStatus(null));
    }, [hasAccounting]);

    const tabLabel = (icon, key) => <span className="accounting-tab-label">{icon}<span>{t(key)}</span></span>;
    const tabItems = [
        { key: "overview", label: tabLabel(<DashboardOutlined />, "accounting.tab_overview"), children: <OverviewTab /> },
        { key: "chart", label: tabLabel(<ApartmentOutlined />, "accounting.tab_chart_of_accounts"), children: <ChartOfAccountsTab /> },
        { key: "journal", label: tabLabel(<UnorderedListOutlined />, "accounting.tab_journal"), children: <JournalTab initialSourceType={deepLink.sourceType} initialSourceId={deepLink.sourceId} /> },
        { key: "vouchers", label: tabLabel(<FileTextOutlined />, "accounting.tab_vouchers"), children: <ManualVouchersTab /> },
        { key: "opening_balance", label: tabLabel(<PlusOutlined />, "accounting.tab_opening_balance"), children: <OpeningBalanceTab /> },
        { key: "audit", label: tabLabel(<SafetyCertificateOutlined />, "accounting.tab_audit"), children: <AccountingAuditTab /> },
        { key: "third_parties", label: tabLabel(<TeamOutlined />, "accounting.tab_third_parties"), children: <ThirdPartyLedgerTab /> },
        { key: "cost_centers", label: tabLabel(<PartitionOutlined />, "accounting.tab_cost_centers"), children: <CostCentersTab /> },
        { key: "recurring_expenses", label: tabLabel(<ClockCircleOutlined />, "accounting.tab_recurring_expenses"), children: <RecurringExpensesTab /> },
        { key: "fixed_assets", label: tabLabel(<ToolOutlined />, "accounting.tab_fixed_assets"), children: <FixedAssetsTab /> },
        { key: "prepaid_expenses", label: tabLabel(<CalendarOutlined />, "accounting.tab_prepaid_expenses"), children: <PrepaidExpensesTab /> },
        { key: "recurring_journals", label: tabLabel(<RetweetOutlined />, "accounting.tab_recurring_journals"), children: <RecurringJournalsTab /> },
        { key: "budgets", label: tabLabel(<BarChartOutlined />, "accounting.tab_budgets"), children: <BudgetsTab /> },
        { key: "trial_balance", label: tabLabel(<CalculatorOutlined />, "accounting.tab_trial_balance"), children: <TrialBalanceTab /> },
        { key: "periods", label: tabLabel(<LockOutlined />, "accounting.tab_periods"), children: <PeriodsTab /> },
        { key: "statements", label: tabLabel(<BarChartOutlined />, "accounting.tab_financial_statements"), children: <FinancialStatementsTab /> },
        { key: "taxes", label: tabLabel(<SafetyCertificateOutlined />, "accounting.tab_taxes"), children: <TaxesTab /> },
    ];

    return (
        <div className="accounting-page min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader title={t("accounting.page_title")} subtitle={t("accounting.page_subtitle")} icon={<BookOutlined />} />
                    {subscriptionLoading ? null : !hasAccounting ? (
                        <PlanGate featureKey="accounting" />
                    ) : (
                        <>
                            {status && !status.has_journal_entries && (
                                <AccountingQuickStart onOpenTab={setActiveTab} />
                            )}
                            {status && status.has_journal_entries && status.has_backfilled_entries && (
                                <Alert
                                    className="dark-alert dark-alert-purple"
                                    type="info"
                                    showIcon
                                    closable
                                    icon={<InfoCircleOutlined />}
                                    message={t("accounting.onboarding_backfilled_title")}
                                    description={t("accounting.onboarding_backfilled_body")}
                                />
                            )}
                            <Card className="accounting-workspace">
                                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="accounting-tabs" destroyInactiveTabPane={false} />
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Accounting;
