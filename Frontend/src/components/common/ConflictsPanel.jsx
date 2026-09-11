import React from "react";
import { Drawer, Button, Empty, Tag } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import { WarningFilled } from "@ant-design/icons";
import { db } from "../../offline/db.js";
import { OUTBOX_STATUS } from "../../offline/outbox.js";
import { discardConflict } from "../../offline/entityQueue.js";
import useI18n from "../../hooks/useI18n";

// Human-readable label per mirrored entity - see db.js's MIRROR_ENTITIES for
// the full list this needs to stay in sync with. Falls back to the raw
// entity key for anything not listed (custom/action-only outbox entries
// like "cashAccounts" transfers use their own entity key already, so this
// only really matters for typos/future entities not added here yet).
const ENTITY_LABELS = {
    products: { es: "Producto", en: "Product" },
    categories: { es: "Categoría", en: "Category" },
    units: { es: "Unidad", en: "Unit" },
    customers: { es: "Cliente", en: "Customer" },
    suppliers: { es: "Proveedor", en: "Supplier" },
    orders: { es: "Pedido", en: "Order" },
    purchases: { es: "Compra", en: "Purchase" },
    cashAccounts: { es: "Cuenta de caja", en: "Cash account" },
    pointsOfSale: { es: "Punto de venta", en: "Point of sale" },
    stockTransfers: { es: "Traslado de stock", en: "Stock transfer" },
    purchaseQuotations: { es: "Cotización de compra", en: "Purchase quotation" },
    salesQuotations: { es: "Cotización de venta", en: "Sales quotation" },
    receiptAcknowledgments: { es: "Acuse de recibo", en: "Receipt acknowledgment" },
};

const OP_LABELS = {
    create: { es: "Crear", en: "Create" },
    update: { es: "Editar", en: "Update" },
    delete: { es: "Eliminar", en: "Delete" },
    custom: { es: "Acción", en: "Action" },
};

// Best-effort human label for *which* record this was, tried against the
// common field names different entities' create/update payloads actually
// use - there's no single shared "name" field across all of them. Returns
// null (not shown) rather than guessing wrong when nothing matches.
const RECORD_LABEL_FIELDS = [
    "name", "category_name", "product_name", "customer_name", "supplier_name",
    "purchase_no", "quotation_no", "account_name",
];
const describeRecord = (entry) => {
    const data = entry?.request?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    for (const field of RECORD_LABEL_FIELDS) {
        if (data[field]) return data[field];
    }
    return null;
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
            className="offline-conflicts-drawer"
        >
            {conflicts.length === 0 ? (
                <Empty description={t("common.conflicts_panel_empty")} />
            ) : (
                <div className="flex flex-col gap-3">
                    {conflicts.map((entry) => {
                        const entityLabel = ENTITY_LABELS[entry.entity]?.[lang] || entry.entity;
                        const opLabel = OP_LABELS[entry.opType]?.[lang] || entry.opType;
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
                                    <span>{entry.lastError || t("common.conflicts_no_detail")}</span>
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
