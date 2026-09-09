import { resolveApiErrorMessage } from "./apiError";

export const FINANCE_ERROR_CODES = {
    finance_expense_accounts_required: "finance.error_expense_accounts_required",
    finance_cash_account_required: "finance.error_cash_account_required",
    finance_income_accounts_required: "finance.error_income_accounts_required",
    reconciliation_match_fields_required: "finance.error_reconciliation_match_fields_required",
    cash_account_not_found: "finance.error_cash_account_not_found",
    cash_account_chart_account_invalid: "finance.error_cash_chart_account_invalid",
    cash_account_name_required: "finance.error_cash_name_required",
    cash_account_type_invalid: "finance.error_cash_type_invalid",
    cash_account_location_required: "finance.error_cash_location_required",
    reconciliation_entries_required: "finance.error_reconciliation_entries_required",
    reconciliation_import_limit: "finance.error_reconciliation_import_limit",
    reconciliation_entry_invalid: "finance.error_reconciliation_entry_invalid",
    reconciliation_entry_duplicate: "finance.error_reconciliation_entry_duplicate",
    reconciliation_status_invalid: "finance.error_reconciliation_status_invalid",
    reconciliation_start_date_invalid: "finance.error_reconciliation_start_date_invalid",
    reconciliation_end_date_invalid: "finance.error_reconciliation_end_date_invalid",
    reconciliation_entry_not_found: "finance.error_reconciliation_entry_not_found",
    reconciliation_movement_not_found: "finance.error_reconciliation_movement_not_found",
    reconciliation_entry_already_matched: "finance.error_reconciliation_entry_already_matched",
    reconciliation_movement_already_matched: "finance.error_reconciliation_movement_already_matched",
    reconciliation_amount_mismatch: "finance.error_reconciliation_amount_mismatch",
    reconciliation_concurrent_change: "finance.error_reconciliation_concurrent_change",
    receivable_due_date_invalid: "finance.error_receivable_due_date_invalid",
    receivable_order_not_found: "finance.error_receivable_order_not_found",
    payable_due_date_invalid: "finance.error_payable_due_date_invalid",
    payable_purchase_not_found: "finance.error_payable_purchase_not_found",
};

export const financeErrorMessage = (error, t, fallbackKey = "finance.failed") =>
    resolveApiErrorMessage(error, t, FINANCE_ERROR_CODES, fallbackKey);
