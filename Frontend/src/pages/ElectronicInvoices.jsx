/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Button,
    Drawer,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Row,
    Col,
    Select,
    Table,
    Tooltip,
    message,
} from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CopyOutlined,
    DownloadOutlined,
    FileTextOutlined,
    PlusOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SearchOutlined,
    SyncOutlined,
    UndoOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { electronicInvoiceService } from "../services/electronicInvoiceService";
import { api } from "../api/api";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import { useCurrency } from "../context/CurrencyContext";
import { getCurrencyInputProps } from "../utils/currency";
import useI18n from "../hooks/useI18n";
import useIsMobile from "../hooks/useIsMobile";
import useCountUp from "../hooks/useCountUp";
import { resolveApiErrorMessage } from "../utils/apiError";
import { getElectronicInvoicingProviderLabel } from "../utils/electronicInvoicingProvider";

// ensureElectronicInvoicingPlan (Backend/services/electronicInvoicing.service.js)
// throws an English dev-facing message by design - see the same constant in
// ElectronicInvoicingSettings.jsx/FirmaPassSelfService.jsx. A plan that
// lapses or gets downgraded after invoices already exist can still hit this
// gate here (retry/sync/credit-note), so it needs the same translation.
const PLAN_GATE_CODE_MESSAGES = { electronic_invoicing_plan_required: "fiscal_setup.plan_required" };
const CREDIT_NOTE_CODE_MESSAGES = {
    ...PLAN_GATE_CODE_MESSAGES,
    credit_note_amount_exceeds_remaining_base: "electronic_invoices.credit_note.amount_exceeds_remaining_base",
    credit_note_history_requires_reconciliation: "electronic_invoices.credit_note.history_requires_reconciliation",
    credit_note_already_processing: "electronic_invoices.credit_note.already_processing",
};

const STATUS_COLORS = {
    accepted: "var(--ohnix-accent-2)",
    submitted: "var(--ohnix-status-purple)",
    issuing: "var(--ohnix-status-purple)",
    rejected: "var(--ohnix-status-rose)",
    error: "var(--ohnix-status-rose)",
    cancelled: "var(--ohnix-text-dim)",
    draft: "var(--ohnix-status-amber)",
    // itcycle-only: DIAN was unreachable, but the document was already built,
    // signed, and delivered to the customer - legally distinct from "error"
    // (nothing to deliver) or "rejected" (DIAN said no). Amber/warning, not
    // rose, on purpose - this isn't a failure state from the customer's side.
    contingency: "var(--ohnix-status-amber)",
};

const STATUS_ALL = "all";
const STATUS_FILTERS = [STATUS_ALL, "draft", "issuing", "submitted", "accepted", "rejected", "error", "cancelled", "contingency"];
const ATTENTION_STATUSES = new Set(["error", "rejected"]);
const RETRYABLE_STATUSES = new Set(["error", "rejected"]);
// "contingency" belongs here, not in RETRYABLE_STATUSES: the backend routes
// "sync" to a real retry-send for this status (see
// electronicInvoicing.service.js#syncElectronicInvoiceStatus) - "retry"
// (re-issue) can never resolve a document that's already past issuance.
const SYNCABLE_STATUSES = new Set(["issuing", "submitted", "contingency"]);

const CREDIT_NOTE_CONCEPTS = [
    { key: "partial_return", code: "1" },
    { key: "cancellation", code: "2" },
    { key: "discount", code: "3" },
    { key: "price_adjustment", code: "4" },
    { key: "other", code: "5" },
];

const MetricCard = ({ label, value, icon, color, hint }) => {
    const animated = useCountUp(value);
    return (
        <StatCard
            title={label}
            value={animated}
            icon={icon}
            valueStyle={{ color, fontSize: "32px", fontWeight: 700 }}
            description={hint}
            className="!border-[var(--ohnix-line-4)]"
        />
    );
};

const StatusPill = ({ status }) => {
    const { t } = useI18n();
    const color = STATUS_COLORS[status] || "var(--ohnix-text-dim)";
    const label = t(`electronic_invoices.status.${status}`, { defaultValue: status });
    return (
        <span
            className="status-pill"
            style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}
        >
            <span className={`status-dot status-dot--${status}`} />
            {label}
        </span>
    );
};

const CufeCell = ({ cufe }) => {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleCopy = (e) => {
        e.stopPropagation();
        if (!cufe) return;
        navigator.clipboard?.writeText(cufe).then(
            () => {
                setCopied(true);
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => setCopied(false), 1100);
            },
            () => message.error(t("electronic_invoices.cufe_copy_error"))
        );
    };

    if (!cufe) {
        return <span className="text-xs italic text-[var(--ohnix-text-dim)]">{t("electronic_invoices.cufe_not_available")}</span>;
    }
    const truncated = `${cufe.slice(0, 14)}…`;
    return (
        <Tooltip title={<span className="font-mono text-xs break-all">{cufe}</span>} placement="topLeft">
            <span
                className="cufe-cell font-mono text-xs text-[var(--ohnix-text-soft)]"
                onClick={handleCopy}
                role="button"
                tabIndex={0}
            >
                {truncated}
                <CopyOutlined className="text-[10px] text-[#29D8D5]" />
                {copied && <span className="copy-feedback absolute -translate-y-3 text-[10px] font-semibold text-[#44F3F0]">{t("electronic_invoices.cufe_copied")}</span>}
            </span>
        </Tooltip>
    );
};

