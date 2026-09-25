import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import { Drawer, Tag, Spin, Button, Table, Divider, Space, Card, Select } from "antd";
import {
    FilePdfOutlined,
    CloseOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    CalendarOutlined,
    WalletOutlined,
    SettingOutlined,
    ArrowRightOutlined,
    SafetyCertificateOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { getStatusColor } from "../../utils/orderHelpers";
import { getStatusIcon } from "../../data";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";
import useIsMobile from "../../hooks/useIsMobile";
import EmptyState from "../common/EmptyState";
import { api } from "../../api/api.js";
import { resolveApiErrorMessage } from "../../utils/apiError";
import WarrantyForm from "../Warranties/WarrantyForm";

const OrderDetailsDrawer = ({
    visible,
    onClose,
    selectedOrder,
    orderDetails,
    detailsLoading,
    onGenerateInvoice,
    orderPayments = [],
    paymentsLoading = false,
    onRegisterPayment,
    canRegisterPayment = false,
}) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { user } = useContext(AuthContext);
    const { team, isOwner, hasPermission } = useTeam();
    const isMobile = useIsMobile();
    const canRegisterWarranty = hasPermission("warranties", "edit");
    const [warrantyLineIndex, setWarrantyLineIndex] = useState(0);
    const [warrantyFormOpen, setWarrantyFormOpen] = useState(false);
    const [registeringWarranty, setRegisteringWarranty] = useState(false);
    // View-only presence here (no lock) - order status changes happen inline
    // in OrdersTable's row select, not in this read-only details drawer, so
    // there's no single "edit form" moment to soft-lock against.
    const { viewers } = useResourcePresence({
        resourceType: "order",
        resourceId: selectedOrder?._id,
        active: visible && Boolean(team) && Boolean(selectedOrder?._id),
    });

    // Section 2/20 of the warranties spec: "Venta → Garantía → Registrar"
    // straight from the order the merchant is already looking at, instead of
    // navigating to Warranties and searching for the invoice again. Only
    // `_id`/`name` travel on the mapped order/customer here (see
    // order.controller.js#mapOrder) - phone/email show as N/A in this
    // preview, but createWarranty re-fetches the real Customer/Product
    // server-side, so the actual snapshot saved is accurate regardless.
    const warrantyPrefillLine = orderDetails?.[warrantyLineIndex];
    const warrantyPrefill = selectedOrder && warrantyPrefillLine
        ? {
              order: {
                  order_id: selectedOrder._id,
                  invoice_no: selectedOrder.invoice_no,
                  order_date: selectedOrder.order_date,
                  customer: selectedOrder.customer_id ? { _id: selectedOrder.customer_id._id, name: selectedOrder.customer_id.name } : null,
              },
              line: {
                  order_detail_id: warrantyPrefillLine._id,
                  quantity: warrantyPrefillLine.quantity,
                  product: warrantyPrefillLine.product_id,
                  variant_id: warrantyPrefillLine.variant_id || null,
              },
          }
        : null;

    const handleCreateWarranty = async (payload) => {
        setRegisteringWarranty(true);
        try {
            const response = await api.post("/warranties", payload);
            if (response.data.data?.already_expired) {
                toast(t("warranties.created_but_already_expired"), { icon: "⚠️" });
            } else {
                toast.success(t("warranties.created_successfully"));
            }
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_creating"));
            return false;
        } finally {
            setRegisteringWarranty(false);
        }
    };

    if (!selectedOrder) return null;

    const isCancelled = selectedOrder.order_status === "cancelled";
    const paidAmount = orderPayments.reduce((sum, p) => sum + p.amount, 0);
    const pendingBalance = Math.max(0, selectedOrder.total - paidAmount);

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
            render: (v) => <span className="font-medium text-[#44F3F0]">{formatCurrency(v)}</span>,
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
        // Fase 4 (multi-moneda) - only ever non-zero for a settleInFull
        // payment against a foreign-currency order.
        ...(orderPayments.some((p) => p.exchange_rate_difference) ? [{
            title: t("finance.exchange_rate_difference_label"),
            dataIndex: "exchange_rate_difference",
            key: "exchange_rate_difference",
            align: "right",
            render: (v) => v ? <span className={v > 0 ? "text-[var(--ohnix-status-success)]" : "text-[var(--ohnix-status-danger)]"}>{v > 0 ? "+" : ""}{formatCurrency(v)}</span> : t("common.na"),
        }] : []),
        // Fase 5 (causación automática) - only non-zero when the payment used
        // a configured PaymentMethod with a fee.
        ...(orderPayments.some((p) => p.fee_amount) ? [{
            title: t("finance.payment_fee_label"),
            dataIndex: "fee_amount",
            key: "fee_amount",
            align: "right",
            render: (v) => v ? <span className="text-[var(--ohnix-status-warning)]">-{formatCurrency(v)}</span> : t("common.na"),
        }] : []),
        // Retenciones the customer practiced - part of the amount paid, but
        // booked as anticipo de impuestos instead of reaching the bank.
        ...(orderPayments.some((p) => p.withheld_income_tax || p.withheld_vat || p.withheld_ica) ? [{
            title: t("finance.payment_withholdings_label"),
            key: "withholdings",
            align: "right",
            render: (_, p) => {
                const total = (p.withheld_income_tax || 0) + (p.withheld_vat || 0) + (p.withheld_ica || 0);
                return total ? <span title={`ReteFuente ${formatCurrency(p.withheld_income_tax || 0)} · ReteIVA ${formatCurrency(p.withheld_vat || 0)} · ReteICA ${formatCurrency(p.withheld_ica || 0)}`}>{formatCurrency(total)}</span> : t("common.na");
            },
        }] : []),
    ];

    const columns = [
        {
            title: t("products.product"),
            dataIndex: ["product_id", "product_name"],
            key: "product_name",
            render: (text) => (
                <div className="flex items-center space-x-2">
                    <ShoppingCartOutlined className="text-[#44F3F0]" />
                    <span className="font-medium text-[var(--ohnix-text-primary)]">
                        {text || t("common.na")}
                    </span>
                </div>
            ),
        },
        {
            title: t("common.quantity"),
            dataIndex: "quantity",
            key: "quantity",
            align: "center",
            width: 100,
            render: (quantity) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#29D8D5]/15 text-[#44F3F0]">
                    {quantity}
                </span>
            ),
        },
        {
            title: t("orders.unit_price"),
            dataIndex: "unitcost",
            key: "unitcost",
            align: "right",
            width: 120,
            render: (price) => (
                <span className="text-[var(--ohnix-text-soft)] font-medium">
                    {formatCurrency(price)}
                </span>
            ),
        },
        {
            title: t("common.total"),
            dataIndex: "total",
            key: "total",
            align: "right",
            width: 120,
            render: (total) => (
                <span className="text-[#44F3F0] font-semibold text-lg">
                    {formatCurrency(total)}
                </span>
            ),
        },
        {
            title: t("purchases.return_status"),
            key: "return_status",
            width: 150,
            render: (_, record) => {
                if (!record.returned_quantity) {
                    return <Tag color="default" className="!bg-[var(--ohnix-line-1)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-muted)]">{t("purchases.not_returned")}</Tag>;
                }
                return (
                    <Space direction="vertical" size="small" className="w-full">
                        <Tag color="gold" className="font-medium">
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
                                    <span className="font-medium text-[#44F3F0]">{record.pending_quantity}</span>
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
        },
    ];

    return (
        <Drawer
            title={
                <div className="text-center w-full">
                    <span className="text-xl font-bold tracking-wide uppercase text-[var(--ohnix-text-primary)]">
                        {t("orders.order_details", { invoiceNo: selectedOrder.invoice_no })}
                    </span>
                </div>
            }
            placement="right"
            onClose={onClose}
            open={visible}
            width={isMobile ? "100vw" : 520}
            closeIcon={<CloseOutlined className="text-[var(--ohnix-text-muted)]" />}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                body: {
                    padding: isMobile ? 16 : 24,
                    background: "var(--ohnix-surface-card-soft)",
                },
                header: {
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: isMobile ? "16px" : "20px 24px",
                    background: "var(--ohnix-surface-card-soft)",
                },
            }}
        >
            <div className="space-y-4 sm:space-y-6">
                {team && <PresenceLockBar viewers={viewers} lock={null} currentUserId={user?.id} />}
                <div className="flex items-center justify-between pb-4 border-b border-[var(--ohnix-line-4)]">
                    <span className="text-sm font-medium text-[var(--ohnix-text-muted)] uppercase tracking-wide">
                        {t("common.status")}
                    </span>
                    <Tag
                        icon={getStatusIcon(selectedOrder.order_status)}
                        color={getStatusColor(selectedOrder.order_status)}
                        className="text-sm font-medium px-3 py-1"
                    >
                        {(t(`orders.${selectedOrder.order_status}`) || selectedOrder.order_status).toUpperCase()}
                    </Tag>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <UserOutlined className="text-[var(--ohnix-text-dim)]" />
                            <span className="text-xs font-medium text-[var(--ohnix-text-muted)] uppercase">
                                {t("customers.customer")}
                            </span>
                        </div>
                        <p className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                            {selectedOrder.customer_id?.name || t("common.na")}
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <CalendarOutlined className="text-[var(--ohnix-text-dim)]" />
                            <span className="text-xs font-medium text-[var(--ohnix-text-muted)] uppercase">
                                {t("orders.order_date")}
                            </span>
                        </div>
                        <p className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                            {dayjs(selectedOrder.order_date).format(
                                "MMMM DD, YYYY"
                            )}
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center space-x-2 mb-2"><CalendarOutlined className="text-[var(--ohnix-text-dim)]" /><span className="text-xs font-medium text-[var(--ohnix-text-muted)] uppercase">{t("orders.due_date")}</span></div>
                        {selectedOrder.due_date ? <Tag color={dayjs(selectedOrder.due_date).isBefore(dayjs(), "day") ? "error" : "cyan"}>{dayjs(selectedOrder.due_date).format("MMMM DD, YYYY")}</Tag> : <span className="text-sm text-[var(--ohnix-text-dim)]">{t("finance.payables_status_unscheduled")}</span>}
                    </div>
                </div>

                <Divider style={{ margin: "24px 0" }} />

                <div>
                    <h3 className="text-sm font-medium text-[var(--ohnix-text-muted)] mb-4 uppercase tracking-wide">
                        {t("orders.order_summary")}
                    </h3>
                    <div className="rounded-2xl p-4 border border-[var(--ohnix-line-4)] space-y-3 bg-[var(--ohnix-line-1)] shadow-[0px_0px_20px_rgba(0,0,0,0.18)]">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--ohnix-text-muted)]">
                                {t("common.total_products")}
                            </span>
                            <span className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                {t("orders.items_count", { count: selectedOrder.total_products })}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--ohnix-text-muted)]">
                                {t("common.subtotal")}
                            </span>
                            <span className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                {formatCurrency(selectedOrder.sub_total)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--ohnix-text-muted)]">
                                {t("orders.gst", { rate: 18 })}
                            </span>
                            <span className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                {formatCurrency(selectedOrder.total - selectedOrder.sub_total)}
                            </span>
                        </div>
                        <Divider style={{ margin: "12px 0", borderColor: "var(--ohnix-line-3)" }} />
                        <div className="flex items-center justify-between">
                            <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                {t("common.total_amount")}
                            </span>
                            <span className="text-xl font-bold text-[#44F3F0]">
                                {formatCurrency(selectedOrder.total)}
                            </span>
                        </div>
                        {selectedOrder.currency_code && selectedOrder.currency_code !== "COP" && (
                            <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-[var(--ohnix-text-dim)]">
                                    {t("orders.foreign_currency_note", { code: selectedOrder.currency_code, rate: selectedOrder.exchange_rate })}
                                </span>
                                <span className="text-xs font-medium text-[var(--ohnix-text-dim)]">
                                    {selectedOrder.currency_code} {Number(selectedOrder.foreign_total).toFixed(2)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <Divider style={{ margin: "24px 0" }} />

                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-[var(--ohnix-text-muted)] uppercase tracking-wide m-0">
                            {t("finance.payments_section_title")}
                        </h3>
                        {!isCancelled && pendingBalance > 0 && canRegisterPayment && (
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
                            <span className={`text-sm font-semibold ${pendingBalance > 0 ? "text-[#44F3F0]" : "text-green-500"}`}>
                                {pendingBalance > 0 ? formatCurrency(pendingBalance) : t("finance.fully_paid")}
                            </span>
                        </div>
                    </div>
                    {paymentsLoading ? (
                        <div className="text-center py-6">
                            <Spin />
                        </div>
                    ) : orderPayments.length > 0 ? (
                        isMobile ? (
                            <div className="space-y-2">
                                {orderPayments.map((p) => (
                                    <div
                                        key={p._id}
                                        className="rounded-xl p-3 border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] flex items-center justify-between gap-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-[#44F3F0] m-0">{formatCurrency(p.amount)}</p>
                                            <p className="text-xs text-[var(--ohnix-text-muted)] m-0 truncate">
                                                {dayjs(p.paid_at).format("DD/MM/YYYY HH:mm")}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs text-[var(--ohnix-text-primary)] m-0 truncate max-w-[120px]">
                                                {p.cash_account?.name || t("common.na")}
                                            </p>
                                            <p className="text-xs text-[var(--ohnix-text-muted)] m-0">{p.method || t("common.na")}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Table
                                dataSource={orderPayments}
                                columns={paymentColumns}
                                pagination={false}
                                rowKey="_id"
                                size="small"
                            />
                        )
                    ) : (
                        <div className="text-sm text-[var(--ohnix-text-muted)] py-2">{t("finance.no_payments")}</div>
                    )}
                </div>

                <Divider style={{ margin: "24px 0" }} />

                <div>
                    <h3 className="text-sm font-medium text-[var(--ohnix-text-muted)] mb-4 uppercase tracking-wide">
                        {t("orders.order_items")}
                    </h3>
                    {detailsLoading ? (
                        <div className="text-center py-12">
                            <Spin size="large" />
                            <p className="mt-4 text-[var(--ohnix-text-muted)] text-sm">
                                {t("common.loading")}
                            </p>
                        </div>
                    ) : orderDetails.length > 0 ? (
                        isMobile ? (
                            <div className="space-y-3">
                                {orderDetails.map((item, index) => (
                                    <Card
                                        key={index}
                                        size="small"
                                        className="module-shell overflow-hidden"
                                        bodyStyle={{ padding: 12 }}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <ShoppingCartOutlined className="text-[#44F3F0] shrink-0" />
                                                <span className="font-medium text-[var(--ohnix-text-primary)] text-sm truncate">
                                                    {item.product_id?.product_name || t("common.na")}
                                                </span>
                                            </div>
                                            <span className="text-[#44F3F0] font-semibold text-sm shrink-0">
                                                {formatCurrency(item.total)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-[var(--ohnix-text-muted)]">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#29D8D5]/15 text-[#44F3F0] font-medium">
                                                {t("common.quantity")}: {item.quantity}
                                            </span>
                                            <span>{t("orders.unit_price")}: {formatCurrency(item.unitcost)}</span>
                                        </div>
                                        {item.returned_quantity ? (
                                            <div className="mt-2 pt-2 border-t border-[var(--ohnix-line-3)] flex items-center justify-between text-xs">
                                                <Tag color="gold" className="font-medium m-0">
                                                    {t(item.fully_returned ? "purchases.returned" : "purchases.return_preview_partial_return")}
                                                </Tag>
                                                <span className="text-red-400 font-medium">
                                                    {t("purchases.refund")}: {formatCurrency(item.refund_amount)}
                                                </span>
                                            </div>
                                        ) : null}
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Table
                                className="module-dark-table"
                                dataSource={orderDetails}
                                columns={columns}
                                pagination={false}
                                rowKey={(record, index) => index}
                                size="middle"
                                bordered
                            />
                        )
                    ) : (
                        <EmptyState icon={<ShoppingCartOutlined />} title={t("orders.no_items_found")} compact />
                    )}
                </div>

                {!isCancelled && (
                    <div className="pt-4">
                        <Button
                            type="primary"
                            icon={<FilePdfOutlined />}
                            onClick={() =>
                                onGenerateInvoice(
                                    selectedOrder._id,
                                    selectedOrder.invoice_no
                                )
                            }
                            className="w-full"
                            size="large"
                        >
                            {t("orders.download_invoice_pdf")}
                        </Button>
                        {isOwner && (
                            <Link
                                to="/team?tab=settings"
                                className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--ohnix-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--ohnix-accent)]"
                            >
                                <SettingOutlined className="text-[13px]" />
                                {t("team.company_branding_title")}
                                <ArrowRightOutlined className="text-[10px]" />
                            </Link>
                        )}
                    </div>
                )}

                {!isCancelled && canRegisterWarranty && orderDetails?.length > 0 && (
                    <>
                        <Divider orientation="left" className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("warranties.title")}
                        </Divider>
                        <Card className="border-0 shadow-sm">
                            <Space direction="vertical" size="middle" className="w-full">
                                {orderDetails.length > 1 && (
                                    <Select
                                        className="w-full"
                                        value={warrantyLineIndex}
                                        onChange={setWarrantyLineIndex}
                                        options={orderDetails.map((item, index) => ({
                                            value: index,
                                            label: item.product_id?.product_name || t("common.na"),
                                        }))}
                                    />
                                )}
                                <Button
                                    icon={<SafetyCertificateOutlined />}
                                    onClick={() => setWarrantyFormOpen(true)}
                                    className="w-full"
                                >
                                    {t("warranties.register_warranty")}
                                </Button>
                            </Space>
                        </Card>
                    </>
                )}
            </div>

            <WarrantyForm
                open={warrantyFormOpen}
                onClose={() => setWarrantyFormOpen(false)}
                onSubmit={handleCreateWarranty}
                submitting={registeringWarranty}
                lookupSale={async () => []}
                prefill={warrantyPrefill}
            />
        </Drawer>
    );
};

export default OrderDetailsDrawer;
