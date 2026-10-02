import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PropTypes from "prop-types";
import { Drawer, Input, Spin } from "antd";
import { BellOutlined, CheckCircleFilled, CloseOutlined, FileTextOutlined, MinusOutlined, PlusOutlined, ShoppingOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import { api } from "../api/api.js";
import useI18n from "../hooks/useI18n";
import { formatCurrency } from "../utils/currency";
import "../components/pos/publicMenu.css";

// Customer menu behind a table's QR (/m/:token - public, no account). The
// customer browses the menu, builds an order and sends it; a waiter confirms
// it before anything reaches the kitchen (tableTab.service.js#acceptRequest).
// They can also call the waiter or ask for the bill. Paying stays at the
// table/register. Brand look of the public site (DemoBooking.jsx): #050505,
// cyan pill buttons, soft glass cards - always dark, it's the restaurant's
// "menu card", not the app.

const cop = (value) => formatCurrency(value, "COP");
const POLL_MS = 5000;

const storageKey = (token) => `ohnix.menu.${token}`;
const readSession = (token) => {
    try {
        return JSON.parse(sessionStorage.getItem(storageKey(token))) || {};
    } catch {
        return {};
    }
};
const writeSession = (token, value) => {
    try {
        sessionStorage.setItem(storageKey(token), JSON.stringify(value));
    } catch {
        // Private mode: the cart just won't survive a reload.
    }
};

const STATUS_STEPS = ["sent", "confirmed", "preparing", "ready"];

const statusStep = (request) => {
    if (!request) return null;
    if (request.status === "rejected") return "rejected";
    if (request.status === "pending") return "sent";
    if (request.kitchen === "served") return "served";
    if (request.kitchen === "ready") return "ready";
    if (request.kitchen === "preparing") return "preparing";
    return "confirmed";
};

const PublicMenu = () => {
    const { token } = useParams();
    const { t } = useI18n();
    const [menu, setMenu] = useState(null);
    const [error, setError] = useState(null);
    const [cart, setCart] = useState(() => readSession(token).cart || {});
    const [orders, setOrders] = useState(() => readSession(token).orders || []);
    const [statuses, setStatuses] = useState({});
    const [sheetOpen, setSheetOpen] = useState(false);
    const [view, setView] = useState(() => ((readSession(token).orders || []).length ? "status" : "menu"));
    const [sending, setSending] = useState(false);
    const [customerName, setCustomerName] = useState(() => readSession(token).name || "");
    const [note, setNote] = useState("");
    const [notes, setNotes] = useState({});
    const [website, setWebsite] = useState("");
    const [activeCategory, setActiveCategory] = useState(null);
    const sectionRefs = useRef({});

    useEffect(() => {
        document.title = menu?.restaurant?.name ? `${menu.restaurant.name} · ${t("menu.title")}` : t("menu.title");
    }, [menu, t]);

    useEffect(() => {
        let cancelled = false;
        api.get(`/public/menu/${token}`)
            .then((response) => !cancelled && setMenu(response.data?.data))
            .catch((err) => !cancelled && setError(err.response?.data?.message || t("menu.load_failed")));
        return () => {
            cancelled = true;
        };
    }, [token, t]);

    useEffect(() => {
        writeSession(token, { cart, orders, name: customerName });
    }, [token, cart, orders, customerName]);

    const products = useMemo(() => menu?.products || [], [menu]);
    const byId = useMemo(() => Object.fromEntries(products.map((p) => [p._id, p])), [products]);
    const sections = useMemo(
        () =>
            (menu?.categories || [])
                .map((category) => ({ ...category, products: products.filter((p) => p.category_id === category._id) }))
                .filter((s) => s.products.length),
        [menu, products]
    );
    const lines = Object.entries(cart)
        .filter(([id, qty]) => byId[id] && qty > 0)
        .map(([id, qty]) => ({ product: byId[id], quantity: qty }));
    const units = lines.reduce((sum, l) => sum + l.quantity, 0);
    const total = lines.reduce((sum, l) => sum + l.quantity * l.product.price, 0);

    const change = (id, delta) =>
        setCart((prev) => {
            const next = Math.min(20, Math.max(0, (prev[id] || 0) + delta));
            const copy = { ...prev, [id]: next };
            if (!next) delete copy[id];
            return copy;
        });

    // Poll the status of this table's orders until each is done.
    const pollStatuses = useCallback(async () => {
        const open = orders.filter((id) => !["served", "rejected"].includes(statusStep(statuses[id])));
        if (!open.length) return;
        const results = await Promise.all(
            open.map((id) =>
                api
                    .get(`/public/menu/${token}/requests/${id}`)
                    .then((r) => [id, r.data?.data])
                    .catch(() => [id, null])
            )
        );
        setStatuses((prev) => {
            const next = { ...prev };
            results.forEach(([id, data]) => {
                if (data) next[id] = data;
            });
            return next;
        });
    }, [orders, statuses, token]);

    useEffect(() => {
        if (!orders.length) return undefined;
        pollStatuses();
        const id = setInterval(pollStatuses, POLL_MS);
        return () => clearInterval(id);
    }, [orders.length, pollStatuses]);

    const sendRequest = async (type) => {
        const body =
            type === "order"
                ? {
                      type,
                      items: lines.map((l) => ({ product_id: l.product._id, quantity: l.quantity, note: notes[l.product._id] || undefined })),
                      note: note || undefined,
                      customer_name: customerName || undefined,
                      website,
                  }
                : { type, customer_name: customerName || undefined, website };
        setSending(true);
        try {
            const response = await api.post(`/public/menu/${token}/requests`, body);
            const request = response.data?.data;
            if (type === "order") {
                setOrders((prev) => [...prev, request._id]);
                setStatuses((prev) => ({ ...prev, [request._id]: request }));
                setCart({});
                setNotes({});
                setNote("");
                setSheetOpen(false);
                setView("status");
                window.scrollTo({ top: 0, behavior: "smooth" });
            } else {
                toast.success(t(type === "bill" ? "menu.bill_sent" : "menu.waiter_called"));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t("menu.send_failed"));
        } finally {
            setSending(false);
        }
    };

    const scrollTo = (id) => {
        setActiveCategory(id);
        sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (error) {
        return (
            <main className="grid min-h-screen place-items-center bg-[#050505] px-6 text-center text-white">
                <div className="max-w-sm">
                    <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-[#29D8D5]/40 bg-[#29D8D5]/10 text-2xl text-[#29D8D5]">
                        <ShoppingOutlined />
                    </div>
                    <h1 className="text-2xl font-bold">{t("menu.unavailable_title")}</h1>
                    <p className="mt-2 text-[#A9B3B8]">{error}</p>
                </div>
            </main>
        );
    }

    if (!menu) {
        return (
            <main className="grid min-h-screen place-items-center bg-[#050505]">
                <Spin size="large" />
            </main>
        );
    }

    const latest = orders.length ? statuses[orders[orders.length - 1]] : null;

    return (
        <main className="min-h-screen bg-[#050505] pb-32 text-white" style={{ fontFamily: '"Space Grotesk", "Manrope", system-ui, sans-serif' }}>
            {/* Honeypot - real customers never see or fill it. */}
            <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

            <header className="relative overflow-hidden border-b border-white/10 px-4 pb-5 pt-6">
                <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-[#29D8D5]/10 blur-3xl" />
                <div className="relative mx-auto flex max-w-2xl items-center gap-3">
                    {menu.restaurant.logo_url ? (
                        <img src={menu.restaurant.logo_url} alt="" className="h-12 w-12 rounded-2xl border border-white/10 bg-white object-contain p-1" />
                    ) : (
                        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[#29D8D5]/40 bg-[#29D8D5]/10 text-lg font-bold text-[#29D8D5]">
                            {menu.restaurant.name.slice(0, 1).toUpperCase()}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 truncate text-xl font-bold tracking-tight">{menu.restaurant.name}</h1>
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#29D8D5]/40 bg-[#29D8D5]/10 px-3 py-0.5 text-xs font-bold uppercase tracking-[0.18em] text-[#29D8D5]">
                            {menu.table.name}
                            {menu.table.zone ? ` · ${menu.table.zone}` : ""}
                        </div>
                    </div>
                </div>
                <div className="relative mx-auto mt-4 grid max-w-2xl grid-cols-2 gap-2">
                    <button type="button" disabled={sending} onClick={() => sendRequest("call_waiter")} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#29D8D5]/60">
                        <BellOutlined /> {t("menu.call_waiter")}
                    </button>
                    <button type="button" disabled={sending} onClick={() => sendRequest("bill")} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#29D8D5]/60">
                        <FileTextOutlined /> {t("menu.ask_bill")}
                    </button>
                </div>
            </header>

            {view === "status" && latest ? (
                <section className="mx-auto max-w-2xl px-4 pt-6">
                    <OrderStatus request={latest} t={t} onMore={() => setView("menu")} />
                </section>
            ) : (
                <>
                    {sections.length > 1 && (
                        <nav className="sticky top-0 z-20 border-b border-white/10 bg-[#050505]/90 backdrop-blur-xl">
                            <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
                                {sections.map((section) => (
                                    <button
                                        key={section._id}
                                        type="button"
                                        onClick={() => scrollTo(section._id)}
                                        className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                                            activeCategory === section._id ? "border-[#29D8D5] bg-[#29D8D5] text-[#021314]" : "border-white/10 bg-white/[0.04] text-[#A9B3B8]"
                                        }`}
                                    >
                                        {section.name}
                                    </button>
                                ))}
                            </div>
                        </nav>
                    )}

                    {orders.length > 0 && latest && (
                        <div className="mx-auto max-w-2xl px-4 pt-4">
                            <button type="button" onClick={() => setView("status")} className="w-full rounded-2xl border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-4 py-3 text-left text-sm text-[#29D8D5]">
                                {t(`menu.status_short_${statusStep(latest)}`)} · {t("menu.see_status")}
                            </button>
                        </div>
                    )}

                    <div className="mx-auto max-w-2xl space-y-8 px-4 pt-6">
                        {sections.length === 0 && <p className="py-16 text-center text-[#A9B3B8]">{t("menu.empty")}</p>}
                        {sections.map((section) => (
                            <section key={section._id} ref={(el) => (sectionRefs.current[section._id] = el)} className="scroll-mt-20">
                                <h2 className="mb-3 text-lg font-bold tracking-tight">{section.name}</h2>
                                <div className="space-y-3">
                                    {section.products.map((product) => {
                                        const qty = cart[product._id] || 0;
                                        return (
                                            <article key={product._id} className={`flex gap-3 rounded-[22px] border bg-white/[0.03] p-3 transition ${qty ? "border-[#29D8D5]/50" : "border-white/10"}`}>
                                                {product.image && <img src={product.image} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />}
                                                <div className="flex min-w-0 flex-1 flex-col">
                                                    <div className="font-semibold leading-snug">{product.name}</div>
                                                    {product.description && <p className="m-0 mt-0.5 line-clamp-2 text-sm text-[#A9B3B8]">{product.description}</p>}
                                                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                                                        <span className="font-bold tabular-nums text-[#29D8D5]">{cop(product.price)}</span>
                                                        {qty ? (
                                                            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1">
                                                                <button type="button" onClick={() => change(product._id, -1)} className="grid h-8 w-8 place-items-center rounded-full text-white" aria-label={t("menu.less")}>
                                                                    <MinusOutlined />
                                                                </button>
                                                                <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
                                                                <button type="button" onClick={() => change(product._id, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#29D8D5] text-[#021314]" aria-label={t("menu.more")}>
                                                                    <PlusOutlined />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button type="button" onClick={() => change(product._id, 1)} className="flex items-center gap-1.5 rounded-full bg-[#29D8D5] px-4 py-1.5 text-sm font-semibold text-[#021314] transition hover:bg-[#44F3F0]">
                                                                <PlusOutlined /> {t("menu.add")}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            )}

            <footer className="mx-auto mt-12 max-w-2xl px-4 text-center text-xs text-[#6B7280]">
                {t("menu.pay_note")}
                <div className="mt-3">
                    <a href="https://ohnix.co" target="_blank" rel="noreferrer" className="font-semibold tracking-[0.2em] text-[#8b98a0] no-underline">
                        {t("menu.made_with")} OHNIX
                    </a>
                </div>
            </footer>

            {units > 0 && view === "menu" && (
                <div className="fixed inset-x-0 bottom-0 z-30 px-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                    <button
                        type="button"
                        onClick={() => setSheetOpen(true)}
                        className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-full bg-[#29D8D5] px-6 py-4 text-[#021314] shadow-[0_18px_50px_rgba(41,216,213,0.35)] transition hover:bg-[#44F3F0]"
                    >
                        <span className="flex items-center gap-2 font-semibold">
                            <ShoppingOutlined /> {t("menu.view_order", { count: units })}
                        </span>
                        <span className="text-lg font-bold tabular-nums">{cop(total)}</span>
                    </button>
                </div>
            )}

            <Drawer
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                placement="bottom"
                height="auto"
                closeIcon={null}
                title={null}
                rootClassName="public-menu-sheet"
                styles={{ content: { background: "#0b0b0b", borderRadius: "28px 28px 0 0" }, body: { padding: 20, maxHeight: "85dvh", overflowY: "auto" } }}
            >
                <div className="text-white" style={{ fontFamily: '"Space Grotesk", "Manrope", system-ui, sans-serif' }}>
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="m-0 text-xl font-bold">{t("menu.your_order")}</h2>
                        <button type="button" onClick={() => setSheetOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-white" aria-label={t("menu.close")}>
                            <CloseOutlined />
                        </button>
                    </div>
                    <div className="space-y-3">
                        {lines.map(({ product, quantity }) => (
                            <div key={product._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-semibold">{product.name}</div>
                                        <div className="text-sm tabular-nums text-[#A9B3B8]">{cop(product.price * quantity)}</div>
                                    </div>
                                    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1">
                                        <button type="button" onClick={() => change(product._id, -1)} className="grid h-8 w-8 place-items-center rounded-full text-white" aria-label={t("menu.less")}>
                                            <MinusOutlined />
                                        </button>
                                        <span className="w-6 text-center font-bold tabular-nums">{quantity}</span>
                                        <button type="button" onClick={() => change(product._id, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#29D8D5] text-[#021314]" aria-label={t("menu.more")}>
                                            <PlusOutlined />
                                        </button>
                                    </div>
                                </div>
                                <Input
                                    className="public-menu-input mt-2"
                                    size="small"
                                    maxLength={120}
                                    value={notes[product._id] || ""}
                                    onChange={(e) => setNotes((prev) => ({ ...prev, [product._id]: e.target.value }))}
                                    placeholder={t("menu.line_note_placeholder")}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 space-y-2">
                        <Input className="public-menu-input" maxLength={40} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t("menu.name_placeholder")} />
                        <Input.TextArea className="public-menu-input" maxLength={200} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("menu.note_placeholder")} />
                    </div>
                    <div className="mt-5 flex items-baseline justify-between">
                        <span className="text-[#A9B3B8]">{t("menu.total")}</span>
                        <span className="text-2xl font-bold tabular-nums">{cop(total)}</span>
                    </div>
                    <p className="m-0 mt-1 text-xs text-[#6B7280]">{t("menu.confirm_note")}</p>
                    <button
                        type="button"
                        disabled={sending || !lines.length}
                        onClick={() => sendRequest("order")}
                        className="mt-4 w-full rounded-full bg-[#29D8D5] py-4 text-base font-semibold text-[#021314] transition hover:bg-[#44F3F0] disabled:opacity-50"
                        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
                    >
                        {sending ? t("menu.sending") : t("menu.send_order")}
                    </button>
                </div>
            </Drawer>
        </main>
    );
};

// Progress of the last order: sent -> confirmed by the waiter -> preparing ->
// ready. A rejected order says so plainly and points to the staff.
const OrderStatus = ({ request, t, onMore }) => {
    const step = statusStep(request);
    const index = STATUS_STEPS.indexOf(step === "served" ? "ready" : step);
    return (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            {step === "rejected" ? (
                <>
                    <h2 className="m-0 text-xl font-bold">{t("menu.status_rejected_title")}</h2>
                    <p className="mb-0 mt-2 text-[#A9B3B8]">{t("menu.status_rejected_body")}</p>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-3">
                        <CheckCircleFilled className="text-3xl text-[#29D8D5]" />
                        <h2 className="m-0 text-xl font-bold">{t(`menu.status_title_${step}`)}</h2>
                    </div>
                    <p className="mb-0 mt-2 text-[#A9B3B8]">{t(`menu.status_body_${step}`)}</p>
                    <ol className="mt-6 space-y-3 p-0">
                        {STATUS_STEPS.map((key, i) => (
                            <li key={key} className="flex items-center gap-3 list-none">
                                <span
                                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                                        i < index || step === "served" ? "bg-[#29D8D5] text-[#021314]" : i === index ? "border border-[#29D8D5] text-[#29D8D5]" : "border border-white/10 text-[#6B7280]"
                                    }`}
                                >
                                    {i + 1}
                                </span>
                                <span className={i <= index ? "text-white" : "text-[#6B7280]"}>{t(`menu.step_${key}`)}</span>
                            </li>
                        ))}
                    </ol>
                </>
            )}
            <button type="button" onClick={onMore} className="mt-6 w-full rounded-full border border-[#29D8D5]/50 bg-[#29D8D5]/10 py-3 font-semibold text-[#29D8D5]">
                {t("menu.order_more")}
            </button>
        </div>
    );
};

OrderStatus.propTypes = {
    request: PropTypes.object.isRequired,
    t: PropTypes.func.isRequired,
    onMore: PropTypes.func.isRequired,
};

export default PublicMenu;