const TimelineNode = ({ label, when, active, isLast }) => {
    const { t } = useI18n();
    return (
        <div className="relative pl-8 pb-5 last:pb-0">
            <span className={`dian-timeline__node ${active ? "" : "dian-timeline__node--pending"}`} style={{ top: 4 }} />
            {!isLast && (
                <span className="absolute left-[15px] top-[18px] bottom-0 w-px bg-gradient-to-b from-[#29D8D5]/60 to-[var(--ohnix-line-2)]" />
            )}
            <div className={`text-sm font-semibold ${active ? "text-[var(--ohnix-text-primary)]" : "text-[var(--ohnix-text-dim)]"}`}>{label}</div>
            <div className="text-xs text-[var(--ohnix-text-muted)]">{when || t("electronic_invoices.drawer.pending")}</div>
        </div>
    );
};

const InfoCard = ({ label, value, mono = false }) => (
    <div className="module-shell rounded-2xl p-4">
        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--ohnix-text-dim)]">{label}</div>
        <div className={`mt-1 break-all text-sm text-[var(--ohnix-text-primary)] ${mono ? "font-mono" : "font-semibold"}`}>
            {value || "—"}
        </div>
    </div>
);

// `onClick` (a downloader that fetches with credentials, e.g. itcycle's
// on-demand representación gráfica) is an alternative to `url` (a plain,
// already-hosted link, e.g. Factus/Alanube's own pdfUrl) - present whenever
// either is given, never both at once for the same invoice.
const SupportButton = ({ url, onClick, loading, kind, size = "large" }) => {
    const { t } = useI18n();
    const present = Boolean(url || onClick);
    const isPdf = kind === "pdf";
    const label = isPdf ? t("electronic_invoices.support.download_pdf") : t("electronic_invoices.support.view_xml");
    const icon = isPdf ? <DownloadOutlined /> : <FileTextOutlined />;
    const baseClass = "!h-12 !rounded-2xl";
    if (!present) {
        return (
            <Button disabled className={baseClass}>
                {t("electronic_invoices.support.not_available", { kind: kind.toUpperCase() })}
            </Button>
        );
    }
    const colorClass = isPdf
        ? "!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!shadow-[0_0_24px_rgba(41,216,213,0.25)]"
        : "!border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-2)] !text-[var(--ohnix-text-primary)] hover:!border-[#29D8D5]/45";
    return (
        <Button
            icon={icon}
            href={onClick ? undefined : url}
            target={onClick ? undefined : "_blank"}
            onClick={onClick}
            loading={loading}
            size={size}
            className={`${baseClass} ${colorClass}`}
        >
            {label}
        </Button>
    );
};

const copyToClipboard = async (value) => {
    try {
        await navigator.clipboard?.writeText(value);
        return true;
    } catch {
        return false;
    }
};

// Concepts where the customer actually hands goods back - mirrors backend's
// RESTOCK_CONCEPT_CODES (electronicInvoicing.service.js) but keyed by the
// form's `key` string instead of the DIAN numeric code.
const RESTOCK_CONCEPT_KEYS = ["partial_return", "cancellation"];

