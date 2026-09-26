import React, { useContext, useEffect, useState } from "react";
import {
    Modal,
    Table,
    Descriptions,
    Divider,
    Tag,
    Typography,
    Card,
    Space,
    Button,
    Spin,
    Input,
    DatePicker,
} from "antd";
import { WalletOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { calculatePurchaseFinancials, getStatusColor } from "../../utils/purchaseUtils";
import { getStatusIconPurchase } from "../../data";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";
import { receiptAcknowledgmentService } from "../../services/receiptAcknowledgmentService";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { getConnectivityState } from "../../offline/connectivity";
import { mirrorGet, mirrorUpsert, queueUpdate } from "../../offline/entityQueue";
import { enqueueOperation } from "../../offline/outbox";

// Same reasoning as PurchaseSupportDocuments.jsx's PLAN_GATE_CODE_MESSAGES -
// receiptAcknowledgment.service.js's own ensureElectronicInvoicingPlan
// throws the same English-by-design, code-tagged error.
const RECEIPT_CODE_MESSAGES = {
    electronic_invoicing_plan_required: "fiscal_setup.plan_required",
};

const RECEIPT_STATUS_COLORS = {
    accepted: "var(--ohnix-accent-2)",
    issuing: "var(--ohnix-status-purple)",
    submitted: "var(--ohnix-status-purple)",
    rejected: "var(--ohnix-status-rose)",
    error: "var(--ohnix-status-rose)",
    cancelled: "var(--ohnix-text-dim)",
    draft: "var(--ohnix-status-amber)",
    contingency: "var(--ohnix-status-amber)",
};

const ReceiptStatusPill = ({ status, t }) => {
    if (!status) {
        return <Tag className="!bg-[var(--ohnix-line-1)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-muted)]">{t("purchase_acknowledgment.status_not_sent")}</Tag>;
    }
    const color = RECEIPT_STATUS_COLORS[status] || "var(--ohnix-text-dim)";
    return (
        <span className="status-pill" style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}>
            <span className={`status-dot status-dot--${status}`} />
            {t(`purchase_acknowledgment.status.${status}`, { defaultValue: status })}
        </span>
    );
};

const { Text, Title } = Typography;

