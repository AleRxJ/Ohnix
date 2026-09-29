import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Drawer, Grid, Select } from "antd";
import { ShopOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";

import PosProductGrid from "../components/pos/PosProductGrid";
import PosCart from "../components/pos/PosCart";
import PosCheckoutModal from "../components/pos/PosCheckoutModal";
import "../components/pos/pos.css";

import { api } from "../api/api";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import { usePosCart } from "../hooks/pos/usePosCart";
import { isFinalConsumer, usePosCatalog } from "../hooks/pos/usePosCatalog";
import { usePointOfSaleFieldVisible } from "../components/common/PointOfSaleField";
import { getConnectivityState, subscribeConnectivity } from "../offline/connectivity";
import { queueCreate } from "../offline/entityQueue";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";
import { formatCurrency } from "../utils/currency";

const LOCATION_KEY = "ohnix.pos.pointOfSaleId";

const readStoredLocation = () => {
    try {
        return localStorage.getItem(LOCATION_KEY);
    } catch {
        return null;
    }
};

// Caja: the counter-speed way to sell - tap/scan products, charge, done.
// A sale here is an ordinary completed order (same POST /orders, same stock/
// ledger/DIAN path as the order modal), optionally with its payment attached
// in the same request (see order.controller.js#createOrder) so an offline
// checkout is one outbox entry.
const PosRegister = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { hasPermission } = useTeam();
    const canSell = hasPermission("orders", "edit");
    const canRegisterPayment = hasPermission("finance", "edit");
    const screens = Grid.useBreakpoint();
    const isDesktop = screens.lg !== false;
    const einvoicing =
        ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && Boolean(user?.company?.electronicInvoicingEnabled);

    // --- Location (only a choice when the actor really has more than one) --
    const { options: locationOptions } = usePointOfSaleFieldVisible({ salesOnly: true });
    const hasLocationChoice = (locationOptions?.length || 0) > 1;
    const [pointOfSaleId, setPointOfSaleId] = useState(undefined);
    useEffect(() => {
        if (!hasLocationChoice) {
            setPointOfSaleId(undefined);
            return;
        }
        const stored = readStoredLocation();
        setPointOfSaleId((current) => {
            if (current && locationOptions.some((o) => o.id === current)) return current;
            return locationOptions.find((o) => o.id === stored)?.id || locationOptions[0].id;
        });
    }, [hasLocationChoice, locationOptions]);
    const changeLocation = (id) => {
        setPointOfSaleId(id);
        try {
            localStorage.setItem(LOCATION_KEY, id);
        } catch {
            // Only a convenience - the select still works this session.
        }
    };

    const catalog = usePosCatalog({ pointOfSaleId, canRegisterPayment });
    const cart = usePosCart();

    // --- Customer (walk-in "Consumidor final" unless the cashier picks one) -
    const [customer, setCustomer] = useState(null);
    useEffect(() => {
        setCustomer((current) => (current && !isFinalConsumer(current) ? current : catalog.finalConsumer));
    }, [catalog.finalConsumer]);
    // Same rule as CreateOrderModal: a customer belongs to one location.
    const locationCustomers = useMemo(
        () =>
            catalog.customers.filter(
                (c) => !pointOfSaleId || !c.point_of_sale?._id || String(c.point_of_sale._id) === String(pointOfSaleId)
            ),
        [catalog.customers, pointOfSaleId]
    );
    useEffect(() => {
        if (customer && !locationCustomers.some((c) => c._id === customer._id)) setCustomer(catalog.finalConsumer);
    }, [locationCustomers, customer, catalog.finalConsumer]);

    // --- Connectivity ------------------------------------------------------
    const [online, setOnline] = useState(getConnectivityState());
    useEffect(() => subscribeConnectivity(() => setOnline(getConnectivityState())), []);

    // --- Checkout ----------------------------------------------------------
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [cartSheetOpen, setCartSheetOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [downloading, setDownloading] = useState(false);
    // One key per checkout attempt - a double-tap or retry of the SAME
    // "Confirmar" replays instead of charging twice (see utils/idempotency.js).
    const idempotencyKey = useRef(null);
    const searchRef = useRef(null);

    const canCharge = canSell && cart.lines.length > 0 && Boolean(customer);
    const chargeHint = !canSell
        ? t("common.no_permission_to_edit")
        : !customer && cart.lines.length > 0
          ? t("pos.pick_customer_first")
          : undefined;

    const openCheckout = useCallback(() => {
        if (!canCharge) return;
        idempotencyKey.current = crypto.randomUUID();
        setResult(null);
        setCartSheetOpen(false);
        setCheckoutOpen(true);
    }, [canCharge]);

    const startNewSale = useCallback(() => {
        setCheckoutOpen(false);
        setResult(null);
        setCustomer(catalog.finalConsumer);
        setTimeout(() => searchRef.current?.focus(), 50);
    }, [catalog.finalConsumer]);

    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "F2") {
                event.preventDefault();
                searchRef.current?.focus();
            } else if (event.key === "F9") {
                event.preventDefault();
                if (!checkoutOpen) openCheckout();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [openCheckout, checkoutOpen]);

    const describeError = (error) => {
        const items = error.response?.data?.errors;
        if (Array.isArray(items) && items.length > 0) {
            return items
                .map((item) =>
                    t("orders.insufficient_stock_detail", {
                        product: item.product_name || item.product_code || "?",
                        requested: item.requested,
                        available: item.available ?? 0,
                    })
                )
                .join("\n");
        }
        return error.response?.data?.message || t("orders.failed_create_order");
    };

    const handleConfirm = async ({ method, payment, change }) => {
        const soldLines = cart.lines;
        const { subTotal, gst, total } = cart.totals;
        const orderData = {
            customer_id: customer._id,
            ...(pointOfSaleId ? { pointOfSaleId } : {}),
            order_status: "completed",
            due_date: null,
            orderItems: soldLines.map((line) => ({
                product_id: line.product._id,
                quantity: line.quantity,
                unitcost: line.unitPrice,
            })),
            sub_total: subTotal,
            gst,
            total,
            total_products: soldLines.length,
            ...(payment ? { payment } : {}),
        };

        setSubmitting(true);
        try {
            if (!getConnectivityState()) {
                await queueCreate({
                    entity: "orders",
                    url: "/orders",
                    fields: orderData,
                    optimisticExtra: {
                        customer_id: { _id: customer._id, name: customer.name },
                        order_date: new Date().toISOString(),
                        invoice_no: t("orders.pending_sync_invoice_placeholder"),
                    },
                });
                setResult({ offline: true, total, change, method });
            } else {
                const response = await api.post("/orders", orderData, {
                    headers: { "Idempotency-Key": idempotencyKey.current },
                });
                const order = response.data?.data || {};
                setResult({
                    orderId: order._id,
                    invoiceNo: order.invoice_no,
                    total: order.total ?? total,
                    change,
                    method,
                    einvoicing,
                    paymentError: payment && order.payment_registered === false ? order.payment_error : null,
                });
            }
            catalog.applyLocalSale(soldLines);
            cart.clear();
        } catch (error) {
            console.error("POS checkout failed:", error);
            toast.error(describeError(error));
        } finally {
            setSubmitting(false);
        }
    };

    const downloadReceipt = async () => {
        if (!result?.orderId) return;
        setDownloading(true);
        try {
            const response = await api.get(`/orders/${result.orderId}/invoice`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `venta-${result.invoiceNo || result.orderId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error(t("orders.failed_generate_invoice"));
        } finally {
            setDownloading(false);
        }
    };

    const cartPanel = (sheet) => (
        <PosCart
            cart={cart}
            customer={customer}
            customers={locationCustomers}
            onCustomerChange={setCustomer}
            onCharge={openCheckout}
            canCharge={canCharge}
            chargeHint={chargeHint}
            sheet={sheet}
        />
    );

    return (
        <div className={`min-h-screen bg-transparent text-[var(--ohnix-text-primary)] ${isDesktop ? "" : "pb-28"}`}>
            <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
                <header className="mb-5 flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] text-xl text-[var(--ohnix-accent)]">
                            <ShopOutlined />
                        </span>
                        <div className="min-w-0">
                            <h1 className="m-0 text-xl font-bold leading-tight sm:text-2xl">{t("pos.title")}</h1>
                            <div className="flex items-center gap-2 text-xs text-[var(--ohnix-text-dim)]">
                                <span className={`pos-live-dot ${online ? "" : "is-offline"}`} />
                                {online ? t("pos.online") : t("pos.offline")}
                            </div>
                        </div>
                    </div>
                    {hasLocationChoice && (
                        <Select
                            size="large"
                            className="min-w-[180px] auth-ohnix-input"
                            value={pointOfSaleId}
                            onChange={changeLocation}
                            disabled={cart.lines.length > 0}
                            suffixIcon={<ShopOutlined />}
                            options={locationOptions.map((o) => ({ value: o.id, label: o.name }))}
                        />
                    )}
                    <Link to="/orders">
                        <Button size="large" icon={<UnorderedListOutlined />}>
                            <span className="hidden sm:inline">{t("pos.view_sales")}</span>
                        </Button>
                    </Link>
                </header>

                <div className="pos-layout">
                    <PosProductGrid
                        ref={searchRef}
                        products={catalog.products}
                        loading={catalog.loading}
                        quantityOf={cart.quantityOf}
                        lastAddedId={cart.lastAddedId}
                        bump={cart.bump}
                        onAdd={cart.add}
                        onScanMiss={(code) => toast.error(t("pos.code_not_found", { code }))}
                    />
                    {isDesktop && cartPanel(false)}
                </div>
            </div>

            {!isDesktop && cart.lines.length > 0 && (
                <div className="pos-mobile-bar">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCartSheetOpen(true)}>
                        <span className="block text-xs text-[var(--ohnix-text-dim)]">{t("pos.units_in_cart", { count: cart.totals.units })}</span>
                        <span className="block text-xl font-bold tabular-nums">{formatCurrency(cart.totals.total, "COP")}</span>
                    </button>
                    <button type="button" className="pos-charge" onClick={openCheckout} disabled={!canCharge}>
                        {t("pos.charge")}
                    </button>
                </div>
            )}

            {!isDesktop && (
                <Drawer
                    open={cartSheetOpen}
                    onClose={() => setCartSheetOpen(false)}
                    placement="bottom"
                    height="85vh"
                    title={null}
                    styles={{ body: { padding: 16, display: "flex", flexDirection: "column" } }}
                >
                    {cartPanel(true)}
                </Drawer>
            )}

            <PosCheckoutModal
                open={checkoutOpen}
                total={result ? result.total : cart.totals.total}
                cashAccounts={catalog.cashAccounts}
                paymentMethods={catalog.paymentMethods}
                canRegisterPayment={canRegisterPayment}
                pointOfSaleId={pointOfSaleId}
                submitting={submitting}
                result={result}
                onConfirm={handleConfirm}
                onClose={() => setCheckoutOpen(false)}
                onNewSale={startNewSale}
                onDownload={downloadReceipt}
                downloading={downloading}
            />
        </div>
    );
};

export default PosRegister;
