import React from "react";
import { Drawer, Button, Empty, Tag } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import { WarningFilled } from "@ant-design/icons";
import { db } from "../../offline/db.js";
import { OUTBOX_STATUS } from "../../offline/outbox.js";
import { discardConflict } from "../../offline/entityQueue.js";
import useI18n from "../../hooks/useI18n";
import { describeRecord, entityLabel as describeEntity, operationLabel } from "../../offline/describeOutboxEntry.js";

// Maps Backend/utils/ApiError.js's machine-readable `code` (stored as
// entry.lastErrorCode, see outbox.js#markConflict) to a translated message -
// covers every code a create/update/delete on an offline-wired entity can
// realistically produce today. Not every ApiError in the backend sets a
// code yet (most are validation errors the form already caught before ever
// reaching the outbox), so this is deliberately scoped to the ones that can
// really surface here, not an exhaustive mirror of every backend error.
const ERROR_CODE_KEYS = {
    category_already_exists: "common.conflict_error_category_already_exists",
    unit_already_exists: "common.conflict_error_unit_already_exists",
    purchase_number_already_exists: "common.conflict_error_purchase_number_already_exists",
    quotation_number_already_exists: "common.conflict_error_quotation_number_already_exists",
    sales_quotation_already_converted: "common.conflict_error_sales_quotation_already_converted",
    duplicate_quotation_products: "common.conflict_error_duplicate_quotation_products",
    stale_edit_conflict: "common.conflict_error_stale_edit_conflict",
    product_has_history: "common.conflict_error_product_has_history",
    product_has_warranties: "common.conflict_error_product_has_warranties",
    customer_has_orders: "common.conflict_error_customer_has_orders",
    customer_has_warranties: "common.conflict_error_customer_has_warranties",
    supplier_has_purchases: "common.conflict_error_supplier_has_purchases",
    insufficient_stock: "common.conflict_error_insufficient_stock",
    products_not_found: "common.conflict_error_products_not_found",
    product_variants_not_found: "common.conflict_error_product_variants_not_found",
    customer_not_found: "common.conflict_error_customer_not_found",
    supplier_not_found: "common.conflict_error_supplier_not_found",
    cash_transfer_accounts_required: "common.conflict_error_cash_transfer_accounts_required",
    cash_transfer_same_account: "common.conflict_error_cash_transfer_same_account",
    cash_transfer_amount_invalid: "common.conflict_error_cash_transfer_amount_invalid",
    cash_transfer_date_invalid: "common.conflict_error_cash_transfer_date_invalid",
    cash_transfer_account_not_found: "common.conflict_error_cash_transfer_account_not_found",
    cash_transfer_insufficient_funds: "common.conflict_error_cash_transfer_insufficient_funds",
    cash_adjustment_accounts_required: "common.conflict_error_cash_adjustment_accounts_required",
    cash_adjustment_amount_invalid: "common.conflict_error_cash_adjustment_amount_invalid",
    cash_adjustment_reason_required: "common.conflict_error_cash_adjustment_reason_required",
    cash_adjustment_date_invalid: "common.conflict_error_cash_adjustment_date_invalid",
    cash_adjustment_cash_account_not_found: "common.conflict_error_cash_adjustment_cash_account_not_found",
    cash_adjustment_counterpart_not_found: "common.conflict_error_cash_adjustment_counterpart_not_found",
    cash_adjustment_negative_balance: "common.conflict_error_cash_adjustment_negative_balance",
    cash_adjustment_same_counterpart: "common.conflict_error_cash_adjustment_same_counterpart",
};

// Translated when the code is one we recognize; otherwise the raw backend
// message (English dev-facing fallback) is shown verbatim rather than
// nothing at all - see outbox.js#describeError.
const describeConflictError = (entry, t) => {
    const key = entry.lastErrorCode && ERROR_CODE_KEYS[entry.lastErrorCode];
    if (key) return t(key);
    return entry.lastError || t("common.conflicts_no_detail");
};

const ConflictsPanel = ({ open, onClose }) => {
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";

    const conflicts = useLiveQuery(
        () => db.outbox.where("status").equals(OUTBOX_STATUS.CONFLICT).sortBy("createdAt"),
        [],
        []
    );

    const handleDiscard = (entry) => {
        discardConflict(entry);
    };

    return (
        <Drawer
            title={t("common.conflicts_panel_title")}
            open={open}
            onClose={onClose}
            width={420}
            rootClassName="offline-conflicts-drawer"
        >
            {conflicts.length === 0 ? (
                <Empty description={t("common.conflicts_panel_empty")} />
            ) : (
                <div className="flex flex-col gap-3">
                    {conflicts.map((entry) => {
                        const entityLabel = describeEntity(entry, lang);
                        const opLabel = operationLabel(entry, lang);
                        const recordLabel = describeRecord(entry);
                        return (
                            <div
                                key={entry.localId}
                                className="rounded-xl border p-3"
                                style={{
                                    borderColor: "var(--ohnix-line-4)",
                                    background: "var(--ohnix-surface-2)",
                                }}
                            >
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Tag color="warning">{opLabel}</Tag>
                                        <span
                                            className="text-sm font-semibold"
                                            style={{ color: "var(--ohnix-text-primary)" }}
                                        >
                                            {entityLabel}
                                            {recordLabel ? ` · ${recordLabel}` : ""}
                                        </span>
                                    </div>
                                </div>
                                <p
                                    className="mb-2.5 flex items-start gap-1.5 text-xs"
                                    style={{ color: "var(--ohnix-text-muted)" }}
                                >
                                    <WarningFilled style={{ color: "#f59e0b", marginTop: 2 }} />
                                    <span>{describeConflictError(entry, t)}</span>
                                </p>
                                <Button
                                    danger
                                    size="small"
                                    onClick={() => handleDiscard(entry)}
                                >
                                    {t("common.conflicts_discard")}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </Drawer>
    );
};

export default ConflictsPanel;