const PurchaseDetails = ({
    visible,
    onCancel,
    purchase,
    details,
    purchasePayments = [],
    paymentsLoading = false,
    onRegisterPayment,
    canRegisterPayment = false,
}) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { user } = useContext(AuthContext);
    const { team, hasPermission } = useTeam();
    // Aceptación expresa / reclamo are binding RADIAN events - purchases:"admin"
    // on the backend (purchase.routes.js); the acuse de recibo stays "edit".
    const canSendBindingRadianEvents = hasPermission("purchases", "admin");
    const financials = calculatePurchaseFinancials(details, purchase?.retentions || [], purchasePayments);
    // View-only presence, same reasoning as OrderDetailsDrawer.
    const { viewers } = useResourcePresence({
        resourceType: "purchase",
        resourceId: purchase?._id,
        active: visible && Boolean(team) && Boolean(purchase?._id),
    });

    // RADIAN buyer-side acknowledgment (acuse de recibo / recibo del bien /
    // aceptación expresa / reclamo) - only relevant when this purchase's
    // supplier issues its own real electronic invoice (opposite precondition
    // from Documento Soporte). Self-fetched here since this modal doesn't
    // otherwise pull purchase-scoped side data through the parent hook.
    const supplierIssuesElectronicInvoice = Boolean(purchase?.supplier_id?.issues_electronic_invoice);
    const [receiptState, setReceiptState] = useState(null);
    const [receiptLoading, setReceiptLoading] = useState(false);
    const [receiptBusy, setReceiptBusy] = useState("");
    const [referenceForm, setReferenceForm] = useState({ number: "", cufe: "", issuedAt: null });
    const [reclamoReason, setReclamoReason] = useState("");
    const [reclamoModalOpen, setReclamoModalOpen] = useState(false);

    // Invented per-purchase mirror (keyed by purchaseId), same shape as
    // LocationStockPanel.jsx's locationStockSummaries - GET .../receipt-acknowledgment
    // isn't a list endpoint, so there's nothing to register a full-resync
    // pull against in entitySync.js; this is write-through-on-view only.
    const refreshReceipt = async () => {
        if (!purchase?._id) return;
        setReceiptLoading(true);
        if (!getConnectivityState()) {
            const cached = await mirrorGet("receiptAcknowledgments", purchase._id);
            setReceiptState(cached || null);
            setReceiptLoading(false);
            return;
        }
        try {
            const response = await receiptAcknowledgmentService.getForPurchase(purchase._id);
            const data = response?.data || null;
            setReceiptState(data);
            if (data) await mirrorUpsert("receiptAcknowledgments", { ...data, _id: purchase._id });
        } catch (error) {
            if (!error.response) {
                const cached = await mirrorGet("receiptAcknowledgments", purchase._id);
                setReceiptState(cached || null);
                return;
            }
            setReceiptState(null);
        } finally {
            setReceiptLoading(false);
        }
    };

    useEffect(() => {
        if (visible && purchase?._id && supplierIssuesElectronicInvoice) {
            refreshReceipt();
        } else {
            setReceiptState(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, purchase?._id, supplierIssuesElectronicInvoice]);

    const receipt = receiptState?.receipt;

    const handleSaveReference = async () => {
        try {
            setReceiptBusy("reference");
            const supplierIssuedAtIso = referenceForm.issuedAt ? referenceForm.issuedAt.toISOString() : null;
            if (!getConnectivityState()) {
                // User-typed data, no server-computed side effect (no DIAN
                // call happens here at all - just recording a reference) -
                // safe to reflect optimistically, unlike the DIAN-triggering
                // actions below. optimisticPatch rebuilds the nested
                // `receipt.*` shape the UI reads, since the raw request body
                // (snake_case, flat) doesn't match it - same reasoning as
                // adjust-stock's own optimisticPatch in entityQueue.js's doc
                // comment.
                const existingMirror = await mirrorGet("receiptAcknowledgments", purchase._id);
                const existingReceipt = existingMirror?.receipt;
                await queueUpdate({
                    entity: "receiptAcknowledgments",
                    url: `/purchases/${purchase._id}/receipt-acknowledgment/reference`,
                    id: purchase._id,
                    method: "post",
                    fields: {
                        supplier_invoice_number: referenceForm.number,
                        supplier_cufe: referenceForm.cufe,
                        supplier_issued_at: supplierIssuedAtIso,
                    },
                    optimisticPatch: {
                        purchaseId: purchase._id,
                        purchaseNo: purchase.purchase_no,
                        supplierIssuesElectronicInvoice: true,
                        receipt: {
                            ...(existingReceipt || {
                                acuse: { status: "draft", externalId: null, sentAt: null },
                                recepcion: { status: "draft", externalId: null, sentAt: null },
                                aceptacionExpresa: { status: null, externalId: null, sentAt: null },
                                reclamo: { status: null, externalId: null, sentAt: null, reason: null },
                                tacita: { deadlineAt: null, appliedAt: null },
                            }),
                            supplierInvoiceNumber: referenceForm.number,
                            supplierCufe: referenceForm.cufe,
                            supplierIssuedAt: supplierIssuedAtIso,
                        },
                    },
                });
                toast.success(t("common.offline_saved_locally"));
                await refreshReceipt();
                return;
            }
            await receiptAcknowledgmentService.recordReference(purchase._id, {
                supplierInvoiceNumber: referenceForm.number,
                supplierCufe: referenceForm.cufe,
                supplierIssuedAt: supplierIssuedAtIso || undefined,
            });
            toast.success(t("purchase_acknowledgment.reference_saved"));
            await refreshReceipt();
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, RECEIPT_CODE_MESSAGES, "purchase_acknowledgment.reference_error"));
        } finally {
            setReceiptBusy("");
        }
    };

    // Aceptación expresa / reclamo trigger real DIAN/RADIAN state transitions
    // computed server-side (same principle as useOrderOperations.js's
    // registerOrderPayment / LocationStockPanel's handleQuickTransfer) - the
    // client must never guess/optimistically set acuse/aceptación/reclamo
    // status. Queued as opType "custom" with no mirror mutation at all; the
    // pill keeps showing the last-confirmed state until the real sync
    // completes and refreshReceipt is called again.
    const handleTriggerAceptacion = async () => {
        try {
            setReceiptBusy("aceptacion");
            if (!getConnectivityState()) {
                await enqueueOperation({
                    entity: "receiptAcknowledgments",
                    opType: "custom",
                    request: { method: "post", url: `/purchases/${purchase._id}/receipt-acknowledgment/aceptacion-expresa` },
                });
                toast.success(t("common.offline_saved_locally"));
                return;
            }
            await receiptAcknowledgmentService.triggerAceptacionExpresa(purchase._id);
            toast.success(t("purchase_acknowledgment.aceptacion_sent"));
            await refreshReceipt();
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, RECEIPT_CODE_MESSAGES, "purchase_acknowledgment.aceptacion_error"));
        } finally {
            setReceiptBusy("");
        }
    };

    const handleTriggerReclamo = async () => {
        try {
            setReceiptBusy("reclamo");
            if (!getConnectivityState()) {
                await enqueueOperation({
                    entity: "receiptAcknowledgments",
                    opType: "custom",
                    request: { method: "post", url: `/purchases/${purchase._id}/receipt-acknowledgment/reclamo`, data: { reason: reclamoReason } },
                });
                toast.success(t("common.offline_saved_locally"));
                setReclamoModalOpen(false);
                setReclamoReason("");
                return;
            }
            await receiptAcknowledgmentService.triggerReclamo(purchase._id, reclamoReason);
            toast.success(t("purchase_acknowledgment.reclamo_sent"));
            setReclamoModalOpen(false);
            setReclamoReason("");
            await refreshReceipt();
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, RECEIPT_CODE_MESSAGES, "purchase_acknowledgment.reclamo_error"));
        } finally {
            setReceiptBusy("");
        }
    };

    const tacitaWindowOpen = Boolean(
        receipt?.recepcion?.status &&
        ["accepted", "contingency"].includes(receipt.recepcion.status) &&
        !receipt.tacita?.appliedAt &&
        !receipt.aceptacionExpresa?.status &&
        !receipt.reclamo?.status &&
        (!receipt.tacita?.deadlineAt || dayjs(receipt.tacita.deadlineAt).isAfter(dayjs()))
    );

    const detailColumns = [
        {
            title: t("products.product"),
            dataIndex: ["product_id", "product_name"],
            key: "product_name",
            render: (_, record) => (
                <div className="font-medium text-[var(--ohnix-text-primary)]">
                    {record.product_id?.product_name || t("common.na")}
                </div>
            ),
            width: 200,
            ellipsis: true,
        },
        {
            title: t("products.product_code"),
            dataIndex: ["product_id", "product_code"],
            key: "product_code",
            render: (_, record) => (
                <Text code className="text-xs">
                    {record.product_id?.product_code || t("common.na")}
                </Text>
            ),
            width: 120,
        },
        {
            title: t("common.quantity"),
            dataIndex: "quantity",
            key: "quantity",
            render: (quantity) => (
                <div className="text-center font-medium text-[var(--ohnix-accent)]">
                    {quantity}
                </div>
            ),
            width: 100,
            align: "center",
        },
        {
            title: t("purchases.unit_price"),
            dataIndex: "unitcost",
            key: "unitcost",
            render: (cost) => (
                <div className="font-medium text-[var(--ohnix-accent)]">
                    {formatCurrency(cost)}
                </div>
            ),
            width: 120,
            align: "right",
        },
        {
            title: t("common.total"),
            dataIndex: "total",
            key: "total",
            render: (total) => (
                <div className="font-semibold text-[var(--ohnix-text-primary)]">
                    {formatCurrency(total)}
                </div>
            ),
            width: 120,
            align: "right",
        },
        {
            title: t("purchases.return_status"),
            key: "return_status",
            render: (_, record) => {
                if (!record.returned_quantity) {
                    return <Tag color="default" className="!bg-[var(--ohnix-line-1)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-muted)]">{t("purchases.not_returned")}</Tag>;
                }
                return (
                    <Space direction="vertical" size="small" className="w-full">
                        <Tag color={record.fully_returned ? "red" : "gold"} className="font-medium">
                            {t(record.fully_returned ? "purchases.returned" : "purchases.return_preview_partial_return")}
                        </Tag>
                        <div className="text-xs text-[var(--ohnix-text-muted)] space-y-1">
                            <div>
                                {t("purchases.qty")}:{" "}
                                <span className="font-medium">{record.returned_quantity}</span>
                            </div>
                            {record.pending_quantity > 0 && (
                                <div>
                                    {t("purchases.return_col_pending")}:{" "}
                                    <span className="font-medium text-[var(--ohnix-accent)]">{record.pending_quantity}</span>
                                </div>
                            )}
                            <div>
                                {t("purchases.refund")}:{" "}
                                <span className="font-medium text-red-400">{formatCurrency(record.refund_amount)}</span>
                            </div>
                        </div>
                    </Space>
                );
            },
            width: 160,
        },
    ];

    return (
        <Modal
            title={
                <div className="flex items-center space-x-2">
                    <Title level={4} className="mb-0 !text-[var(--ohnix-text-primary)]">{t("purchases.purchase_details")}</Title>
                    <Tag color="cyan" className="text-sm">{purchase?.purchase_no}</Tag>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width="95%"
            style={{ maxWidth: 1200 }}
            className="purchase-details-modal"
        >
            {purchase && team && (
                <PresenceLockBar viewers={viewers} lock={null} currentUserId={user?.id} />
            )}
            {purchase && (
                <Card className="mb-6 border-0 shadow-sm">
                    <Descriptions
                        column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
                        bordered
                        size="small"
                        className="purchase-info"
                    >
                        <Descriptions.Item label={t("purchases.purchase_number")}>
                                    <Text strong className="text-[#44F3F0]">{purchase.purchase_no}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.supplier")}>
                            <Text strong className="text-[var(--ohnix-text-primary)]">{purchase.supplier_id?.name}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.purchase_date")}>
                            <Text className="text-[var(--ohnix-text-soft)]">{dayjs(purchase.purchase_date).format("DD/MM/YYYY")}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.due_date")}>
                            {purchase.due_date ? <Tag color={dayjs(purchase.due_date).isBefore(dayjs(), "day") ? "error" : "cyan"}>{dayjs(purchase.due_date).format("DD/MM/YYYY")}</Tag> : <Text type="secondary">{t("reports.advanced.cartera_unscheduled")}</Text>}
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.status")}>
                            <Tag
                                color={getStatusColor(purchase.purchase_status)}
                                icon={getStatusIconPurchase(
                                    purchase.purchase_status
                                )}
                                className="font-medium"
                            >
                                {t(`purchases.${purchase.purchase_status}`) || purchase.purchase_status.toUpperCase()}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("common.created_by")}>
                            <Text className="text-[var(--ohnix-text-soft)]">{purchase.created_by?.username}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("purchases.created_at")}>
                            <Text className="text-[var(--ohnix-text-soft)]">{dayjs(purchase.createdAt).format("DD/MM/YYYY HH:mm")}</Text>
                        </Descriptions.Item>
                        {purchase.currency_code && purchase.currency_code !== "COP" && (
                            <Descriptions.Item label={t("purchases.currency_code")}>
                                <Text className="text-[var(--ohnix-text-soft)]">{purchase.currency_code} · {t("purchases.exchange_rate")}: {formatCurrency(purchase.exchange_rate)}</Text>
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                </Card>
            )}

            <Divider orientation="left" className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{t("purchases.purchase_items")}</Divider>

            <Table
                columns={detailColumns}
                dataSource={details}
                rowKey="_id"
                pagination={false}
                scroll={{ x: 800 }}
                size="small"
                className="purchase-items-table module-dark-table"
                rowClassName="hover:bg-[var(--ohnix-hover-overlay)] transition-colors duration-200"
                summary={(pageData) => {
                    const total = pageData.reduce(
                        (sum, record) => sum + (record.total || 0),
                        0
                    );
                    const totalRefund = pageData.reduce(
                        (sum, record) => sum + (record.refund_amount || 0),
                        0
                    );

                    return (
                        <Table.Summary fixed>
                            <Table.Summary.Row className="bg-[var(--ohnix-line-1)]">
                                <Table.Summary.Cell index={0} colSpan={4}>
                                    <Text strong className="text-[var(--ohnix-text-primary)]">{t("purchases.total_amount_label")}</Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={4}>
                                    <Text
                                        strong
                                        className="text-lg text-[#44F3F0]"
                                    >
                                        {formatCurrency(total)}
                                    </Text>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={5}>
                                    {totalRefund > 0 && (
                                        <Text strong type="danger" className="text-sm">{t("purchases.total_refund_label")} {formatCurrency(totalRefund)}</Text>
                                    )}
                                </Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    );
                }}
            />

            <div className="purchase-accounting-breakdown">
                <div className="purchase-accounting-breakdown__heading">
                    <div>
                        <span>{t("purchases.accounting_breakdown_eyebrow")}</span>
                        <h3>{t("purchases.accounting_breakdown_title")}</h3>
                        <p>{t("purchases.accounting_breakdown_desc")}</p>
                    </div>
                    <Tag color={(purchase?.retentions || []).length > 0 ? "cyan" : "default"}>
                        {(purchase?.retentions || []).length > 0 ? t("purchases.withholdings_applied") : t("purchases.withholdings_none")}
                    </Tag>
                </div>
                <div className="purchase-accounting-breakdown__totals">
                    <div><span>{t("purchases.gross_total")}</span><strong>{formatCurrency(financials.grossTotal)}</strong></div>
                    <div><span>{t("purchases.returns_total")}</span><strong className="text-[var(--ohnix-status-danger)]">− {formatCurrency(financials.returnedTotal)}</strong></div>
                    <div><span>{t("purchases.withholding_total")}</span><strong className="text-[var(--ohnix-status-warning)]">− {formatCurrency(financials.outstandingWithholding)}</strong></div>
                    <div className="purchase-accounting-breakdown__net"><span>{t("purchases.net_payable")}</span><strong>{formatCurrency(financials.netPayable)}</strong></div>
                </div>
                {(purchase?.retentions || []).length > 0 && (
                    <div className="purchase-retention-list">
                        {purchase.retentions.map((retention) => (
                            <div key={retention._id} className="purchase-retention-item">
                                <div><Tag color="cyan">{retention.concept_code}</Tag><span>{retention.concept_name}</span></div>
                                <small>{retention.chart_account ? `${retention.chart_account.code} · ${retention.chart_account.name}` : t("common.na")}</small>
                                <div><span>{retention.rate_percent}%</span><strong>{formatCurrency(Number(retention.withheld_amount) - Number(retention.returned_withheld_amount))}</strong></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {purchase && (
                <>
                    <Divider orientation="left" className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("finance.payments_section_title")}
                    </Divider>
                    {(() => {
                        const { paidAmount, pendingBalance } = financials;
                        const paymentColumns = [
                            {
                                title: t("finance.col_date"),
                                dataIndex: "paid_at",
                                key: "paid_at",
                                render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm"),
                            },
                            {
                                title: t("finance.col_amount"),
                                dataIndex: "amount",
                                key: "amount",
                                align: "right",
                                render: (v) => <span className="font-medium text-[var(--ohnix-accent)]">{formatCurrency(v)}</span>,
                            },
                            {
                                title: t("finance.cash_account_label"),
                                dataIndex: "cash_account",
                                key: "cash_account",
                                render: (v) => v?.name || t("common.na"),
                            },
                            {
                                title: t("finance.method_label"),
                                dataIndex: "method",
                                key: "method",
                                render: (v) => v || t("common.na"),
                            },
                            // Fase 4 (multi-moneda) - see OrderDetailsDrawer.jsx's matching comment.
                            ...(purchasePayments.some((p) => p.exchange_rate_difference) ? [{
                                title: t("finance.exchange_rate_difference_label"),
                                dataIndex: "exchange_rate_difference",
                                key: "exchange_rate_difference",
                                align: "right",
                                render: (v) => v ? <span className={v > 0 ? "text-[var(--ohnix-status-success)]" : "text-[var(--ohnix-status-danger)]"}>{v > 0 ? "+" : ""}{formatCurrency(v)}</span> : t("common.na"),
                            }] : []),
                            // Fase 5 (causación automática) - see OrderDetailsDrawer.jsx's matching
                            // comment; on the purchase side the fee is an extra cost on top of the
                            // payable, so it's shown as an addition rather than a deduction.
                            ...(purchasePayments.some((p) => p.fee_amount) ? [{
                                title: t("finance.payment_fee_label"),
                                dataIndex: "fee_amount",
                                key: "fee_amount",
                                align: "right",
                                render: (v) => v ? <span className="text-[var(--ohnix-status-warning)]">+{formatCurrency(v)}</span> : t("common.na"),
                            }] : []),
                        ];
                        return (
                            <>
                                <div className="flex items-center justify-end mb-3">
                                    {pendingBalance > 0 && canRegisterPayment && (
                                        <Button size="small" icon={<WalletOutlined />} onClick={onRegisterPayment}>
                                            {t("finance.register_payment")}
                                        </Button>
                                    )}
                                </div>
                                <div className="rounded-2xl p-4 border border-[var(--ohnix-line-4)] space-y-3 bg-[var(--ohnix-line-1)] mb-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-[var(--ohnix-text-muted)]">{t("finance.paid_amount_label")}</span>
                                        <span className="text-sm font-medium text-[var(--ohnix-text-primary)]">{formatCurrency(paidAmount)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-[var(--ohnix-text-muted)]">{t("finance.pending_balance_label")}</span>
                                        <span className="text-sm font-semibold" style={{ color: pendingBalance > 0 ? "var(--ohnix-accent)" : "var(--ohnix-status-success)" }}>
                                            {pendingBalance > 0 ? formatCurrency(pendingBalance) : t("finance.fully_paid")}
                                        </span>
                                    </div>
                                </div>
                                {paymentsLoading ? (
                                    <div className="text-center py-6">
                                        <Spin />
                                    </div>
                                ) : purchasePayments.length > 0 ? (
                                    <Table className="module-dark-table" dataSource={purchasePayments} columns={paymentColumns} pagination={false} rowKey="_id" size="small" />
                                ) : (
                                    <div className="text-sm text-[var(--ohnix-text-muted)] py-2">{t("finance.no_payments")}</div>
                                )}
                            </>
                        );
                    })()}
                </>
            )}

            {purchase && supplierIssuesElectronicInvoice && (
                <>
                    <Divider orientation="left" className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {t("purchase_acknowledgment.section_title")}
                    </Divider>
                    {receiptLoading ? (
                        <div className="text-center py-6"><Spin /></div>
                    ) : !receipt ? (
                        <Card className="border-0 shadow-sm">
                            <p className="text-sm text-[var(--ohnix-text-muted)] mb-3">{t("purchase_acknowledgment.reference_hint")}</p>
                            <Space direction="vertical" size="middle" className="w-full">
                                <Space wrap>
                                    <Input
                                        className="auth-ohnix-input"
                                        style={{ width: 220 }}
                                        placeholder={t("purchase_acknowledgment.field_invoice_number")}
                                        value={referenceForm.number}
                                        onChange={(e) => setReferenceForm((prev) => ({ ...prev, number: e.target.value }))}
                                    />
                                    <Input
                                        className="auth-ohnix-input"
                                        style={{ width: 320 }}
                                        placeholder={t("purchase_acknowledgment.field_cufe")}
                                        value={referenceForm.cufe}
                                        onChange={(e) => setReferenceForm((prev) => ({ ...prev, cufe: e.target.value }))}
                                    />
                                    <DatePicker
                                        placeholder={t("purchase_acknowledgment.field_issued_at")}
                                        value={referenceForm.issuedAt}
                                        onChange={(value) => setReferenceForm((prev) => ({ ...prev, issuedAt: value }))}
                                    />
                                </Space>
                                <Button
                                    type="primary"
                                    loading={receiptBusy === "reference"}
                                    disabled={!referenceForm.number || !referenceForm.cufe}
                                    onClick={handleSaveReference}
                                >
                                    {t("purchase_acknowledgment.save_reference")}
                                </Button>
                            </Space>
                        </Card>
                    ) : (
                        <Card className="border-0 shadow-sm">
                            <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[var(--ohnix-text-muted)]">
                                <span>{t("purchase_acknowledgment.field_invoice_number")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{receipt.supplierInvoiceNumber}</span></span>
                                <span>{t("purchase_acknowledgment.field_cufe")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{receipt.supplierCufe}</span></span>
                            </div>
                            <Space direction="vertical" size="middle" className="w-full">
                                <div className="flex items-center justify-between">
                                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("purchase_acknowledgment.event_acuse")}</Text>
                                    <ReceiptStatusPill status={receipt.acuse?.status} t={t} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("purchase_acknowledgment.event_recepcion")}</Text>
                                    <ReceiptStatusPill status={receipt.recepcion?.status} t={t} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("purchase_acknowledgment.event_aceptacion")}</Text>
                                    <ReceiptStatusPill status={receipt.aceptacionExpresa?.status} t={t} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("purchase_acknowledgment.event_reclamo")}</Text>
                                    <ReceiptStatusPill status={receipt.reclamo?.status} t={t} />
                                </div>
                                <Divider className="!my-2" />
                                <div className="flex items-center justify-between">
                                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("purchase_acknowledgment.tacita_label")}</Text>
                                    {receipt.tacita?.appliedAt ? (
                                        <Tag color="cyan">{t("purchase_acknowledgment.tacita_applied", { date: dayjs(receipt.tacita.appliedAt).format("DD/MM/YYYY") })}</Tag>
                                    ) : receipt.reclamo?.status ? (
                                        <Tag>{t("purchase_acknowledgment.tacita_cancelled")}</Tag>
                                    ) : receipt.tacita?.deadlineAt ? (
                                        <Tag color="gold">{t("purchase_acknowledgment.tacita_countdown", { date: dayjs(receipt.tacita.deadlineAt).format("DD/MM/YYYY") })}</Tag>
                                    ) : (
                                        <Tag>{t("purchase_acknowledgment.tacita_not_applicable")}</Tag>
                                    )}
                                </div>
                                {tacitaWindowOpen && canSendBindingRadianEvents && (
                                    <Space wrap className="pt-2">
                                        <Button loading={receiptBusy === "aceptacion"} onClick={handleTriggerAceptacion}>
                                            {t("purchase_acknowledgment.action_aceptacion")}
                                        </Button>
                                        <Button danger onClick={() => setReclamoModalOpen(true)}>
                                            {t("purchase_acknowledgment.action_reclamo")}
                                        </Button>
                                    </Space>
                                )}
                            </Space>
                        </Card>
                    )}
                </>
            )}

            <Modal
                title={t("purchase_acknowledgment.reclamo_modal_title")}
                open={reclamoModalOpen}
                onCancel={() => setReclamoModalOpen(false)}
                onOk={handleTriggerReclamo}
                confirmLoading={receiptBusy === "reclamo"}
                okButtonProps={{ danger: true, disabled: reclamoReason.trim().length < 10 }}
                okText={t("purchase_acknowledgment.action_reclamo")}
            >
                <Input.TextArea
                    rows={4}
                    placeholder={t("purchase_acknowledgment.reclamo_reason_placeholder")}
                    value={reclamoReason}
                    onChange={(e) => setReclamoReason(e.target.value)}
                />
            </Modal>
        </Modal>
    );
};

export default PurchaseDetails;
