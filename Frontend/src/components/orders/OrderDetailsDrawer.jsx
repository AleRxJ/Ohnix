import { useContext } from "react";
import { Link } from "react-router-dom";
import { Drawer, Tag, Spin, Button, Table, Divider, Space, Card } from "antd";
import {
    FilePdfOutlined,
    CloseOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    CalendarOutlined,
    WalletOutlined,
    SettingOutlined,
    ArrowRightOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
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
    const { team, isOwner } = useTeam();
    const isMobile = useIsMobile();
    // View-only presence here (no lock) - order status changes happen inline
    // in OrdersTable's row select, not in this read-only details drawer, so
    // there's no single "edit form" moment to soft-lock against.
    const { viewers } = useResourcePresence({
        resourceType: "order",
        resourceId: selectedOrder?._id,
        active: visible && Boolean(team) && Boolean(selectedOrder?._id),
    });

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
            </div>
        </Drawer>
    );
};

export default OrderDetailsDrawer;
