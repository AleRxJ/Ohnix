import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Drawer, Grid, Popover, Radio, Segmented, Select, Switch } from "antd";
import { AppstoreOutlined, PrinterOutlined, ShopOutlined, ShoppingOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";

import PosProductGrid from "../components/pos/PosProductGrid";
import PosCart from "../components/pos/PosCart";
import PosCheckoutModal from "../components/pos/PosCheckoutModal";
import { MoveTabModal, TabHeader, TablesBoard, TablesConfigDrawer } from "../components/pos/PosTables";
import "../components/pos/pos.css";

import { api } from "../api/api";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import { usePosCart } from "../hooks/pos/usePosCart";
import { usePosTables } from "../hooks/pos/usePosTables";
import { useTabCart } from "../hooks/pos/useTabCart";
import { isFinalConsumer, usePosCatalog } from "../hooks/pos/usePosCatalog";
import { usePosLocations } from "../hooks/pos/usePosLocations";
import { getConnectivityState, subscribeConnectivity } from "../offline/connectivity";
import { queueCreate } from "../offline/entityQueue";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";
import { formatCurrency } from "../utils/currency";
import { paymentProviderService } from "../services/paymentProviderService";
import { financeService } from "../services/financeService";
import { pickAccount } from "../components/pos/posPayments";
import { buildLocalReceipt, buildPreBill, fetchReceipt, printKitchenTicket, printReceipt, readPrintSettings, writePrintSettings } from "../utils/posReceipt";

const LOCATION_KEY = "ohnix.pos.pointOfSaleId";
const MODE_KEY = "ohnix.pos.mode";

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
// dvh follows the mobile browser's collapsing address bar; plain vh made the
// sheet overflow under it on iOS/Android.
const SHEET_HEIGHT = typeof CSS !== "undefined" && CSS.supports?.("height", "1dvh") ? "85dvh" : "85vh";

const PosRegister = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { hasPermission, hasCapability } = useTeam();
    const canSell = hasPermission("orders", "edit");
    const canRegisterPayment = hasPermission("finance", "edit");
    const screens = Grid.useBreakpoint();
    const isDesktop = screens.lg !== false;
    const einvoicing =
        ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && Boolean(user?.company?.electronicInvoicingEnabled);
    // "Preguntar en cada venta" (the default) - see Company.einvoiceIssueMode.
    const einvoiceAsk = einvoicing && user?.company?.einvoiceIssueMode !== "automatic";
    const canDeferEinvoice = hasCapability("deferEinvoice");

    // --- Location --------------------------------------------------------
    // The Caja ALWAYS names its location explicitly. Leaving it to the server
    // only works when the account has exactly one active location of ANY
    // type - an account with a store plus a bodega (or whose plan no longer
    // includes multi-sede) got "pointOfSaleId es obligatorio" on every sale,
    // table and final-consumer lookup. The selector only shows with 2+ stores.
    const { locations: locationOptions, loading: locationsLoading } = usePosLocations();
    const hasLocationChoice = locationOptions.length > 1;
    const [pointOfSaleId, setPointOfSaleId] = useState(undefined);
    useEffect(() => {
        if (!locationOptions.length) {
            setPointOfSaleId(undefined);
            return;
        }
        const stored = readStoredLocation();
        setPointOfSaleId((current) => {
            if (current && locationOptions.some((o) => o.id === current)) return current;
            return locationOptions.find((o) => o.id === stored)?.id || locationOptions[0].id;
        });
    }, [locationOptions]);
    // Nothing that writes (final consumer, sales, tables) runs until the
    // location is known - an early request without it is exactly the error
    // this replaced.
    const locationReady = !locationsLoading && (locationOptions.length === 0 || Boolean(pointOfSaleId));
    const changeLocation = (id) => {
        setPointOfSaleId(id);
        try {
            localStorage.setItem(LOCATION_KEY, id);
        } catch {
            // Only a convenience - the select still works this session.
        }
    };

    const catalog = usePosCatalog({ pointOfSaleId, canRegisterPayment, ready: locationReady });
    const counterCart = usePosCart();

    // --- Mesas (restaurant mode) ------------------------------------------
    // "counter" sells straight from the cart; "tables" works per-table tabs
    // (usePosTables) and the cart then IS the active table's tab.
    const canConfigureTables = hasPermission("orders", "admin");
    const tables = usePosTables({ pointOfSaleId, enabled: locationReady });
    const [mode, setMode] = useState(() => {
        try {
            return localStorage.getItem(MODE_KEY) === "tables" ? "tables" : "counter";
        } catch {
            return "counter";
        }
    });
    const changeMode = (next) => {
        setMode(next);
        try {
            localStorage.setItem(MODE_KEY, next);
        } catch {
            // Per-device convenience.
        }
    };
    const [activeTabId, setActiveTabId] = useState(null);
    const activeTab = mode === "tables" ? tables.tabs.find((tab) => tab._id === activeTabId) || null : null;
    const tabCart = useTabCart(activeTab, tables, catalog.products);
    const cart = activeTab ? tabCart : counterCart;
    const showTablesBoard = mode === "tables" && !activeTab;
    const tablesAvailable = tables.tables.length > 0 || canConfigureTables;
    const [tablesConfigOpen, setTablesConfigOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [sendingKitchen, setSendingKitchen] = useState(false);

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
    // A Bold charge in flight: the sale already exists (orderId), only its
    // payment is pending on the provider. { orderId, invoiceNo, total, mode,
    // payment, intent, error }
    const [charging, setCharging] = useState(null);
    const [chargeBusy, setChargeBusy] = useState(false);
    // Why the last "Confirmar" was refused - shown inside the checkout modal.
    const [checkoutError, setCheckoutError] = useState(null);
    // Ticket printing (per device: roll width, print automatically).
    const [printSettings, setPrintSettings] = useState(readPrintSettings);
    const [printing, setPrinting] = useState(false);
    // What was just sold - the cart is cleared on success, but an offline
    // ticket (or a fallback when the receipt endpoint is unreachable) is
    // printed from exactly this.
    const lastSaleRef = useRef(null);
    const autoPrintedRef = useRef(null);
    // One key per checkout attempt - a double-tap or retry of the SAME
    // "Confirmar" replays instead of charging twice (see utils/idempotency.js).
    const idempotencyKey = useRef(null);
    const searchRef = useRef(null);

    const canCharge = canSell && locationReady && !showTablesBoard && cart.lines.length > 0 && Boolean(customer);
    const chargeHint = !canSell
        ? t("common.no_permission_to_edit")
        : !customer && cart.lines.length > 0
          ? t("pos.pick_customer_first")
          : undefined;

    const openCheckout = useCallback(() => {
        if (!canCharge) return;
        idempotencyKey.current = crypto.randomUUID();
        setResult(null);
        setCheckoutError(null);
        setCartSheetOpen(false);
        setCheckoutOpen(true);
    }, [canCharge]);

    const startNewSale = useCallback(() => {
        setCheckoutOpen(false);
        setResult(null);
        setCharging(null);
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

    const handleConfirm = async ({ method, payment, change, einvoiceDeferred = false, deferReason }) => {
        const soldLines = cart.lines;
        const saleTab = cart.isTab ? activeTab : null;
        const { subTotal, gst, total } = cart.totals;
        // A tab can hold the same product on two lines (before/after a
        // comanda) - the sale gets one line per product and price.
        const orderItems = [];
        soldLines.forEach((line) => {
            const same = orderItems.find((item) => item.product_id === line.product._id && item.unitcost === line.unitPrice);
            if (same) same.quantity += line.quantity;
            else orderItems.push({ product_id: line.product._id, quantity: line.quantity, unitcost: line.unitPrice });
        });
        lastSaleRef.current = {
            lines: soldLines,
            totals: cart.totals,
            customer,
            received: method === "cash" ? total + (change || 0) : null,
            payments: payment && !payment.provider ? [{ method: payment.method, amount: total, reference: payment.reference }] : [],
        };
        const orderData = {
            customer_id: customer._id,
            ...(pointOfSaleId ? { pointOfSaleId } : {}),
            order_status: "completed",
            due_date: null,
            orderItems,
            sub_total: subTotal,
            gst,
            total,
            total_products: orderItems.length,
            ...(saleTab ? { table_tab_id: saleTab._id } : {}),
            ...(payment ? { payment } : {}),
            ...(einvoiceDeferred ? { einvoice_deferred: true, einvoice_defer_reason: deferReason } : {}),
        };

        // Bold needs the provider live - never queue a charge offline (the
        // tiles are hidden offline, this covers losing signal mid-checkout).
        if (payment?.provider && !getConnectivityState()) {
            toast.error(t("pos.bold_needs_connection"));
            return;
        }

        setSubmitting(true);
        setCheckoutError(null);
        const tableName = saleTab?.table_name || null;
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
                setResult({ offline: true, tableName, total, change, method, einvoiceDeferred, verification: payment?.requires_verification ? "pending" : null });
            } else {
                const response = await api.post("/orders", orderData, {
                    headers: { "Idempotency-Key": idempotencyKey.current },
                });
                const order = response.data?.data || {};
                if (payment?.provider) {
                    // Sale made; now wait for Bold to confirm the charge.
                    setCharging({
                        orderId: order._id,
                        invoiceNo: order.invoice_no,
                        total: order.total ?? total,
                        mode: payment.mode,
                        payment,
                        einvoiceDeferred,
                        tableName,
                        intent: order.payment_intent || null,
                        error: order.payment_intent ? null : order.payment_error || t("pos.charge_error"),
                    });
                } else {
                    setResult({
                        orderId: order._id,
                        invoiceNo: order.invoice_no,
                        tableName,
                        total: order.total ?? total,
                        change,
                        method,
                        einvoicing,
                        einvoiceDeferred,
                        verification: payment?.requires_verification ? "pending" : null,
                        paymentError: payment && order.payment_registered === false ? order.payment_error : null,
                    });
                }
            }
            catalog.applyLocalSale(soldLines);
            if (saleTab) {
                await tables.closeTabLocally(saleTab._id);
                setActiveTabId(null);
            } else {
                counterCart.clear();
            }
        } catch (error) {
            console.error("POS checkout failed:", error);
            setCheckoutError(describeError(error));
        } finally {
            setSubmitting(false);
        }
    };

    // --- Bold charge lifecycle ------------------------------------------------
    const finishCharge = useCallback(
        (extra) => {
            setResult({
                orderId: charging.orderId,
                invoiceNo: charging.invoiceNo,
                total: charging.total,
                change: 0,
                einvoicing,
                einvoiceDeferred: charging.einvoiceDeferred,
                tableName: charging.tableName,
                ...extra,
            });
            setCharging(null);
        },
        [charging, einvoicing]
    );

    // The webhook is what resolves the charge server-side; polling only asks
    // Ohnix (which, for links, also checks Bold directly) how it went.
    useEffect(() => {
        if (!charging?.intent || charging.intent.status !== "pending") return undefined;
        let stopped = false;
        const tick = async () => {
            try {
                const intent = await paymentProviderService.getIntent(charging.intent._id);
                if (stopped) return;
                if (intent.status === "approved") {
                    finishCharge({ method: charging.mode === "terminal" ? "bold_terminal" : "bold_link", verification: "verified" });
                } else if (intent.status !== "pending") {
                    setCharging((prev) => (prev ? { ...prev, intent } : prev));
                }
            } catch {
                // Transient - the next tick tries again.
            }
        };
        const id = setInterval(tick, 2500);
        return () => {
            stopped = true;
            clearInterval(id);
        };
    }, [charging, finishCharge]);

    const cancelCharge = async () => {
        if (!charging?.intent) return;
        setChargeBusy(true);
        try {
            const intent = await paymentProviderService.cancelIntent(charging.intent._id);
            // It may have been approved an instant before the cancel landed.
            if (intent.status === "approved") finishCharge({ method: "bold", verification: "verified" });
            else setCharging((prev) => ({ ...prev, intent }));
        } catch (error) {
            toast.error(error.response?.data?.message || t("pos.charge_error"));
        } finally {
            setChargeBusy(false);
        }
    };

    const retryCharge = async () => {
        setChargeBusy(true);
        try {
            const { payment } = charging;
            const intent = await paymentProviderService.createIntent({
                order_id: charging.orderId,
                mode: payment.mode,
                terminal_serial: payment.terminal_serial,
                terminal_model: payment.terminal_model,
                cash_account_id: payment.cash_account_id,
                payment_method_id: payment.payment_method_id,
            });
            setCharging((prev) => ({ ...prev, intent, error: null }));
        } catch (error) {
            setCharging((prev) => ({ ...prev, error: error.response?.data?.message || t("pos.charge_error") }));
        } finally {
            setChargeBusy(false);
        }
    };

    const collectCashInstead = async () => {
        const account = pickAccount(catalog.cashAccounts, "cash", pointOfSaleId);
        if (!account) {
            toast.error(t("pos.no_cash_accounts"));
            return;
        }
        setChargeBusy(true);
        try {
            await financeService.registerOrderPayment(charging.orderId, {
                amount: charging.total,
                cash_account_id: account._id,
                method: t("pos.method_cash"),
            });
            finishCharge({ method: "cash" });
        } catch (error) {
            toast.error(error.response?.data?.message || t("pos.charge_error"));
        } finally {
            setChargeBusy(false);
        }
    };

    const updatePrintSettings = (patch) => {
        const next = { ...printSettings, ...patch };
        setPrintSettings(next);
        writePrintSettings(next);
    };

    const printTicket = useCallback(
        async (sale) => {
            if (!sale) return;
            const snapshot = lastSaleRef.current;
            const locationName = locationOptions?.find((o) => o.id === pointOfSaleId)?.name || null;
            const local = () =>
                buildLocalReceipt({
                    lines: snapshot?.lines || [],
                    totals: snapshot?.totals || { subTotal: 0, gst: 0, total: sale.total },
                    customer: snapshot?.customer,
                    payments: snapshot?.payments,
                    pointOfSale: locationName,
                    cashier: user?.username,
                    number: sale.invoiceNo,
                });
            setPrinting(true);
            try {
                let receipt;
                if (sale.orderId && getConnectivityState()) {
                    try {
                        receipt = await fetchReceipt(sale.orderId, { waitForInvoiceMs: sale.einvoicing && !sale.einvoiceDeferred ? 8000 : 0 });
                    } catch {
                        receipt = local();
                    }
                } else {
                    receipt = local();
                }
                await printReceipt(receipt, { width: printSettings.width, t, received: snapshot?.received, change: sale.change });
            } catch (error) {
                console.error("Ticket print failed:", error);
                toast.error(t("pos.print_failed"));
            } finally {
                setPrinting(false);
            }
        },
        [locationOptions, pointOfSaleId, user?.username, printSettings.width, t]
    );

    useEffect(() => {
        if (!result || !printSettings.autoPrint || autoPrintedRef.current === result) return;
        autoPrintedRef.current = result;
        printTicket(result);
    }, [result, printSettings.autoPrint, printTicket]);

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

    const locationName = locationOptions?.find((o) => o.id === pointOfSaleId)?.name || null;

    // Mobile charge bar visible -> lift the floating helpers above it (pos.css).
    const showMobileBar = !isDesktop && !showTablesBoard && (cart.lines.length > 0 || Boolean(activeTab));
    useEffect(() => {
        document.body.classList.toggle("pos-cart-bar-open", showMobileBar);
        return () => document.body.classList.remove("pos-cart-bar-open");
    }, [showMobileBar]);

    const selectTable = async (table, tab) => {
        if (tab) {
            setActiveTabId(tab._id);
            return;
        }
        const opened = await tables.openTab(table);
        if (opened) setActiveTabId(opened._id);
    };

    // Comanda: prints only what the kitchen has not seen yet, then marks it sent.
    const sendKitchen = async () => {
        if (!activeTab) return;
        setSendingKitchen(true);
        try {
            // Round = how many comandas this tab already sent + 1 (each send
            // stamps its lines with one sent_at), so a 2nd trip reads ADICIONAL.
            const round = new Set(activeTab.items.filter((i) => i.sent_at).map((i) => i.sent_at)).size + 1;
            const table = tables.tables.find((x) => x._id === activeTab.table_id);
            const items = await tables.sendToKitchen(activeTab._id);
            if (items.length) {
                await printKitchenTicket({
                    companyName: user?.company?.name,
                    tableName: activeTab.table_name,
                    zone: table?.zone,
                    guests: activeTab.guests,
                    waiter: user?.username,
                    items,
                    round,
                    tabCode: activeTab._id.replace(/-/g, "").slice(-5).toUpperCase(),
                    openedAt: activeTab.opened_at,
                    width: printSettings.width,
                    t,
                });
            }
        } catch (error) {
            console.error("Kitchen ticket failed:", error);
            toast.error(t("pos.print_failed"));
        } finally {
            setSendingKitchen(false);
        }
    };

    const printPreBill = () =>
        printReceipt(buildPreBill({ tab: activeTab, lines: tabCart.lines, totals: tabCart.totals, pointOfSale: locationName, cashier: user?.username }), {
            width: printSettings.width,
            t,
        }).catch(() => toast.error(t("pos.print_failed")));

    const cartPanel = (sheet) => (
        <PosCart
            header={
                activeTab ? (
                    <TabHeader
                        tab={activeTab}
                        onBack={() => setActiveTabId(null)}
                        onKitchen={sendKitchen}
                        onPreBill={printPreBill}
                        onMove={() => setMoveOpen(true)}
                        onCancel={async () => {
                            await tables.cancelTab(activeTab._id);
                            setActiveTabId(null);
                        }}
                        sending={sendingKitchen}
                    />
                ) : null
            }
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
        <div className={`min-h-screen bg-transparent text-[var(--ohnix-text-primary)] ${isDesktop ? "" : "pb-[calc(7rem+env(safe-area-inset-bottom))]"}`}>
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
                    {tablesAvailable && (
                        <Segmented
                            size="large"
                            value={mode}
                            onChange={changeMode}
                            options={[
                                { value: "counter", icon: <ShoppingOutlined />, label: <span className="hidden sm:inline">{t("tables.mode_counter")}</span> },
                                { value: "tables", icon: <AppstoreOutlined />, label: <span className="hidden sm:inline">{t("tables.mode_tables")}</span> },
                            ]}
                        />
                    )}
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
                    <Popover
                        trigger="click"
                        placement="bottomRight"
                        title={t("pos.print_settings")}
                        content={
                            <div className="w-60 space-y-3">
                                <div>
                                    <div className="mb-1 text-xs text-[var(--ohnix-text-dim)]">{t("pos.paper_width")}</div>
                                    <Radio.Group value={printSettings.width} onChange={(e) => updatePrintSettings({ width: e.target.value })}>
                                        <Radio.Button value={58}>58 mm</Radio.Button>
                                        <Radio.Button value={80}>80 mm</Radio.Button>
                                    </Radio.Group>
                                </div>
                                <label className="flex items-center justify-between gap-3 text-sm">
                                    {t("pos.auto_print")}
                                    <Switch size="small" checked={printSettings.autoPrint} onChange={(checked) => updatePrintSettings({ autoPrint: checked })} />
                                </label>
                                <p className="m-0 text-xs text-[var(--ohnix-text-dim)]">{t("pos.print_help")}</p>
                            </div>
                        }
                    >
                        <Button size="large" icon={<PrinterOutlined />} aria-label={t("pos.print_settings")} />
                    </Popover>
                    <Link to="/orders">
                        <Button size="large" icon={<UnorderedListOutlined />}>
                            <span className="hidden sm:inline">{t("pos.view_sales")}</span>
                        </Button>
                    </Link>
                </header>

                <div className={`pos-layout ${showTablesBoard ? "is-full" : ""}`}>
                    {showTablesBoard ? (
                        <TablesBoard
                            tables={tables.tables}
                            tabs={tables.tabs}
                            loading={tables.loading}
                            canConfigure={canConfigureTables && online}
                            onSelect={selectTable}
                            onConfigure={() => setTablesConfigOpen(true)}
                        />
                    ) : (
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
                    )}
                    {isDesktop && !showTablesBoard && cartPanel(false)}
                </div>
            </div>

            {showMobileBar && (
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
                    height={SHEET_HEIGHT}
                    title={null}
                    styles={{ body: { padding: 16, display: "flex", flexDirection: "column" } }}
                >
                    {cartPanel(true)}
                </Drawer>
            )}

            <TablesConfigDrawer
                open={tablesConfigOpen}
                onClose={() => setTablesConfigOpen(false)}
                tables={tables.tables}
                tabs={tables.tabs}
                onCreate={tables.createTables}
                onUpdate={tables.updateTable}
            />
            <MoveTabModal
                open={moveOpen}
                tab={activeTab}
                tables={tables.tables}
                tabs={tables.tabs}
                onClose={() => setMoveOpen(false)}
                onMove={async (tableId) => {
                    const target = tables.tables.find((x) => x._id === tableId);
                    if (target && activeTab) await tables.moveTab(activeTab._id, target);
                    setMoveOpen(false);
                }}
            />

            <PosCheckoutModal
                open={checkoutOpen}
                total={result ? result.total : cart.totals.total}
                cashAccounts={catalog.cashAccounts}
                paymentMethods={catalog.paymentMethods}
                canRegisterPayment={canRegisterPayment}
                pointOfSaleId={pointOfSaleId}
                online={online}
                bold={catalog.bold}
                einvoiceAsk={einvoiceAsk}
                canDeferEinvoice={canDeferEinvoice}
                submitting={submitting}
                result={result}
                charging={charging}
                chargeBusy={chargeBusy}
                onConfirm={handleConfirm}
                error={checkoutError}
                onClose={() => setCheckoutOpen(false)}
                onNewSale={startNewSale}
                onDownload={downloadReceipt}
                downloading={downloading}
                onPrint={() => printTicket(result)}
                printing={printing}
                onCancelCharge={cancelCharge}
                onRetryCharge={retryCharge}
                onCashInstead={collectCashInstead}
                onLeaveOnCredit={() => finishCharge({ method: "credit" })}
            />
        </div>
    );
};

export default PosRegister;