const CreditNoteModal = ({ open, onCancel, onSubmit, submitting, orderId }) => {
    const { t } = useI18n();
    const { formatCurrency, currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const [form] = Form.useForm();
    const concept = Form.useWatch("concept", form);
    const [lines, setLines] = useState([]);
    const [loadingLines, setLoadingLines] = useState(false);
    const [quantities, setQuantities] = useState({});

    const needsItems = RESTOCK_CONCEPT_KEYS.includes(concept);

    useEffect(() => {
        if (!open || !orderId || !needsItems) {
            setLines([]);
            setQuantities({});
            return;
        }
        setLoadingLines(true);
        api.get(`/orders/${orderId}/return-preview`)
            .then((response) => {
                if (response.data.success) {
                    setLines(response.data.data.return_preview || []);
                }
            })
            .catch(() => setLines([]))
            .finally(() => setLoadingLines(false));
    }, [open, orderId, needsItems]);

    const setLineQuantity = (orderDetailId, value) => {
        setQuantities((prev) => ({ ...prev, [orderDetailId]: value || 0 }));
    };

    const itemsColumns = [
        {
            title: t("products.product"),
            dataIndex: "product_name",
            key: "product_name",
            ellipsis: true,
        },
        {
            title: t("orders.return_col_sold_qty"),
            dataIndex: "sold_quantity",
            key: "sold_quantity",
            align: "center",
            width: 90,
        },
        {
            title: t("purchases.return_col_pending"),
            dataIndex: "pending_quantity",
            key: "pending_quantity",
            align: "center",
            width: 90,
            render: (qty) => <span className="font-medium text-[#44F3F0]">{qty}</span>,
        },
        {
            title: t("purchases.return_col_qty_to_return"),
            key: "quantity_to_return",
            align: "center",
            width: 130,
            render: (_, record) =>
                record.pending_quantity > 0 ? (
                    <InputNumber
                        min={0}
                        max={record.pending_quantity}
                        value={quantities[record.order_detail_id] || 0}
                        onChange={(value) => setLineQuantity(record.order_detail_id, value)}
                        size="small"
                        className="w-20"
                    />
                ) : (
                    <span className="text-[var(--ohnix-text-dim)] text-xs">
                        {t("purchases.returned")}
                    </span>
                ),
        },
        {
            title: t("purchases.return_preview_col_potential_refund"),
            key: "line_refund",
            align: "right",
            render: (_, record) => {
                const qty = quantities[record.order_detail_id] || 0;
                return (
                    <span className="font-semibold text-[#44F3F0]">
                        {formatCurrency(qty * record.unit_cost)}
                    </span>
                );
            },
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <UndoOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("electronic_invoices.credit_note.modal_title")}
                    </span>
                </div>
            }
            footer={null}
            destroyOnClose
            centered
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <Form
                form={form}
                layout="vertical"
                className="mt-4"
                onFinish={(values) => {
                    const conceptEntry = CREDIT_NOTE_CONCEPTS.find((c) => c.key === values.concept);
                    let items;
                    let amount;
                    let taxRate;
                    if (needsItems) {
                        items = Object.entries(quantities)
                            .filter(([, quantity]) => quantity > 0)
                            .map(([orderDetailId, quantity]) => ({ orderDetailId, quantity }));
                        if (items.length === 0) {
                            message.error(t("electronic_invoices.credit_note.items_required"));
                            return;
                        }
                    } else {
                        amount = values.amount;
                        taxRate = values.tax_rate || 0;
                    }
                    onSubmit({ conceptCode: conceptEntry?.code, observation: values.observation, items, amount, taxRate });
                }}
            >
                <Form.Item
                    name="concept"
                    label={t("electronic_invoices.credit_note.concept_label")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Select placeholder={t("electronic_invoices.credit_note.concept_placeholder")} size="large">
                        {CREDIT_NOTE_CONCEPTS.map(({ key }) => (
                            <Select.Option key={key} value={key}>
                                {t(`electronic_invoices.credit_note.concepts.${key}`)}
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>
                <Form.Item name="observation" label={t("electronic_invoices.credit_note.observation_label")}>
                    <Input.TextArea rows={3} placeholder={t("electronic_invoices.credit_note.observation_placeholder")} />
                </Form.Item>

                {needsItems ? (
                    <div className="mb-4">
                        <Alert
                            message={t("electronic_invoices.credit_note.items_title")}
                            description={t("electronic_invoices.credit_note.items_hint")}
                            type="info"
                            showIcon
                            className="mb-3 dark-alert dark-alert-purple"
                        />
                        <Table
                            columns={itemsColumns}
                            dataSource={lines}
                            rowKey="order_detail_id"
                            pagination={false}
                            loading={loadingLines}
                            size="small"
                            locale={{ emptyText: loadingLines ? t("electronic_invoices.credit_note.loading_items") : t("common.no_data") }}
                            className="module-dark-table"
                            scroll={{ x: "max-content" }}
                        />
                    </div>
                ) : (
                    <Row gutter={12}>
                        <Col xs={16}>
                            <Form.Item
                                name="amount"
                                label={t("electronic_invoices.credit_note.amount_label")}
                                rules={[
                                    { required: true, message: t("validation.required_field") },
                                    { type: "number", min: 0.01, message: t("electronic_invoices.credit_note.amount_required") },
                                ]}
                            >
                                <InputNumber
                                    placeholder={t("electronic_invoices.credit_note.amount_placeholder")}
                                    prefix={currency.symbol}
                                    style={{ width: "100%" }}
                                    precision={2}
                                    size="large"
                                    formatter={currencyInputProps.formatter}
                                    parser={currencyInputProps.parser}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={8}>
                            <Form.Item name="tax_rate" label={t("electronic_invoices.credit_note.tax_rate_label")} initialValue={0}>
                                <InputNumber min={0} max={100} precision={2} size="large" className="w-full" addonAfter="%" />
                            </Form.Item>
                        </Col>
                    </Row>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 mt-2 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        onClick={onCancel}
                        className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                    >
                        {t("common.cancel")}
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={submitting}
                        className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                    >
                        {t("electronic_invoices.credit_note.submit")}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

const EVENT_LABEL_KEYS = {
    issuance_claimed: "electronic_invoices.timeline.issuance_claimed",
    provider_response: "electronic_invoices.timeline.provider_response",
    provider_error: "electronic_invoices.timeline.provider_error",
    manual_sync: "electronic_invoices.timeline.manual_sync",
    manual_sync_error: "electronic_invoices.timeline.manual_sync_error",
    webhook: "electronic_invoices.timeline.webhook",
    credit_note_issued: "electronic_invoices.timeline.credit_note_issued",
    credit_note_error: "electronic_invoices.timeline.credit_note_error",
};

const InvoiceDetailDrawer = ({
    invoice,
    onClose,
    onRetry,
    onSync,
    onOpenCreditNote,
    retrying,
    syncing,
    creditNotes,
    creditNotesLoading,
    onRetryCreditNoteLocalEffect,
    retryingCreditNoteId,
}) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    if (!invoice) return null;
    const issuedAt = invoice.issuedAt ? new Date(invoice.issuedAt) : null;
    const events = Array.isArray(invoice.events) ? invoice.events : [];

    // itcycle never populates pdfUrl (see electronicInvoicePdf.service.js's
    // module comment) - its "representación gráfica" is generated on demand
    // instead, only once the invoice actually has a CUFE/number to show
    // (draft/error/rejected-with-no-number states have nothing to render).
    const canGenerateItcyclePdf = invoice.provider === "itcycle" && Boolean(invoice.cufe) && Boolean(invoice.invoiceNumber);
    const handleDownloadItcyclePdf = async () => {
        setDownloadingPdf(true);
        try {
            await electronicInvoiceService.downloadPdf(invoice.orderId, invoice.invoiceNumber);
        } catch {
            message.error(t("electronic_invoices.support.pdf_download_error"));
        } finally {
            setDownloadingPdf(false);
        }
    };

    return (
        <Drawer
            open={Boolean(invoice)}
            onClose={onClose}
            width={isMobile ? "100%" : 540}
            className="dian-drawer"
            title={
                <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("electronic_invoices.drawer.title")}</span>
                    <StatusPill status={invoice.status} />
                </div>
            }
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" },
                header: {
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                },
                body: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    padding: "22px",
                },
            }}
        >
            <div className="space-y-5">
                <div className="relative overflow-hidden rounded-3xl border border-[#29D8D5]/25 bg-[radial-gradient(circle_at_90%_0%,rgba(41,216,213,.22),transparent_45%),var(--ohnix-line-1)] p-5">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-[#44F3F0]/20 animate-glow-pulse" />
                    <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold tracking-[.22em] text-[#44F3F0]">
                        <QrcodeOutlined /> {getElectronicInvoicingProviderLabel(invoice.provider)} · DIAN
                    </div>
                    <div className="text-2xl font-bold text-[var(--ohnix-text-primary)]">{invoice.invoiceNumber || invoice.referenceCode}</div>
                    <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("electronic_invoices.table.order_prefix")} {invoice.order?.invoiceNo || "—"}</div>

                    <Divider style={{ borderColor: "var(--ohnix-line-3)", margin: "18px 0 14px" }} />

                    <div className="dian-timeline">
                        {events.length === 0 ? (
                            <TimelineNode label={t("electronic_invoices.timeline.empty")} when={null} active={false} isLast />
                        ) : (
                            events.map((event, idx) => (
                                <TimelineNode
                                    key={event.id}
                                    label={t(EVENT_LABEL_KEYS[event.eventType] || event.eventType, { defaultValue: event.eventType })}
                                    when={new Date(event.createdAt).toLocaleString("es-CO")}
                                    active
                                    isLast={idx === events.length - 1}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <InfoCard label={t("electronic_invoices.drawer.customer")} value={invoice.order?.customerName} />
                    <InfoCard label={t("electronic_invoices.drawer.order")} value={invoice.order?.invoiceNo} />
                </div>

                <div className="module-shell rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--ohnix-text-dim)]">CUFE</div>
                        {invoice.cufe && (
                            <Tooltip title={t("common.copy")}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<CopyOutlined />}
                                    onClick={async () => {
                                        const ok = await copyToClipboard(invoice.cufe);
                                        if (ok) message.success(t("electronic_invoices.cufe_copied"));
                                        else message.error(t("electronic_invoices.cufe_copy_error"));
                                    }}
                                    className="!text-[#44F3F0]"
                                />
                            </Tooltip>
                        )}
                    </div>
                    <div className={`mt-1 break-all text-xs text-[var(--ohnix-text-primary)] ${invoice.cufe ? "font-mono" : "italic text-[var(--ohnix-text-dim)]"}`}>
                        {invoice.cufe || t("electronic_invoices.cufe_not_available")}
                    </div>
                </div>

                <InfoCard
                    label={t("electronic_invoices.drawer.issued_at")}
                    value={issuedAt ? issuedAt.toLocaleString("es-CO") : t("electronic_invoices.drawer.pending")}
                    mono={false}
                />

                <div className="grid grid-cols-2 gap-3">
                    <SupportButton
                        kind="pdf"
                        url={invoice.pdfUrl}
                        onClick={!invoice.pdfUrl && canGenerateItcyclePdf ? handleDownloadItcyclePdf : undefined}
                        loading={downloadingPdf}
                    />
                    <SupportButton kind="xml" url={invoice.xmlUrl} />
                </div>

                {RETRYABLE_STATUSES.has(invoice.status) && (
                    <Button
                        block
                        icon={<UndoOutlined />}
                        loading={retrying}
                        onClick={() => onRetry(invoice.orderId, invoice.id)}
                        className="!h-12 !rounded-2xl !border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0]"
                    >
                        {t("electronic_invoices.retry_action")}
                    </Button>
                )}

                {SYNCABLE_STATUSES.has(invoice.status) && (
                    <Button
                        block
                        icon={<SyncOutlined spin={syncing} />}
                        loading={syncing}
                        onClick={() => onSync(invoice.orderId, invoice.id)}
                        className="!h-12 !rounded-2xl !border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-2)] !text-[var(--ohnix-text-primary)]"
                    >
                        {t("electronic_invoices.sync_action")}
                    </Button>
                )}

                {invoice.status === "accepted" && (
                    <Button
                        block
                        icon={<PlusOutlined />}
                        onClick={onOpenCreditNote}
                        className="!h-12 !rounded-2xl !border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-2)] !text-[var(--ohnix-text-primary)]"
                    >
                        {t("electronic_invoices.credit_note.action")}
                    </Button>
                )}

                {(creditNotesLoading || creditNotes.length > 0) && (
                    <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--ohnix-text-dim)]">
                            {t("electronic_invoices.credit_note.list_title")}
                        </div>
                        {creditNotesLoading ? (
                            <div className="text-xs text-[var(--ohnix-text-dim)]">{t("common.loading")}</div>
                        ) : (
                            creditNotes.map((note) => (
                                <div key={note.id} className="module-shell flex items-center justify-between gap-2 rounded-2xl p-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                            {note.creditNoteNumber || note.referenceCode}
                                        </div>
                                        <div className="text-xs text-[var(--ohnix-text-dim)]">
                                            {note.issuedAt
                                                ? new Date(note.issuedAt).toLocaleString("es-CO")
                                                : t("electronic_invoices.drawer.pending")}
                                        </div>
                                        {note.status === "accepted" && note.localEffectStatus && note.localEffectStatus !== "not_applicable" && (
                                            <div className={`mt-1 text-xs ${note.localEffectStatus === "applied" ? "text-emerald-400" : "text-amber-300"}`}>
                                                {t(`electronic_invoices.credit_note.local_effect_${note.localEffectStatus}`)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-2">
                                        <StatusPill status={note.status} />
                                        {note.status === "accepted" && ["pending", "failed"].includes(note.localEffectStatus) && (
                                            <Button
                                                size="small"
                                                icon={<ReloadOutlined />}
                                                loading={retryingCreditNoteId === note.id}
                                                onClick={() => onRetryCreditNoteLocalEffect(invoice.orderId, note.id)}
                                            >
                                                {t("electronic_invoices.credit_note.retry_local_effect")}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {invoice.status === "contingency" && (
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                        <div className="mb-1 flex items-center gap-2 font-semibold">
                            <WarningOutlined /> {t("electronic_invoices.status.contingency")}
                        </div>
                        <div>{t("electronic_invoices.contingency_hint")}</div>
                    </div>
                )}

                {invoice.errorMessage && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-200">
                        <div className="mb-1 flex items-center gap-2 font-semibold">
                            <WarningOutlined /> {t("electronic_invoices.drawer.error_detail")}
                        </div>
                        <div>{invoice.errorMessage}</div>
                    </div>
                )}
            </div>
        </Drawer>
    );
};

const ElectronicInvoices = () => {
    const { t } = useI18n();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(STATUS_ALL);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [retryingId, setRetryingId] = useState(null);
    const [syncingId, setSyncingId] = useState(null);
    const [creditNotes, setCreditNotes] = useState([]);
    const [creditNotesLoading, setCreditNotesLoading] = useState(false);
    const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
    const [creditNoteSubmitting, setCreditNoteSubmitting] = useState(false);
    const [retryingCreditNoteId, setRetryingCreditNoteId] = useState(null);
    const { formatCurrency } = useCurrency();
    // `items` is the full, unpaginated list (the desktop table below pages
    // it client-side) - the mobile card list used to render every single
    // document at once regardless of how many existed.
    const MOBILE_PAGE_SIZE = 15;
    const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (status && status !== STATUS_ALL) params.status = status;
            if (search) params.search = search;
            const { data } = await electronicInvoiceService.list(params);
            const rows = data || [];
            setItems(rows);
            return rows;
        } catch {
            message.error(t("electronic_invoices.list_load_error"));
            return [];
        } finally {
            setLoading(false);
        }
    }, [status, search, t]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setMobileVisibleCount(MOBILE_PAGE_SIZE);
    }, [items]);

    const loadCreditNotes = useCallback(async (orderId) => {
        if (!orderId) {
            setCreditNotes([]);
            return;
        }
        setCreditNotesLoading(true);
        try {
            const { data } = await electronicInvoiceService.listCreditNotes(orderId);
            setCreditNotes(data?.creditNotes || []);
        } catch {
            setCreditNotes([]);
        } finally {
            setCreditNotesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selected?.orderId) loadCreditNotes(selected.orderId);
        else setCreditNotes([]);
    }, [selected?.orderId, loadCreditNotes]);

    const refreshSelected = async (invoiceId) => {
        const rows = await load();
        const updated = rows.find((row) => row.id === invoiceId);
        if (updated) setSelected(updated);
    };

    const handleRetry = async (orderId, invoiceId) => {
        setRetryingId(orderId);
        try {
            await electronicInvoiceService.retry(orderId);
            message.success(t("electronic_invoices.retry_success"));
            await refreshSelected(invoiceId);
        } catch (error) {
            message.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "electronic_invoices.retry_error"));
        } finally {
            setRetryingId(null);
        }
    };

    const handleSync = async (orderId, invoiceId) => {
        setSyncingId(orderId);
        try {
            await electronicInvoiceService.sync(orderId);
            message.success(t("electronic_invoices.sync_success"));
            await refreshSelected(invoiceId);
        } catch (error) {
            message.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "electronic_invoices.sync_error_action"));
        } finally {
            setSyncingId(null);
        }
    };

    const handleCreateCreditNote = async ({ conceptCode, observation, items, amount, taxRate }) => {
        if (!selected?.orderId) return;
        setCreditNoteSubmitting(true);
        try {
            const { data } = await electronicInvoiceService.createCreditNote(selected.orderId, { conceptCode, observation, items, amount, taxRate });
            message.success(t("electronic_invoices.credit_note.success"));
            if (data?.stock_restock?.applied) {
                message.success(t("electronic_invoices.credit_note.stock_restock_applied"));
            } else if (items?.length) {
                // Only surface this when items were actually submitted (a
                // restock-eligible concept) - for discount/price_adjustment/
                // other, stock_restock.applied === false is the expected,
                // silent default, not a failure worth a warning toast.
                message.warning(t("electronic_invoices.credit_note.stock_restock_failed"));
            }
            setCreditNoteModalOpen(false);
            await loadCreditNotes(selected.orderId);
        } catch (error) {
            message.error(resolveApiErrorMessage(error, t, CREDIT_NOTE_CODE_MESSAGES, "electronic_invoices.credit_note.error"));
        } finally {
            setCreditNoteSubmitting(false);
        }
    };

    const handleRetryCreditNoteLocalEffect = async (orderId, creditNoteId) => {
        setRetryingCreditNoteId(creditNoteId);
        try {
            await electronicInvoiceService.retryCreditNoteLocalEffect(orderId, creditNoteId);
            message.success(t("electronic_invoices.credit_note.retry_local_effect_success"));
            await loadCreditNotes(orderId);
        } catch (error) {
            message.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "electronic_invoices.credit_note.retry_local_effect_error"));
        } finally {
            setRetryingCreditNoteId(null);
        }
    };

    const metrics = useMemo(() => {
        const counts = { all: 0, accepted: 0, attention: 0, total: 0 };
        for (const key of Object.keys(STATUS_COLORS)) counts[key] = 0;
        for (const i of items) {
            counts.all += 1;
            if (STATUS_COLORS[i.status] !== undefined) counts[i.status] += 1;
            if (i.status === "accepted") counts.accepted += 1;
            if (ATTENTION_STATUSES.has(i.status)) counts.attention += 1;
            counts.total += Number(i.order?.total ?? i.total ?? 0) || 0;
        }
        return { counts, totalAmount: counts.total };
    }, [items]);

    const columns = useMemo(
        () => [
            {
                title: t("electronic_invoices.table.document"),
                render: (_, row) => (
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/25 to-[#44F3F0]/5 text-[#44F3F0] animate-glow-pulse">
                            <FileTextOutlined />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-[var(--ohnix-text-primary)]">{row.invoiceNumber || row.referenceCode}</div>
                            <div className="text-xs text-[var(--ohnix-text-dim)]">
                                {t("electronic_invoices.table.order_prefix")} {row.order?.invoiceNo || "—"} · {getElectronicInvoicingProviderLabel(row.provider)}
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                title: t("electronic_invoices.table.buyer"),
                render: (_, row) => (
                    <div className="min-w-0">
                        <div className="truncate text-sm text-[var(--ohnix-text-soft)]">{row.order?.customerName || "—"}</div>
                    </div>
                ),
            },
            {
                title: t("electronic_invoices.table.amount"),
                render: (_, row) => (
                    <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                        {formatCurrency(Number(row.order?.total ?? row.total ?? 0))}
                    </div>
                ),
                width: 140,
            },
            {
                title: t("electronic_invoices.table.status"),
                dataIndex: "status",
                render: (value) => <StatusPill status={value} />,
                width: 180,
            },
            {
                title: t("electronic_invoices.table.cufe"),
                dataIndex: "cufe",
                render: (value) => <CufeCell cufe={value} />,
                width: 160,
            },
            {
                title: t("electronic_invoices.table.issued"),
                render: (_, row) =>
                    row.issuedAt ? (
                        <div className="text-xs text-[var(--ohnix-text-soft)]">
                            {new Date(row.issuedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                    ) : (
                        <span className="text-xs italic text-[var(--ohnix-text-dim)]">{t("electronic_invoices.table.pending")}</span>
                    ),
                width: 160,
            },
            {
                title: t("electronic_invoices.table.supports"),
                render: (_, row) => (
                    <div className="flex gap-2">
                        {row.pdfUrl ? (
                            <Tooltip title="PDF">
                                <Button
                                    size="small"
                                    icon={<DownloadOutlined />}
                                    href={row.pdfUrl}
                                    target="_blank"
                                    onClick={(e) => e.stopPropagation()}
                                    className="!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0]"
                                />
                            </Tooltip>
                        ) : null}
                        {row.xmlUrl ? (
                            <Tooltip title="XML">
                                <Button
                                    size="small"
                                    icon={<FileTextOutlined />}
                                    href={row.xmlUrl}
                                    target="_blank"
                                    onClick={(e) => e.stopPropagation()}
                                    className="!border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-2)] !text-[var(--ohnix-text-primary)]"
                                />
                            </Tooltip>
                        ) : null}
                    </div>
                ),
                width: 110,
            },
        ],
        [formatCurrency, t]
    );

    const headerSubtitle = useMemo(() => {
        const { counts } = metrics;
        return (
            <span>
                {t("electronic_invoices.subtitle_base")}{" "}
                {counts.accepted > 0 && (
                    <span className="text-[#44F3F0] font-semibold">
                        {t("electronic_invoices.subtitle_accepted", { count: counts.accepted })}
                    </span>
                )}
                {counts.accepted > 0 && counts.attention > 0 ? " · " : ""}
                {counts.attention > 0 && (
                    <span className="text-rose-300 font-semibold">
                        {t("electronic_invoices.subtitle_attention", { count: counts.attention })}
                    </span>
                )}
            </span>
        );
    }, [metrics, t]);

    const metricCards = useMemo(
        () => [
            {
                label: t("electronic_invoices.metrics.documents"),
                value: metrics.counts.all,
                icon: <FileTextOutlined />,
                color: "var(--ohnix-status-purple)",
                hint: t("electronic_invoices.metrics.documents_hint"),
                stagger: "stagger-1",
            },
            {
                label: t("electronic_invoices.metrics.accepted"),
                value: metrics.counts.accepted,
                icon: <CheckCircleOutlined />,
                color: "var(--ohnix-accent-2)",
                hint: t("electronic_invoices.metrics.accepted_hint"),
                stagger: "stagger-2",
            },
            {
                label: t("electronic_invoices.metrics.attention"),
                value: metrics.counts.attention,
                icon: <WarningOutlined />,
                color: "var(--ohnix-status-rose)",
                hint: t("electronic_invoices.metrics.attention_hint"),
                stagger: "stagger-3",
            },
        ],
        [metrics, t]
    );

    const statusCounts = metrics.counts;

    return (
        <div className="p-5 sm:p-7 lg:p-9 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("electronic_invoices.title")}
                subtitle={headerSubtitle}
                icon={<FileTextOutlined />}
                actionIcon={<ReloadOutlined />}
                actionText={loading ? t("electronic_invoices.syncing") : t("electronic_invoices.sync_action")}
                onActionClick={load}
            />

            <section className="mb-6 grid gap-3 sm:grid-cols-3">
                {metricCards.map((m) => (
                    <div key={m.label} className={m.stagger}>
                        <MetricCard label={m.label} value={m.value} icon={m.icon} color={m.color} hint={m.hint} />
                    </div>
                ))}
            </section>

            <section className="module-shell rounded-3xl p-4 sm:p-5 surface-shine">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {STATUS_FILTERS.map((key) => {
                            const isActive = status === key;
                            const label = key === STATUS_ALL ? t("electronic_invoices.filters.all") : t(`electronic_invoices.status.${key}`, { defaultValue: key });
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setStatus(key)}
                                    className={`invoice-filter-chip ${isActive ? "invoice-filter-chip--active" : ""}`}
                                >
                                    {label}
                                    <span className="invoice-filter-chip__count">{statusCounts[key] ?? 0}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onPressEnter={load}
                            prefix={<SearchOutlined className="text-[#29D8D5]" />}
                            placeholder={t("electronic_invoices.search_placeholder")}
                            size="large"
                            className="auth-ohnix-input w-full sm:w-[300px]"
                            allowClear
                        />
                        <Button
                            onClick={load}
                            size="large"
                            className="!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!shadow-[0_0_24px_rgba(41,216,213,0.25)]"
                        >
                            {t("electronic_invoices.search_button")}
                        </Button>
                    </div>
                </div>

                <div className="mb-4 hidden gap-3 md:grid md:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{t("electronic_invoices.stats.total_invoiced")}</div>
                        <div className="text-lg font-bold text-[var(--ohnix-text-primary)]">{formatCurrency(metrics.totalAmount)}</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{t("electronic_invoices.stats.acceptance_rate")}</div>
                        <div className="text-lg font-bold text-[#44F3F0]">
                            {metrics.counts.all ? `${Math.round((metrics.counts.accepted / metrics.counts.all) * 100)}%` : "—"}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{t("electronic_invoices.stats.last_sync")}</div>
                        <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                            <ClockCircleOutlined className="mr-1 text-[#29D8D5]" />
                            {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    </div>
                </div>

                <div className="hidden lg:block rounded-2xl border border-[var(--ohnix-line-3)] overflow-hidden">
                    <Table
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={<span className="text-[var(--ohnix-text-muted)]">{t("electronic_invoices.empty_state")}</span>}
                                />
                            ),
                        }}
                        rowKey="id"
                        loading={loading}
                        dataSource={items}
                        columns={columns}
                        onRow={(record) => ({
                            onClick: () => setSelected(record),
                            className: "cursor-pointer transition-colors",
                        })}
                        pagination={{ pageSize: 10, showTotal: (total) => t("electronic_invoices.table.documents_total", { count: total }) }}
                        className="module-dark-table invoice-premium-table"
                    />
                </div>

                <div className="grid gap-3 lg:hidden">
                    {loading ? (
                        <div className="text-center text-[var(--ohnix-text-muted)] py-10">{t("electronic_invoices.loading_documents")}</div>
                    ) : items.length === 0 ? (
                        <div className="text-center text-[var(--ohnix-text-muted)] py-10">{t("electronic_invoices.empty_state")}</div>
                    ) : (
                        <>
                            {items.slice(0, mobileVisibleCount).map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => setSelected(row)}
                                    className="invoice-mobile-card text-left"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/25 to-[#44F3F0]/5 text-[#44F3F0]">
                                                <FileTextOutlined />
                                            </span>
                                            <div>
                                                <div className="font-semibold text-[var(--ohnix-text-primary)]">{row.invoiceNumber || row.referenceCode}</div>
                                                <div className="text-xs text-[var(--ohnix-text-muted)]">
                                                    {row.order?.customerName || "—"} · {getElectronicInvoicingProviderLabel(row.provider)}
                                                </div>
                                            </div>
                                        </div>
                                        <StatusPill status={row.status} />
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <div className="text-[var(--ohnix-text-muted)]">{t("electronic_invoices.table.amount")}</div>
                                        <div className="font-semibold text-[var(--ohnix-text-primary)]">{formatCurrency(Number(row.order?.total ?? row.total ?? 0))}</div>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-xs">
                                        <div className="text-[var(--ohnix-text-muted)]">{t("electronic_invoices.table.cufe")}</div>
                                        <CufeCell cufe={row.cufe} />
                                    </div>
                                </button>
                            ))}
                            {mobileVisibleCount < items.length && (
                                <Button block onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)}>
                                    {t("common.load_more")}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </section>

            <InvoiceDetailDrawer
                invoice={selected}
                onClose={() => setSelected(null)}
                onRetry={handleRetry}
                onSync={handleSync}
                onOpenCreditNote={() => setCreditNoteModalOpen(true)}
                retrying={Boolean(selected && retryingId === selected.orderId)}
                syncing={Boolean(selected && syncingId === selected.orderId)}
                creditNotes={creditNotes}
                creditNotesLoading={creditNotesLoading}
                onRetryCreditNoteLocalEffect={handleRetryCreditNoteLocalEffect}
                retryingCreditNoteId={retryingCreditNoteId}
            />

            <CreditNoteModal
                open={creditNoteModalOpen}
                onCancel={() => setCreditNoteModalOpen(false)}
                onSubmit={handleCreateCreditNote}
                submitting={creditNoteSubmitting}
                orderId={selected?.orderId}
            />
        </div>
    );
};

export default ElectronicInvoices;
