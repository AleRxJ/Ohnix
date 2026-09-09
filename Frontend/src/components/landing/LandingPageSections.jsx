import React, { useState, useEffect, useRef, useCallback } from "react";
import useI18n from "../../hooks/useI18n";
import useScrollLock from "../../hooks/useScrollLock";
import { isBuildTimePrerender } from "../../i18n/geoLanguage";
import { api } from "../../api/api";
import { trackContactFormConversion } from "../../utils/googleAds";
import { trackContactFormLead } from "../../utils/metaPixel";
import {
    ArrowRightOutlined,
    ApiOutlined,
    ApartmentOutlined,
    BookOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    EnvironmentOutlined,
    GlobalOutlined,
    LinkOutlined,
    CloseOutlined,
    PlayCircleOutlined,
    RocketOutlined,
    SafetyOutlined,
    SafetyCertificateOutlined,
    SyncOutlined,
    ThunderboltOutlined,
    TeamOutlined,
    LineChartOutlined,
    MailOutlined,
    QuestionCircleOutlined,
    SmileOutlined,
    CrownOutlined,
    ThunderboltOutlined as BoltOutlined,
    CheckOutlined,
    MessageOutlined,
    EyeOutlined,
    AuditOutlined,
    ShoppingCartOutlined,
    DollarOutlined,
} from "@ant-design/icons";

const sectionShell =
    "relative overflow-hidden border-t border-white/[0.025] bg-[#050505] text-white md:border-white/5";

/* ── Scroll-reveal hook ──────────────────────────────────────────────── */
const useScrollReveal = (threshold = 0.12) => {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
            { threshold }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);
    return [ref, visible];
};

/* ── Animated numeric counter ──────────────────────────────────────── */
const AnimatedStat = ({ value, active }) => {
    const [display, setDisplay] = useState("0");
    useEffect(() => {
        if (!active) return;
        const m = String(value).match(/^([\d.]+)(.*)$/);
        if (!m) { setDisplay(value); return; }
        const end = parseFloat(m[1]);
        const suffix = m[2];
        const hasDecimal = m[1].includes(".");
        const duration = 1600;
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            const cur = hasDecimal ? (end * ease).toFixed(1) : Math.round(end * ease);
            setDisplay(`${cur}${suffix}`);
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [active, value]);
    return <>{display}</>;
};

/* ── Typewriter cycling word ────────────────────────────────────────── */
const TypewriterWord = ({ words }) => {
    const [idx, setIdx] = useState(0);
    // Deterministic first render is essential for the prerendered marketing
    // HTML: an empty client value used to mismatch the saved word, forcing
    // React to rebuild the hero after the large app bundle arrived and making
    // that late repaint the page's LCP.
    const [text, setText] = useState(() => words[0] ?? "");
    const [phase, setPhase] = useState("typing");

    useEffect(() => {
        // Matching the initial `text` state above only guarantees the FIRST
        // render agrees with the prerendered snapshot - this effect then
        // keeps typing/deleting for as long as the tab stays open, including
        // through scripts/prerender.js's own build-time capture window. By
        // the time that pass saves the page's HTML, this has already
        // advanced well past word[0]'s first character (e.g. frozen
        // mid-word, showing "Inv" instead of the full word) - a real
        // visitor's fresh render always starts at the full word[0] and
        // never catches up to that arbitrary mid-typing snapshot. Freezing
        // the cycle during that one pass keeps the snapshot exactly at the
        // matched initial state instead.
        if (isBuildTimePrerender()) return undefined;
        const word = words[idx];
        let timer;
        if (phase === "typing") {
            if (text.length < word.length) {
                timer = setTimeout(() => setText(word.slice(0, text.length + 1)), 75);
            } else {
                timer = setTimeout(() => setPhase("pausing"), 2000);
            }
        } else if (phase === "pausing") {
            timer = setTimeout(() => setPhase("deleting"), 500);
        } else {
            if (text.length > 0) {
                timer = setTimeout(() => setText(text.slice(0, -1)), 38);
            } else {
                setIdx((i) => (i + 1) % words.length);
                setPhase("typing");
            }
        }
        return () => clearTimeout(timer);
    }, [text, phase, idx, words]);

    return (
        <span>
            <span className="text-[#29D8D5]">{text}</span>
            <span className="ml-0.5 inline-block h-[0.82em] w-[3px] translate-y-[2px] rounded-sm bg-[#29D8D5] align-middle animate-blink" />
        </span>
    );
};

/* ── Live dashboard mockup ──────────────────────────────────────────── */
export const HeroDashboard = () => {
    const { t } = useI18n();
    const [productCount, setProductCount] = useState(0);
    const [valueCount, setValueCount]     = useState(0);
    const [highlightRow, setHighlightRow] = useState(0);
    const [activeSuite, setActiveSuite]   = useState(0);

    useEffect(() => {
        const animCount = (target, setter, duration = 1800) => {
            const start = performance.now();
            const tick = (now) => {
                const t = Math.min((now - start) / duration, 1);
                setter(Math.round(target * (1 - Math.pow(1 - t, 3))));
                if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };
        // Same build-time-prerender hazard as TypewriterWord above: left
        // running, this would bake settled/mid-animation counts into the
        // static snapshot instead of the 0/0 a real visitor's fresh render
        // starts at.
        if (isBuildTimePrerender()) return undefined;
        const t = setTimeout(() => {
            animCount(24860, setProductCount);
            animCount(2846,  setValueCount);
        }, 350);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (isBuildTimePrerender()) return undefined;
        const iv = setInterval(() => setHighlightRow((r) => (r + 1) % 4), 1400);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (isBuildTimePrerender()) return undefined;
        const iv = setInterval(() => setActiveSuite((current) => (current + 1) % 4), 3200);
        return () => clearInterval(iv);
    }, []);

    const spark = [28, 42, 35, 58, 44, 67, 53, 72, 60, 85, 70, 92];
    const W = 200, H = 44;
    const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * W},${H - (v / 100) * H}`).join(" ");

    const rows = [
        { location: "BOG-01", name: t("landing.hero_dashboard.location_central"), movements: 842, ok: true },
        { location: "MED-02", name: t("landing.hero_dashboard.location_north"), movements: 615, ok: true },
        { location: "CAL-03", name: t("landing.hero_dashboard.location_west"), movements: 498, ok: true },
        { location: "BAR-04", name: t("landing.hero_dashboard.location_coast"), movements: 367, ok: true },
    ];

    const suites = [
        { key: "operations", code: "01", label: t("landing.hero_dashboard.suite_operations"), detail: t("landing.hero_dashboard.suite_operations_detail") },
        { key: "commerce", code: "02", label: t("landing.hero_dashboard.suite_commerce"), detail: t("landing.hero_dashboard.suite_commerce_detail") },
        { key: "finance", code: "03", label: t("landing.hero_dashboard.suite_finance"), detail: t("landing.hero_dashboard.suite_finance_detail") },
        { key: "connect", code: "04", label: t("landing.hero_dashboard.suite_connect"), detail: t("landing.hero_dashboard.suite_connect_detail") },
    ];

    return (
        <div className="relative w-full overflow-hidden rounded-[38px] border border-[#29D8D5]/15 bg-[#070909] text-white shadow-[0_36px_120px_rgba(0,0,0,0.72),0_0_80px_rgba(41,216,213,0.08)]">
            <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[#29D8D5]/10 blur-[90px]" />
            <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[#44F3F0]/[0.06] blur-[90px]" />
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(41,216,213,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(41,216,213,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="flex min-h-[520px] gap-2 p-2">
                <aside className="relative hidden w-[68px] shrink-0 rounded-[28px] border border-white/[0.06] bg-black/45 p-2 backdrop-blur-2xl sm:flex sm:flex-col">
                    <div className="mb-4 flex items-center justify-center py-2">
                        <img src="/Ohnix_Icon_Transparent.png" alt="" className="h-8 w-8 object-contain drop-shadow-[0_0_12px_rgba(41,216,213,0.45)]" />
                    </div>
                    <div className="space-y-1">
                        {[
                            ["◫", t("landing.hero_dashboard.module_overview")],
                            ["◈", t("landing.hero_dashboard.module_inventory")],
                            ["⇄", t("landing.hero_dashboard.module_sales")],
                            ["⌁", t("landing.hero_dashboard.module_purchases")],
                            ["$", t("landing.hero_dashboard.module_finance")],
                            ["▤", t("landing.hero_dashboard.module_accounting")],
                            ["✓", t("landing.hero_dashboard.module_invoicing")],
                            ["↗", t("landing.hero_dashboard.module_reports")],
                            ["⚙", t("landing.hero_dashboard.module_integrations")],
                        ].map(([icon, label], i) => (
                            <div key={label} title={label} className={`group flex h-9 items-center justify-center rounded-xl border text-[10px] transition-all duration-300 ${i === activeSuite * 2 ? "border-[#29D8D5]/30 bg-[#29D8D5]/12 text-[#29D8D5] shadow-[inset_0_0_18px_rgba(41,216,213,0.06),0_0_18px_rgba(41,216,213,0.08)]" : "border-transparent text-[#65727a] hover:border-white/5 hover:bg-white/[0.04] hover:text-[#A9B3B8]"}`}>
                                <span className="text-sm">{icon}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-auto flex items-center justify-center py-3" aria-label={t("landing.hero_dashboard.all_systems_label")}>
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#29D8D5] opacity-45" />
                            <span className="relative h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_10px_#29D8D5]" />
                        </span>
                    </div>
                </aside>
                <div className="min-w-0 flex-1 overflow-hidden rounded-[30px] border border-white/[0.055] bg-black/20">
            <div className="flex items-center gap-3 border-b border-white/[0.055] bg-white/[0.018] px-4 py-3 backdrop-blur-xl">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-[#29D8D5]/15 bg-[#29D8D5]/[0.055]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_9px_#29D8D5]" />
                </div>
                <div className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold tracking-wide text-[#b5c1c0]">{t("landing.hero_dashboard.command_center")}</span>
                    <span className="block text-[7px] uppercase tracking-[0.16em] text-[#455351]">{t("landing.hero_dashboard.all_systems_label")}</span>
                </div>
                <div className="hidden items-center gap-1 rounded-full border border-white/[0.055] bg-black/25 px-2.5 py-1.5 md:flex">
                    <span className="text-[8px] text-[#586765]">⌕</span>
                    <span className="text-[7px] uppercase tracking-wider text-[#465552]">{t("landing.hero_dashboard.search_label")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_8px_rgba(41,216,213,0.9)] animate-pulse" />
                    <span className="text-[8px] font-semibold uppercase tracking-wider text-[#29D8D5]">{t("landing.hero_dashboard.live")}</span>
                </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 divide-x divide-y divide-white/5 border-b border-white/6 lg:grid-cols-4 lg:divide-y-0">
                {[
                    { label: t("landing.hero_dashboard.products_label"), value: productCount.toLocaleString(), note: "+18.2%",   pos: true  },
                    { label: t("landing.hero_dashboard.sales_today_label"), value: `$${(valueCount / 100).toFixed(1)}M`, note: "+12.6%", pos: true },
                    { label: t("landing.hero_dashboard.locations_label"), value: "12",                         note: t("landing.hero_dashboard.connected_note"), pos: true },
                    { label: t("landing.hero_dashboard.dian_label"), value: t("landing.hero_dashboard.active_label"), note: t("landing.hero_dashboard.synced_note"), pos: true },
                ].map((k) => (
                    <div key={k.label} className="bg-[#080808] px-3 py-2.5">
                        <div className="text-[9px] uppercase tracking-widest text-[#444]">{k.label}</div>
                        <div className="mt-0.5 text-base font-semibold tabular-nums text-white">{k.value}</div>
                        <div className={`mt-0.5 text-[9px] font-medium ${k.pos ? "text-[#29D8D5]" : "text-amber-400"}`}>
                            {k.pos && "↑ "}{k.note}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid border-b border-white/6 bg-[#060606] lg:grid-cols-[1.45fr_0.75fr]">
                <div className="border-b border-white/6 px-3 py-3 lg:border-b-0 lg:border-r">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-widest text-[#444]">{t("landing.hero_dashboard.unified_operation_label")}</span>
                        <span className="text-[9px] font-semibold text-[#29D8D5]">+18.4% ↑</span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" preserveAspectRatio="none" style={{ height: "58px" }}>
                        <defs>
                            <linearGradient id="hd-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#29D8D5" stopOpacity="0.28" />
                                <stop offset="100%" stopColor="#29D8D5" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#hd-grad)" />
                        <polyline points={pts} fill="none" stroke="#29D8D5" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                        <circle cx={W} cy={H - (spark[spark.length - 1] / 100) * H} r="2.5" fill="#29D8D5" />
                    </svg>
                </div>
                <div className="px-3 py-3">
                    <div className="text-[9px] uppercase tracking-widest text-[#444]">{t("landing.hero_dashboard.automation_label")}</div>
                    <div className="mt-2 space-y-1.5">
                        {[t("landing.hero_dashboard.auto_stock"), t("landing.hero_dashboard.auto_accounting"), t("landing.hero_dashboard.auto_collections")].map((label) => (
                            <div key={label} className="flex items-center gap-2 rounded-md bg-white/[0.025] px-2 py-1.5 text-[9px] text-[#8A9BA8]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_7px_#29D8D5]" />
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="relative grid grid-cols-2 gap-1 border-b border-[#29D8D5]/10 bg-black/20 p-2 md:grid-cols-4">
                {suites.map((suite, i) => (
                    <button
                        key={suite.key}
                        type="button"
                        onClick={() => setActiveSuite(i)}
                        className={`relative overflow-hidden rounded-xl border px-3 py-2 text-left transition-all duration-500 ${activeSuite === i ? "border-[#29D8D5]/35 bg-[#29D8D5]/10" : "border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.04]"}`}
                    >
                        {activeSuite === i && <span className="absolute inset-x-0 bottom-0 h-px bg-[#29D8D5] shadow-[0_0_12px_#29D8D5]" />}
                        <span className={`block font-mono text-[8px] ${activeSuite === i ? "text-[#29D8D5]" : "text-[#46535a]"}`}>{suite.code}</span>
                        <span className="mt-0.5 block truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-[#A9B3B8]">{suite.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-3 border-b border-white/5 bg-[linear-gradient(90deg,rgba(41,216,213,0.07),transparent)] px-4 py-2">
                <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#29D8D5] opacity-50" />
                    <span className="relative h-2 w-2 rounded-full bg-[#29D8D5]" />
                </span>
                <span key={suites[activeSuite].key} className="animate-fade-in text-[9px] tracking-wide text-[#829198]">{suites[activeSuite].detail}</span>
            </div>

            {/* Rows */}
            <div className="bg-[#080808] px-3 py-2">
                <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-widest text-[#444]">
                    <span>{t("landing.hero_dashboard.location_activity_label")}</span>
                    <span className="text-[#29D8D5]">3,421 {t("landing.hero_dashboard.today_label")}</span>
                </div>
                <div>
                    {rows.map((r, i) => (
                        <div
                            key={r.location}
                            className={`flex items-center gap-2 rounded-md px-1 py-[5px] transition-colors duration-500 ${highlightRow === i ? "bg-white/[0.05]" : ""}`}
                        >
                            <span className="w-[52px] shrink-0 font-mono text-[9px] text-[#3a4a55]">{r.location}</span>
                            <span className="flex-1 truncate text-[11px] text-[#8A9BA8]">{r.name}</span>
                            <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-white">{r.movements}</span>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.ok ? "bg-[#29D8D5]" : "bg-amber-400 animate-pulse"}`} />
                        </div>
                    ))}
                </div>
            </div>
            <div className="border-t border-white/6 bg-[#050505] px-3 py-3">
                <div className="mb-2 text-[8px] uppercase tracking-[0.2em] text-[#3f4b52]">{t("landing.hero_dashboard.end_to_end_label")}</div>
                <div className="flex items-center gap-1 overflow-hidden">
                    {["flow_quote", "flow_order", "flow_stock", "flow_invoice", "flow_payment", "flow_accounting"].map((key, i) => (
                        <React.Fragment key={key}>
                            <div className={`min-w-0 flex-1 rounded-lg border px-1.5 py-2 text-center text-[8px] ${i === 5 ? "border-[#29D8D5]/30 bg-[#29D8D5]/10 text-[#29D8D5]" : "border-white/7 bg-white/[0.025] text-[#718089]"}`}>
                                {t(`landing.hero_dashboard.${key}`)}
                            </div>
                            {i < 5 && <span className="text-[9px] text-[#29D8D5]/50">›</span>}
                        </React.Fragment>
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {["badge_realtime", "badge_multisite", "badge_rbac", "badge_api", "badge_webhooks", "badge_exports"].map((key) => (
                        <span key={key} className="rounded-full border border-[#29D8D5]/10 bg-[#29D8D5]/[0.035] px-2 py-1 text-[7px] uppercase tracking-[0.12em] text-[#63747b]">
                            {t(`landing.hero_dashboard.${key}`)}
                        </span>
                    ))}
                </div>
            </div>
                </div>
            </div>
        </div>
    );
};

/* Ohnix ecosystem — an orbital product map rather than a conventional app screenshot. */
export const OhnixEcosystem = () => {
    const { t } = useI18n();
    const [active, setActive] = useState(0);

    const ecosystems = [
        { label: t("landing.hero_dashboard.suite_operations"), detail: t("landing.hero_dashboard.suite_operations_detail") },
        { label: t("landing.hero_dashboard.suite_commerce"), detail: t("landing.hero_dashboard.suite_commerce_detail") },
        { label: t("landing.hero_dashboard.suite_finance"), detail: t("landing.hero_dashboard.suite_finance_detail") },
        { label: t("landing.hero_dashboard.suite_connect"), detail: t("landing.hero_dashboard.suite_connect_detail") },
    ];

    const modules = [
        { label: t("landing.hero_dashboard.module_inventory"), meta: t("landing.hero_dashboard.node_stock"), x: 14, y: 19, suite: 0 },
        { label: t("landing.hero_dashboard.module_purchases"), meta: t("landing.hero_dashboard.node_suppliers"), x: 9, y: 61, suite: 1 },
        { label: t("landing.hero_dashboard.module_sales"), meta: t("landing.hero_dashboard.node_orders"), x: 39, y: 7, suite: 1 },
        { label: t("landing.hero_dashboard.module_invoicing"), meta: t("landing.hero_dashboard.node_dian"), x: 72, y: 17, suite: 1 },
        { label: t("landing.hero_dashboard.module_finance"), meta: t("landing.hero_dashboard.node_cash"), x: 78, y: 55, suite: 2 },
        { label: t("landing.hero_dashboard.module_accounting"), meta: t("landing.hero_dashboard.node_taxes"), x: 57, y: 78, suite: 2 },
        { label: t("landing.hero_dashboard.module_integrations"), meta: t("landing.hero_dashboard.node_api"), x: 22, y: 82, suite: 3 },
    ];

    useEffect(() => {
        if (isBuildTimePrerender()) return undefined;
        const timer = setInterval(() => setActive((value) => (value + 1) % ecosystems.length), 3400);
        return () => clearInterval(timer);
    }, [ecosystems.length]);

    return (
        <div className="relative min-h-[570px] overflow-hidden rounded-[42px] border border-[#29D8D5]/15 bg-[#030606] text-white shadow-[0_40px_140px_rgba(0,0,0,0.75),0_0_100px_rgba(41,216,213,0.08)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_44%,rgba(41,216,213,0.16),transparent_19%),radial-gradient(circle_at_15%_80%,rgba(68,243,240,0.07),transparent_28%),linear-gradient(145deg,#071010_0%,#030505_48%,#080808_100%)]" />
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(68,243,240,0.32)_0.7px,transparent_0.7px)] [background-size:22px_22px] [mask-image:radial-gradient(circle_at_center,black,transparent_76%)]" />

            <div className="absolute left-5 top-5 z-30 flex items-center gap-3 rounded-full border border-[#29D8D5]/15 bg-black/35 px-3 py-2 backdrop-blur-xl">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#29D8D5] opacity-60" />
                    <span className="relative h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_12px_#29D8D5]" />
                </span>
                <span className="text-[8px] font-semibold uppercase tracking-[0.28em] text-[#85a6a5]">Ohnix operational core</span>
            </div>

            <div className="absolute right-5 top-5 z-30 hidden items-center gap-1.5 sm:flex">
                {ecosystems.map((item, index) => (
                    <button
                        key={item.label}
                        type="button"
                        onClick={() => setActive(index)}
                        className={`rounded-full border px-3 py-1.5 text-[8px] uppercase tracking-[0.12em] transition-all duration-500 ${active === index ? "border-[#29D8D5]/35 bg-[#29D8D5]/12 text-[#29D8D5] shadow-[0_0_20px_rgba(41,216,213,0.1)]" : "border-white/[0.05] bg-black/20 text-[#536266] hover:text-[#91a1a5]"}`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="absolute inset-x-0 top-16 hidden h-[430px] sm:block">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                        <linearGradient id="ecosystem-line" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#29D8D5" stopOpacity="0.08" />
                            <stop offset="0.5" stopColor="#44F3F0" stopOpacity="0.48" />
                            <stop offset="1" stopColor="#29D8D5" stopOpacity="0.08" />
                        </linearGradient>
                    </defs>
                    {modules.map((node) => (
                        <line key={node.label} x1="49" y1="48" x2={node.x + 5} y2={node.y + 5} stroke="url(#ecosystem-line)" strokeWidth={node.suite === active ? "0.34" : "0.12"} strokeDasharray={node.suite === active ? "2 1" : "1 2"} className="transition-all duration-700" />
                    ))}
                    <ellipse cx="49" cy="48" rx="31" ry="37" fill="none" stroke="#29D8D5" strokeOpacity="0.1" strokeWidth="0.18" strokeDasharray="1.5 2.5" />
                    <ellipse cx="49" cy="48" rx="21" ry="25" fill="none" stroke="#44F3F0" strokeOpacity="0.08" strokeWidth="0.2" />
                </svg>

                <div className="absolute left-[49%] top-[48%] z-20 -translate-x-1/2 -translate-y-1/2">
                    <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#29D8D5]/10 animate-orbit-slow" />
                    <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#44F3F0]/20 animate-orbit-mid" />
                    <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full border border-[#29D8D5]/40 bg-[radial-gradient(circle_at_35%_30%,rgba(68,243,240,0.28),rgba(5,18,18,0.96)_58%)] shadow-[inset_0_0_28px_rgba(41,216,213,0.16),0_0_65px_rgba(41,216,213,0.28)]">
                        <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-12 w-12 object-contain drop-shadow-[0_0_15px_rgba(41,216,213,0.65)]" />
                        <span className="mt-1 text-[7px] uppercase tracking-[0.3em] text-[#70a2a0]">Core</span>
                    </div>
                </div>

                {modules.map((node, index) => {
                    const selected = node.suite === active;
                    return (
                        <button
                            key={node.label}
                            type="button"
                            onClick={() => setActive(node.suite)}
                            className={`absolute z-20 w-[112px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border p-3 text-left backdrop-blur-xl transition-all duration-700 ${selected ? "scale-110 border-[#29D8D5]/40 bg-[#0b2221]/80 shadow-[0_14px_42px_rgba(0,0,0,0.5),0_0_32px_rgba(41,216,213,0.14)]" : "border-white/[0.07] bg-black/45 opacity-65 hover:opacity-100"}`}
                            style={{ left: `${node.x + 5}%`, top: `${node.y + 5}%`, transitionDelay: `${index * 35}ms` }}
                        >
                            <span className={`mb-2 block h-1.5 w-1.5 rounded-full ${selected ? "bg-[#29D8D5] shadow-[0_0_10px_#29D8D5]" : "bg-[#3d4b4f]"}`} />
                            <span className="block truncate text-[9px] font-semibold text-[#d7e0e0]">{node.label}</span>
                            <span className="mt-1 block truncate text-[7px] uppercase tracking-[0.12em] text-[#607174]">{node.meta}</span>
                        </button>
                    );
                })}
            </div>

            <div className="relative z-20 grid gap-2 px-4 pb-4 pt-20 sm:hidden">
                <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full border border-[#29D8D5]/35 bg-[#29D8D5]/10 shadow-[0_0_50px_rgba(41,216,213,0.22)]">
                    <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-12 w-12 object-contain" />
                </div>
                {modules.map((node) => (
                    <button key={node.label} type="button" onClick={() => setActive(node.suite)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${node.suite === active ? "border-[#29D8D5]/30 bg-[#29D8D5]/10" : "border-white/[0.06] bg-black/30"}`}>
                        <span className="text-xs text-[#d7e0e0]">{node.label}</span>
                        <span className="text-[8px] uppercase tracking-wider text-[#617174]">{node.meta}</span>
                    </button>
                ))}
            </div>

            <div className="absolute inset-x-4 bottom-4 z-30 hidden items-center justify-between gap-4 rounded-[24px] border border-white/[0.07] bg-black/55 px-4 py-3 backdrop-blur-2xl sm:flex">
                <div key={active} className="min-w-0 animate-fade-in">
                    <div className="text-[8px] font-semibold uppercase tracking-[0.24em] text-[#29D8D5]">{ecosystems[active].label}</div>
                    <div className="mt-1 truncate text-[9px] text-[#718184]">{ecosystems[active].detail}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[7px] uppercase tracking-[0.12em] text-[#536568]">
                    <span className="rounded-full border border-[#29D8D5]/15 px-2 py-1">API</span>
                    <span className="rounded-full border border-[#29D8D5]/15 px-2 py-1">RBAC</span>
                    <span className="rounded-full border border-[#29D8D5]/15 px-2 py-1">DIAN</span>
                    <span className="rounded-full border border-[#29D8D5]/15 px-2 py-1">24/7</span>
                </div>
            </div>
        </div>
    );
};

/* A calmer companion to the page-wide orbital language: one signal path, one active system. */
export const OhnixFlowField = () => {
    const { t } = useI18n();
    const [active, setActive] = useState(0);

    const systems = [
        {
            number: "01",
            label: t("landing.hero_dashboard.suite_operations"),
            detail: t("landing.hero_dashboard.suite_operations_detail"),
            modules: [
                [t("landing.hero_dashboard.module_inventory"), t("landing.hero_dashboard.node_stock")],
                [t("landing.hero_dashboard.locations_label"), t("landing.hero_dashboard.connected_note")],
                [t("landing.hero_dashboard.team_label"), t("landing.hero_dashboard.badge_rbac")],
            ],
        },
        {
            number: "02",
            label: t("landing.hero_dashboard.suite_commerce"),
            detail: t("landing.hero_dashboard.suite_commerce_detail"),
            modules: [
                [t("landing.hero_dashboard.module_sales"), t("landing.hero_dashboard.node_orders")],
                [t("landing.hero_dashboard.module_purchases"), t("landing.hero_dashboard.node_suppliers")],
                [t("landing.hero_dashboard.module_invoicing"), t("landing.hero_dashboard.node_dian")],
            ],
        },
        {
            number: "03",
            label: t("landing.hero_dashboard.suite_finance"),
            detail: t("landing.hero_dashboard.suite_finance_detail"),
            modules: [
                [t("landing.hero_dashboard.module_finance"), t("landing.hero_dashboard.node_cash")],
                [t("landing.hero_dashboard.module_accounting"), t("landing.hero_dashboard.node_taxes")],
                [t("landing.hero_dashboard.module_reports"), t("landing.hero_dashboard.badge_exports")],
            ],
        },
        {
            number: "04",
            label: t("landing.hero_dashboard.suite_connect"),
            detail: t("landing.hero_dashboard.suite_connect_detail"),
            modules: [
                [t("landing.hero_dashboard.module_integrations"), t("landing.hero_dashboard.node_api")],
                [t("landing.hero_dashboard.badge_webhooks"), t("landing.hero_dashboard.badge_realtime")],
                [t("landing.hero_dashboard.badge_rbac"), t("landing.hero_dashboard.team_label")],
            ],
        },
    ];

    useEffect(() => {
        if (isBuildTimePrerender()) return undefined;
        const timer = setInterval(() => setActive((value) => (value + 1) % systems.length), 4200);
        return () => clearInterval(timer);
    }, [systems.length]);

    const current = systems[active];

    return (
        <div className="relative min-h-[510px] overflow-hidden rounded-[44px] border border-white/[0.055] bg-[linear-gradient(145deg,rgba(7,15,15,0.97),rgba(3,5,5,0.99))] text-white shadow-[0_40px_130px_rgba(0,0,0,0.68)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_31%_44%,rgba(41,216,213,0.16),transparent_25%),radial-gradient(circle_at_82%_72%,rgba(68,243,240,0.055),transparent_28%)]" />
            <div className="pointer-events-none absolute -left-[24%] top-[13%] hidden h-[72%] w-[125%] rotate-[-8deg] rounded-[50%] border border-[#29D8D5]/10 sm:block" />
            <div className="pointer-events-none absolute -left-[18%] top-[20%] hidden h-[59%] w-[112%] rotate-[-8deg] rounded-[50%] border border-dashed border-white/[0.045] sm:block" />

            <div className="relative z-20 flex items-center justify-between px-5 pt-5 sm:px-7 sm:pt-6">
                <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_14px_#29D8D5] animate-pulse" />
                    <span className="text-[8px] font-semibold uppercase tracking-[0.28em] text-[#78908f]">Ohnix · connected operations</span>
                </div>
                <span className="hidden rounded-full border border-white/[0.06] bg-black/20 px-3 py-1.5 text-[7px] uppercase tracking-[0.18em] text-[#536563] sm:block">{t("landing.hero_dashboard.badge_realtime")}</span>
            </div>

            {/* Desktop: the product core and the current system share one broad trajectory. */}
            <div className="relative z-10 hidden min-h-[390px] sm:block">
                <div className="absolute left-[31%] top-[47%] -translate-x-1/2 -translate-y-1/2">
                    <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#29D8D5]/10 blur-[35px]" />
                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-[#29D8D5]/30 bg-[radial-gradient(circle_at_35%_30%,rgba(68,243,240,0.24),rgba(3,12,12,0.98)_62%)] shadow-[inset_0_0_30px_rgba(41,216,213,0.12),0_0_52px_rgba(41,216,213,0.2)]">
                        <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-16 w-16 object-contain drop-shadow-[0_0_18px_rgba(41,216,213,0.65)]" />
                        <span className="absolute -bottom-7 text-[7px] uppercase tracking-[0.32em] text-[#65807e]">Operational core</span>
                    </div>
                    <span className="absolute -right-16 top-1/2 h-px w-16 bg-gradient-to-r from-[#29D8D5]/60 to-transparent" />
                </div>

                <div key={current.number} className="absolute left-[49%] right-[5%] top-[18%] animate-fade-in">
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <div className="font-mono text-[9px] tracking-[0.24em] text-[#29D8D5]">SYSTEM / {current.number}</div>
                            <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white">{current.label}</h3>
                            <p className="mt-2 max-w-sm text-[11px] leading-5 text-[#778785]">{current.detail}</p>
                        </div>
                        <div className="mb-1 h-9 w-9 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/[0.06] text-center text-xl leading-8 text-[#29D8D5]">↗</div>
                    </div>
                    <div className="mt-6 grid grid-cols-3 gap-2">
                        {current.modules.map(([label, meta], index) => (
                            <div key={label} className="group rounded-[22px] border border-white/[0.065] bg-white/[0.025] p-3.5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/25 hover:bg-[#29D8D5]/[0.055]" style={{ animationDelay: `${index * 90}ms` }}>
                                <div className="mb-5 flex items-center justify-between">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_9px_#29D8D5]" />
                                    <span className="font-mono text-[7px] text-[#41504f]">0{index + 1}</span>
                                </div>
                                <div className="truncate text-[10px] font-semibold text-[#dbe4e3]">{label}</div>
                                <div className="mt-1 truncate text-[7px] uppercase tracking-[0.1em] text-[#5d6e6c]">{meta}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mobile: compact control surface instead of a collapsed desktop diagram. */}
            <div className="relative z-20 px-4 pb-5 pt-7 sm:hidden">
                <div className="flex items-center gap-4 rounded-[28px] border border-[#29D8D5]/15 bg-[#29D8D5]/[0.045] p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#29D8D5]/25 bg-black/35 shadow-[0_0_28px_rgba(41,216,213,0.14)]">
                        <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-10 w-10 object-contain" />
                    </div>
                    <div className="min-w-0">
                        <div className="font-mono text-[8px] tracking-[0.2em] text-[#29D8D5]">SYSTEM / {current.number}</div>
                        <div className="mt-1 text-xl font-semibold text-white">{current.label}</div>
                        <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#71817f]">{current.detail}</div>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    {systems.map((system, index) => (
                        <button key={system.number} type="button" onClick={() => setActive(index)} className={`rounded-2xl border px-3 py-3 text-left transition-all ${active === index ? "border-[#29D8D5]/30 bg-[#29D8D5]/10" : "border-white/[0.055] bg-black/25"}`}>
                            <span className={`font-mono text-[7px] ${active === index ? "text-[#29D8D5]" : "text-[#465654]"}`}>{system.number}</span>
                            <span className="mt-1 block text-[10px] font-medium text-[#c5cfcd]">{system.label}</span>
                        </button>
                    ))}
                </div>

                <div key={`mobile-${current.number}`} className="mt-3 space-y-1.5 animate-fade-in">
                    {current.modules.map(([label, meta]) => (
                        <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.045] bg-white/[0.018] px-3.5 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#29D8D5]" />
                                <span className="truncate text-[10px] text-[#c5cfcd]">{label}</span>
                            </div>
                            <span className="shrink-0 text-[7px] uppercase tracking-wide text-[#52615f]">{meta}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="absolute inset-x-6 bottom-5 z-30 hidden items-center gap-2 sm:flex">
                {systems.map((system, index) => (
                    <button key={system.number} type="button" onClick={() => setActive(index)} className="group flex flex-1 items-center gap-2 text-left">
                        <span className={`h-px flex-1 transition-all duration-700 ${active === index ? "bg-[#29D8D5] shadow-[0_0_8px_#29D8D5]" : "bg-white/[0.08] group-hover:bg-white/20"}`} />
                        <span className={`font-mono text-[7px] transition-colors ${active === index ? "text-[#29D8D5]" : "text-[#455351]"}`}>{system.number}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

const ROTATE_MS = 4300;

/* Fixed-size, absolutely-positioned decorative trend line — deliberately never
   participates in flex/grid sizing, since a content-driven width here is what
   caused the KPI panel to resize between tabs before. */
const KpiSparkline = ({ data }) => {
    if (!data || data.length < 2) return null;
    const W = 72;
    const H = 28;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(" ");
    return (
        <svg
            aria-hidden="true"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute bottom-0 right-0 h-7 w-[72px] opacity-60"
        >
            <defs>
                <linearGradient id="kpiSparkFade" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#29D8D5" stopOpacity="0" />
                    <stop offset="100%" stopColor="#29D8D5" stopOpacity="0.35" />
                </linearGradient>
            </defs>
            <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#kpiSparkFade)" />
            <polyline points={pts} fill="none" stroke="#29D8D5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

/* Instagram-stories-style segment: fills while active, snaps full once passed, empties on the next lap.
   Skips the filling animation under prefers-reduced-motion, since it never reaches 100% on its own
   there (auto-rotation is paused) - it would otherwise look like a stuck, half-loaded bar. */
const WorkspaceProgress = ({ isActive, isPast, duration, reducedMotion }) => {
    const [filled, setFilled] = useState(false);
    useEffect(() => {
        if (!isActive || reducedMotion) { setFilled(false); return; }
        setFilled(false);
        const raf = requestAnimationFrame(() => setFilled(true));
        return () => cancelAnimationFrame(raf);
    }, [isActive, reducedMotion]);
    return (
        <span className="absolute inset-x-3 -bottom-1 block h-[3px] overflow-hidden rounded-full bg-white/10">
            <span
                className="block h-full rounded-full bg-[#29D8D5] shadow-[0_0_8px_#29D8D5]"
                style={{
                    width: isActive ? (reducedMotion || filled ? "100%" : "0%") : isPast ? "100%" : "0%",
                    transition: isActive && !reducedMotion ? `width ${duration}ms linear` : "none",
                }}
            />
        </span>
    );
};

export const OhnixCommandCanvas = () => {
    const { t } = useI18n();
    const [active, setActive] = useState(0);
    const canvasRef = useRef(null);
    const spotlightRef = useRef(null);
    const tiltRef = useRef(null);
    const [liveOps, setLiveOps] = useState(3421);

    useEffect(() => {
        if (isBuildTimePrerender()) return undefined;
        const iv = setInterval(() => setLiveOps((v) => v + Math.floor(Math.random() * 5) + 1), 2600);
        return () => clearInterval(iv);
    }, []);

    const handlePointerMove = useCallback((e) => {
        const el = canvasRef.current;
        if (!el) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        if (spotlightRef.current) {
            spotlightRef.current.style.opacity = "1";
            spotlightRef.current.style.background = `radial-gradient(560px circle at ${px * 100}% ${py * 100}%, rgba(41,216,213,0.14), transparent 62%)`;
        }
        if (tiltRef.current) {
            const rx = (0.5 - py) * 3.2;
            const ry = (px - 0.5) * 3.2;
            tiltRef.current.style.transform = `perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        }
    }, []);

    const handlePointerLeave = useCallback(() => {
        if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
        if (tiltRef.current) tiltRef.current.style.transform = "perspective(1400px) rotateX(0deg) rotateY(0deg)";
    }, []);

    const spaces = [
        {
            id: "operations",
            label: t("landing.hero_dashboard.suite_operations"),
            detail: t("landing.hero_dashboard.suite_operations_detail"),
            flow: [
                [t("landing.hero_dashboard.module_inventory"), t("landing.hero_dashboard.node_stock")],
                [t("landing.hero_dashboard.locations_label"), t("landing.hero_dashboard.badge_multisite")],
                [t("landing.hero_dashboard.module_reports"), t("landing.hero_dashboard.badge_realtime")],
            ],
            kpis: [
                ["24,860", t("landing.hero_dashboard.products_label")],
                ["12", t("landing.hero_dashboard.locations_label")],
                ["99.8%", t("landing.hero_dashboard.kpi_uptime_label")],
            ],
            spark: [40, 55, 48, 62, 58, 74, 68, 82],
        },
        {
            id: "commerce",
            label: t("landing.hero_dashboard.suite_commerce"),
            detail: t("landing.hero_dashboard.suite_commerce_detail"),
            flow: [
                [t("landing.hero_dashboard.flow_quote"), t("landing.hero_dashboard.node_orders")],
                [t("landing.hero_dashboard.module_sales"), t("landing.hero_dashboard.flow_order")],
                [t("landing.hero_dashboard.module_invoicing"), t("landing.hero_dashboard.node_dian")],
            ],
            kpis: [
                ["3,421", t("landing.hero_dashboard.kpi_orders_label")],
                ["1,204", t("landing.hero_dashboard.kpi_invoices_label")],
                ["480+", t("landing.hero_dashboard.kpi_clients_label")],
            ],
            spark: [30, 45, 38, 52, 60, 55, 70, 78],
        },
        {
            id: "finance",
            label: t("landing.hero_dashboard.suite_finance"),
            detail: t("landing.hero_dashboard.suite_finance_detail"),
            flow: [
                [t("landing.hero_dashboard.module_finance"), t("landing.hero_dashboard.node_cash")],
                [t("landing.hero_dashboard.flow_payment"), t("landing.hero_dashboard.auto_collections")],
                [t("landing.hero_dashboard.module_accounting"), t("landing.hero_dashboard.node_taxes")],
            ],
            kpis: [
                ["$2.8M", t("landing.hero_dashboard.kpi_portfolio_label")],
                ["98.4%", t("landing.hero_dashboard.kpi_reconciled_label")],
                ["32", t("landing.hero_dashboard.kpi_dso_label")],
            ],
            spark: [50, 46, 58, 52, 64, 60, 72, 69],
        },
        {
            id: "connect",
            label: t("landing.hero_dashboard.suite_connect"),
            detail: t("landing.hero_dashboard.suite_connect_detail"),
            flow: [
                [t("landing.hero_dashboard.team_label"), t("landing.hero_dashboard.badge_rbac")],
                [t("landing.hero_dashboard.module_integrations"), t("landing.hero_dashboard.badge_api")],
                [t("landing.hero_dashboard.badge_webhooks"), t("landing.hero_dashboard.badge_realtime")],
            ],
            kpis: [
                ["18", t("landing.hero_dashboard.kpi_integrations_label")],
                ["120K", t("landing.hero_dashboard.kpi_webhooks_label")],
                ["24/7", t("landing.hero_dashboard.kpi_support_label")],
            ],
            spark: [35, 50, 44, 60, 56, 68, 62, 80],
        },
    ];

    /* The real module map behind Ohnix — surfaced here so the canvas reads as
       the actual product, not a four-tile highlight reel. */
    const modules = [
        { icon: <EyeOutlined />, label: t("landing.hero_dashboard.module_overview"), suite: 0 },
        { icon: <DatabaseOutlined />, label: t("landing.hero_dashboard.module_inventory"), suite: 0 },
        { icon: <LineChartOutlined />, label: t("landing.hero_dashboard.module_reports"), suite: 0 },
        { icon: <SyncOutlined />, label: t("landing.hero_dashboard.module_sales"), suite: 1 },
        { icon: <ShoppingCartOutlined />, label: t("landing.hero_dashboard.module_purchases"), suite: 1 },
        { icon: <CheckCircleOutlined />, label: t("landing.hero_dashboard.module_invoicing"), suite: 1 },
        { icon: <DollarOutlined />, label: t("landing.hero_dashboard.module_finance"), suite: 2 },
        { icon: <BookOutlined />, label: t("landing.hero_dashboard.module_accounting"), suite: 2 },
        { icon: <ApiOutlined />, label: t("landing.hero_dashboard.module_integrations"), suite: 3 },
    ];

    // Starts false (matching what the prerendered HTML always ships, since
    // the build-time prerender never has a reduced-motion preference set)
    // and only picks up the visitor's real preference after mount. Reading
    // matchMedia directly during render would make this page's first client
    // render disagree with the server-rendered HTML for any visitor whose
    // OS/browser reduced-motion setting differs from the prerender
    // environment - a React hydration mismatch (errors #418/#423) that
    // discards and re-renders the entire page from scratch.
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReducedMotion(mql.matches);
        const handleChange = (e) => setReducedMotion(e.matches);
        mql.addEventListener("change", handleChange);
        return () => mql.removeEventListener("change", handleChange);
    }, []);

    useEffect(() => {
        if (reducedMotion) return;
        if (isBuildTimePrerender()) return undefined;
        const timer = setTimeout(() => setActive((value) => (value + 1) % spaces.length), ROTATE_MS);
        return () => clearTimeout(timer);
    }, [active, spaces.length, reducedMotion]);

    const current = spaces[active];
    const activeModules = modules.filter((m) => m.suite === active);

    return (
        <div
            ref={canvasRef}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
            className="relative min-h-[540px] overflow-hidden rounded-[46px] border border-[#29D8D5]/30 bg-[#050d0d] text-white shadow-[0_45px_150px_rgba(0,0,0,0.85),0_0_120px_rgba(41,216,213,0.16),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-white/[0.04]"
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_16%,rgba(41,216,213,0.13),transparent_24%),radial-gradient(circle_at_18%_88%,rgba(68,243,240,0.07),transparent_27%),linear-gradient(140deg,#071110,#020505_58%,#060808)]" />
            <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(41,216,213,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(41,216,213,0.075)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
            <div ref={spotlightRef} className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-500 hidden sm:block" />
            <div className="pointer-events-none absolute left-[18%] right-[8%] top-[73px] h-px overflow-hidden bg-white/[0.045]">
                <span className="block h-full w-1/3 animate-marquee bg-gradient-to-r from-transparent via-[#29D8D5] to-transparent shadow-[0_0_12px_#29D8D5]" />
            </div>

            <div ref={tiltRef} className="relative transition-transform duration-300 ease-out" style={{ transformStyle: "preserve-3d" }}>
            <header className="relative z-20 flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[#29D8D5]/20 bg-[#29D8D5]/[0.055] shadow-[inset_0_0_18px_rgba(41,216,213,0.06)]">
                        <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-7 w-7 object-contain" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold tracking-[0.16em] text-[#bdc9c7]">{t("landing.hero_dashboard.command_center")}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.16em] text-[#93a6a1]">
                            <span className="relative flex h-1 w-1 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#29D8D5] opacity-50" />
                                <span className="relative h-1 w-1 rounded-full bg-[#29D8D5] shadow-[0_0_7px_#29D8D5]" />
                            </span>
                            <span className="font-mono tabular-nums text-[#dbe7e5]">{liveOps.toLocaleString()}</span>
                            {t("landing.hero_dashboard.live_ops_label")}
                        </div>
                    </div>
                </div>

                <nav className="ml-auto hidden items-center gap-1 rounded-full border border-white/[0.055] bg-black/25 p-1.5 backdrop-blur-xl sm:flex">
                    {spaces.map((space, index) => (
                        <button key={space.id} type="button" onClick={() => setActive(index)} className={`relative w-[88px] shrink-0 truncate rounded-full py-2.5 text-center text-[9px] uppercase tracking-[0.06em] transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29D8D5] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${active === index ? "bg-[#29D8D5]/12 text-[#29D8D5]" : "text-[#a3b6b1] hover:text-white"}`}>
                            {space.label}
                            <WorkspaceProgress isActive={active === index} isPast={index < active} duration={ROTATE_MS} reducedMotion={reducedMotion} />
                        </button>
                    ))}
                </nav>
                <div className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.025] text-[11px] text-[#a3b6b1] sm:ml-0">⌕</div>
            </header>

            <div className="relative z-10 flex gap-2 px-2 pb-3 sm:px-3 sm:pb-4">
                <aside className="hidden w-[64px] shrink-0 flex-col items-center rounded-[26px] border border-white/[0.055] bg-black/30 px-2.5 py-3 backdrop-blur-2xl md:flex">
                    <div className="space-y-2">
                        {modules.map((module, index) => (
                            <button
                                key={`${module.label}-${index}`}
                                type="button"
                                title={module.label}
                                aria-label={module.label}
                                onClick={() => setActive(module.suite)}
                                className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29D8D5] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${module.suite === active ? "border-[#29D8D5]/30 bg-[#29D8D5]/12 text-[#29D8D5] shadow-[0_0_16px_rgba(41,216,213,0.1)]" : "border-transparent text-[#829990] hover:border-white/[0.06] hover:bg-white/[0.03] hover:text-white"}`}
                            >
                                {module.icon}
                            </button>
                        ))}
                    </div>
                    <span className="mt-auto h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_10px_#29D8D5] animate-pulse" />
                </aside>

                <main className="min-w-0 flex-1 overflow-hidden rounded-[32px] border border-white/[0.06] bg-white/[0.018] backdrop-blur-xl">
                    <div className="grid grid-cols-2 gap-1 border-b border-white/[0.05] p-2 sm:hidden">
                        {spaces.map((space, index) => (
                            <button key={space.id} type="button" onClick={() => setActive(index)} className={`rounded-2xl border px-3.5 py-3 text-left text-[10px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29D8D5] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${active === index ? "border-[#29D8D5]/25 bg-[#29D8D5]/10 text-[#29D8D5]" : "border-white/[0.045] bg-black/15 text-[#a3b6b1]"}`}>
                                <span className="mr-2 font-mono text-[7px] opacity-55">0{index + 1}</span>{space.label}
                            </button>
                        ))}
                    </div>

                    <div key={current.id} className="animate-fade-in px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <div className="font-mono text-[9px] tracking-[0.22em] text-[#29D8D5]">{t("landing.hero_dashboard.workspace_label")} / 0{active + 1}</div>
                                <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-white sm:text-4xl">{current.label}</h3>
                                <p className="mt-2 line-clamp-2 min-h-[40px] max-w-lg text-[11px] leading-5 text-[#748480] sm:min-h-[48px] sm:text-[13px] sm:leading-6">{current.detail}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-[8px] uppercase tracking-[0.13em] text-[#93a6a1]">
                                <span className="rounded-full border border-[#29D8D5]/12 px-3 py-1.5">{t("landing.hero_dashboard.badge_realtime")}</span>
                                <span className="rounded-full border border-[#29D8D5]/12 px-3 py-1.5">{t("landing.hero_dashboard.connected_note")}</span>
                            </div>
                        </div>

                        <div className="mt-3 flex min-h-[61px] flex-wrap items-start gap-1.5">
                            <span className="mr-0.5 text-[8px] uppercase tracking-[0.14em] text-[#7c8f8b]">{t("landing.hero_dashboard.modules_included_label")}</span>
                            {activeModules.map((module) => (
                                <span key={module.label} className="inline-flex max-w-[150px] items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[9px] text-[#a9b6b3]">
                                    <span className="shrink-0 text-[#29D8D5]">{module.icon}</span>
                                    <span className="truncate">{module.label}</span>
                                </span>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {current.kpis.map(([value, label], index) => (
                                <div key={label} className="relative overflow-hidden rounded-[18px] border border-white/[0.05] bg-black/20 px-2.5 py-3 sm:px-3.5 sm:py-3.5">
                                    {index === 0 && <KpiSparkline data={current.spark} />}
                                    <div className="relative truncate text-lg font-semibold tabular-nums text-white sm:text-xl">{value}</div>
                                    <div className="relative mt-1 truncate text-[7px] uppercase tracking-[0.1em] text-[#93a6a1] sm:text-[8px]">{label}</div>
                                </div>
                            ))}
                        </div>

                        <section className="relative mt-3 overflow-hidden rounded-[28px] border border-[#29D8D5]/10 bg-[linear-gradient(115deg,rgba(41,216,213,0.055),rgba(255,255,255,0.012))] px-3 py-5 sm:px-5 sm:py-7">
                            <div className="pointer-events-none absolute left-[12%] right-[12%] top-1/2 hidden h-px bg-gradient-to-r from-transparent via-[#29D8D5]/35 to-transparent sm:block">
                                <span key={current.id} className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#29D8D5] shadow-[0_0_10px_#29D8D5] animate-flow-travel-dot" />
                            </div>
                            <div className="relative grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                                {current.flow.map(([label, meta], index) => (
                                    <React.Fragment key={label}>
                                        <div className="group relative rounded-[22px] border border-white/[0.07] bg-black/25 p-5 transition-all duration-500 hover:-translate-y-1 hover:border-[#29D8D5]/25 hover:bg-[#29D8D5]/[0.045]">
                                            <div className="flex items-center justify-between">
                                                <span className="h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_9px_#29D8D5]" />
                                                <span className="font-mono text-[8px] text-[#7c8f8b]">{t("landing.hero_dashboard.node_label")} / 0{index + 1}</span>
                                            </div>
                                            <div className="mt-7 truncate text-[12px] font-semibold text-[#d4ddda]">{label}</div>
                                            <div className="mt-1 truncate text-[8px] uppercase tracking-[0.1em] text-[#93a6a1]">{meta}</div>
                                        </div>
                                        {index < current.flow.length - 1 && <span className="hidden text-sm text-[#29D8D5]/50 sm:block">›</span>}
                                    </React.Fragment>
                                ))}
                            </div>
                        </section>
                    </div>
                </main>
            </div>
            </div>
        </div>
    );
};

/* ── Page-wide orbital background layer ────────────────────────────── */
/* ── Page-wide orbital background layer (mouse + scroll parallax) ─── */
export const PageOrbitalLayer = () => {
    const ringRefs  = useRef([]);
    const target    = useRef({ x: 50, y: 50, scroll: 0 });
    const cur       = useRef({ x: 50, y: 50, scroll: 0 });
    const rafRef    = useRef(null);

    // [mouseDepth, scrollDepth-px-per-scrollY-px] — 2× bigger than before
    const depths = [
        [0.18, -0.08],
        [0.28,  0.12],
        [0.38, -0.06],
        [0.10,  0.15],
        [0.48, -0.12],
    ];

    useEffect(() => {
        const lerp = (a, b, t) => a + (b - a) * t;

        const tick = () => {
            cur.current.x      = lerp(cur.current.x,      target.current.x,      0.055);
            cur.current.y      = lerp(cur.current.y,      target.current.y,      0.055);
            cur.current.scroll = lerp(cur.current.scroll, target.current.scroll, 0.055);

            const mx = cur.current.x - 50;
            const my = cur.current.y - 50;
            const s  = cur.current.scroll;

            ringRefs.current.forEach((el, i) => {
                if (!el) return;
                const [md, sd] = depths[i];
                el.style.transform = `translate(${mx * md}px, ${my * md + s * sd}px)`;
            });

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        const onMove   = (e) => {
            target.current.x = (e.clientX / window.innerWidth)  * 100;
            target.current.y = (e.clientY / window.innerHeight) * 100;
        };
        const onScroll = () => { target.current.scroll = window.scrollY; };

        window.addEventListener("mousemove", onMove,   { passive: true });
        window.addEventListener("scroll",    onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("scroll",    onScroll);
        };
    }, []);

    /* Shared dot glow layers — bright core + mid halo + diffuse outer */
    const glowTeal  = "0 0 5px 2px #29D8D5, 0 0 22px 8px rgba(41,216,213,0.95), 0 0 55px 18px rgba(41,216,213,0.6), 0 0 110px 35px rgba(41,216,213,0.32)";
    const glowCyan  = "0 0 5px 2px #44F3F0, 0 0 22px 8px rgba(68,243,240,0.95), 0 0 55px 18px rgba(68,243,240,0.6), 0 0 110px 35px rgba(68,243,240,0.32)";
    const pingTeal  = "1px solid rgba(41,216,213,0.55)";
    const pingCyan  = "1px solid rgba(68,243,240,0.55)";

    return (
        <div
            className="pointer-events-none fixed inset-0 select-none overflow-hidden opacity-40 md:opacity-100"
            style={{ zIndex: 2, mixBlendMode: "screen" }}
            aria-hidden="true"
        >
            {/* Ring A — large, top-right, slow */}
            <div ref={(el) => { ringRefs.current[0] = el; }} className="absolute -right-48 top-6" style={{ willChange: "transform" }}>
                <div className="rounded-full animate-orbit-slow" style={{ width: 560, height: 560, border: "1.5px solid rgba(41,216,213,0.25)" }}>
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                        <div className="absolute inset-0 rounded-full animate-ripple" style={{ width: 28, height: 28, border: pingTeal }} />
                        <div className="absolute inset-0 rounded-full animate-ripple-delay" style={{ width: 28, height: 28, border: pingTeal }} />
                        <div className="h-5 w-5 rounded-full" style={{ background: "#29D8D5", boxShadow: glowTeal }} />
                    </div>
                </div>
            </div>

            {/* Ring B — medium, centre-left, mid reverse */}
            <div ref={(el) => { ringRefs.current[1] = el; }} className="absolute -left-52 top-[38%] hidden md:block" style={{ willChange: "transform" }}>
                <div className="rounded-full animate-orbit-mid" style={{ width: 345, height: 345, border: "1.5px solid rgba(68,243,240,0.25)" }}>
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                        <div className="absolute inset-0 rounded-full animate-ripple" style={{ width: 24, height: 24, border: pingCyan }} />
                        <div className="absolute inset-0 rounded-full animate-ripple-delay" style={{ width: 24, height: 24, border: pingCyan }} />
                        <div className="h-4 w-4 rounded-full" style={{ background: "#44F3F0", boxShadow: glowCyan }} />
                    </div>
                </div>
            </div>

            {/* Ring C — small, lower-right, fast */}
            <div ref={(el) => { ringRefs.current[2] = el; }} className="absolute -bottom-20 right-[18%]" style={{ willChange: "transform" }}>
                <div className="rounded-full animate-orbit-fast" style={{ width: 262, height: 262, border: "1.5px solid rgba(41,216,213,0.25)" }}>
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                        <div className="absolute inset-0 rounded-full animate-ripple" style={{ width: 22, height: 22, border: pingTeal }} />
                        <div className="absolute inset-0 rounded-full animate-ripple-delay" style={{ width: 22, height: 22, border: pingTeal }} />
                        <div className="h-3.5 w-3.5 rounded-full" style={{ background: "#29D8D5", boxShadow: glowTeal }} />
                    </div>
                </div>
            </div>

            {/* Ring D — extra-large, lower-left, very slow reverse */}
            <div ref={(el) => { ringRefs.current[3] = el; }} className="absolute -bottom-96 -left-96 hidden md:block" style={{ willChange: "transform" }}>
                <div className="rounded-full animate-orbit-slow" style={{ width: 820, height: 820, border: "1.5px solid rgba(41,216,213,0.25)", animationDirection: "reverse" }}>
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                        <div className="absolute inset-0 rounded-full animate-ripple" style={{ width: 22, height: 22, border: pingTeal }} />
                        <div className="absolute inset-0 rounded-full animate-ripple-delay" style={{ width: 22, height: 22, border: pingTeal }} />
                        <div className="h-3.5 w-3.5 rounded-full" style={{ background: "#29D8D5", boxShadow: glowTeal }} />
                    </div>
                </div>
            </div>

            {/* Ring E — tiny accent, upper-left, xs reverse */}
            <div ref={(el) => { ringRefs.current[4] = el; }} className="absolute left-[12%] top-[10%] hidden md:block" style={{ willChange: "transform" }}>
                <div className="rounded-full animate-orbit-xs" style={{ width: 131, height: 131, border: "1.5px solid rgba(68,243,240,0.25)" }}>
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                        <div className="absolute inset-0 rounded-full animate-ripple" style={{ width: 18, height: 18, border: pingCyan }} />
                        <div className="absolute inset-0 rounded-full animate-ripple-delay" style={{ width: 18, height: 18, border: pingCyan }} />
                        <div className="h-3 w-3 rounded-full" style={{ background: "#44F3F0", boxShadow: glowCyan }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const VideoModal = ({ isOpen, onClose, src, title }) => {
    const { t } = useI18n();
    useScrollLock(isOpen);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        if (isOpen) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const embedSrc = src
        ? src.replace("watch?v=", "embed/") + "?autoplay=1&rel=0"
        : null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-8">
            {/* backdrop */}
            <div
                className="absolute inset-0 bg-black/85 backdrop-blur-lg animate-fade-in"
                onClick={onClose}
            />
            {/* panel */}
            <div className="relative w-full max-w-4xl animate-scale-in">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute -right-1 -top-12 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 hover:border-white/30"
                    aria-label={t("landing.video_modal.close_aria_label")}
                >
                    <CloseOutlined />
                </button>

                <div className="overflow-hidden rounded-[28px] border border-[#29D8D5]/25 bg-[#090909] shadow-[0_0_0_1px_rgba(41,216,213,0.08),0_48px_120px_rgba(0,0,0,0.85)]">
                    <div className="aspect-video bg-[#090909]">
                        {embedSrc ? (
                            <iframe
                                title={title || t("landing.video_modal.default_title")}
                                className="h-full w-full"
                                src={embedSrc}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                            />
                        ) : (
                            /* placeholder while there's no real video URL */
                            <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
                                <div className="relative flex h-24 w-24 items-center justify-center">
                                    <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/20 animate-ripple" />
                                    <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/15 animate-ripple-delay" />
                                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#29D8D5]">
                                        <PlayCircleOutlined className="text-4xl" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-white">{t("landing.video_modal.coming_soon_title")}</p>
                                    <p className="mt-2 text-sm text-[#A9B3B8]">{t("landing.video_modal.coming_soon_description")}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* Standing "demo coming soon" section for the landing page - unlike VideoModal
   (only reachable if something opens it, and nothing currently does), this is
   always visible so visitors don't need a real video to know a demo is on the
   way and how to ask for a live one. */
export const DemoTeaserSection = ({ heading, onContactClick }) => {
    const { t } = useI18n();
    const videoRef = useRef(null);
    const [playing, setPlaying] = useState(false);

    const handlePlay = () => {
        videoRef.current?.play();
    };

    return (
        <ContentSection id="demo-preview">
            <SectionHeading
                eyebrow={heading.eyebrow}
                title={heading.title}
                description={heading.description}
            />

            <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="relative aspect-video overflow-hidden rounded-[22px] border border-white/8 bg-[#0a0a0a]">
                    <video
                        ref={videoRef}
                        src="/demo-preview.mp4"
                        poster="/demo-poster.jpg"
                        controls={playing}
                        preload="metadata"
                        playsInline
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onEnded={() => setPlaying(false)}
                        className="h-full w-full object-cover"
                    />
                    {!playing && (
                        <button
                            type="button"
                            onClick={handlePlay}
                            aria-label={t("landing.demo.primary_cta")}
                            className="group absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/45 text-center transition-colors duration-300 hover:bg-black/35"
                        >
                            <span className="relative flex h-24 w-24 items-center justify-center">
                                <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/20 animate-ripple" />
                                <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/15 animate-ripple-delay" />
                                <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#29D8D5] transition-transform duration-300 group-hover:scale-105">
                                    <PlayCircleOutlined className="text-4xl" />
                                </span>
                            </span>
                            <p className="text-lg font-semibold text-white">{heading.title}</p>
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button
                    type="button"
                    onClick={onContactClick}
                    className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#29D8D5] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#44F3F0]"
                >
                    {t("landing.demo.contact_cta")}
                    <ArrowRightOutlined className="transition-transform duration-300 group-hover:translate-x-1" />
                </button>
            </div>
        </ContentSection>
    );
};

/* ── Horizontal marquee ticker ──────────────────────────────────────── */
export const MarqueeStrip = ({ items }) => {
    const doubled = [...items, ...items];
    return (
        <div className="relative overflow-hidden border-y border-white/[0.025] bg-[#030303] py-3.5 select-none md:border-white/[0.04] md:py-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#030303] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#030303] to-transparent" />
            <div className="flex w-max animate-marquee items-center gap-12">
                {doubled.map((item, i) => (
                    <span
                        key={i}
                        className="inline-flex shrink-0 items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#5A6770] whitespace-nowrap transition-colors"
                    >
                        <span className="h-1 w-1 rounded-full bg-[#29D8D5]/70 shadow-[0_0_6px_rgba(41,216,213,0.7)]" />
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
};

// `as="h1"` on pages that use SectionHeading as their sole/primary heading
// (Precios, Demo, SoftwareInventarioPymes, OhnixVsAlegra, Blog - none of
// which render OrbitalHero) - those pages had zero <h1> on them otherwise.
// Defaults to h2 for its normal use as a sub-section heading (e.g. inside
// LandingPage.jsx, which already has its own h1 via OrbitalHero).
export const SectionHeading = ({ eyebrow, title, description, align = "center", as: HeadingTag = "h2" }) => {
    const [ref, visible] = useScrollReveal(0.1);
    const alignment = align === "left" ? "items-start text-left" : "items-center text-center";

    return (
        <div
            ref={ref}
            className={`flex flex-col gap-4 ${alignment} transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
            {eyebrow ? (
                <span className="inline-flex items-center gap-3 rounded-full border border-white/[0.06] bg-white/[0.035] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#29D8D5] md:border-white/10 md:text-[11px] md:tracking-[0.28em] md:shadow-[0_0_0_1px_rgba(41,216,213,0.08)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_18px_rgba(41,216,213,0.85)]" />
                    {eyebrow}
                </span>
            ) : null}
            <div className="max-w-4xl">
                <HeadingTag className="text-2xl font-semibold tracking-tight md:text-4xl md:leading-[1.1] bg-gradient-to-br from-white via-[#E8EDEE] to-[#29D8D5]/55 bg-clip-text text-transparent">
                    {title}
                </HeadingTag>
                {description ? (
                    <p className="mt-4 text-sm leading-7 text-[#A9B3B8] md:text-lg">
                        {description}
                    </p>
                ) : null}
            </div>
        </div>
    );
};

export const OrbitalHero = ({
    eyebrow,
    title,
    subtitle,
    primaryCta,
    secondaryCta,
    onPrimary,
    onSecondary,
    stats,
    orbitLabels,
    cyclingWords = [],
    heroVisual = null,
    footerNote = "Traceability on every movement",
    productImage = "/Ohnix_FullLogo_Transparent.png",
    productImageAlt = "Ohnix inventory dashboard",
}) => {
    const [pointer, setPointer] = useState({ x: 50, y: 40 });

    return (
        <section
            id="home"
            className="relative overflow-hidden border-b border-white/[0.025] bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.12),transparent_24%),radial-gradient(circle_at_20%_20%,rgba(68,243,240,0.08),transparent_24%),linear-gradient(180deg,#070707_0%,#050505_36%,#050505_100%)] md:border-white/5"
            onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                setPointer({ x, y });
            }}
        >
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px] md:opacity-60" />
            <div
                className="pointer-events-none absolute inset-0 opacity-25 transition-transform duration-300 md:opacity-70"
                style={{
                    transform: `translate3d(${(pointer.x - 50) * 0.14}px, ${(pointer.y - 50) * 0.14}px, 0)`,
                }}
            >
                <div className="absolute left-[10%] top-[8%] h-40 w-40 rounded-full border border-[#29D8D5]/10 blur-[1px]" />
                <div className="absolute right-[6%] top-[12%] h-56 w-56 rounded-full border border-white/10" />
                <div className="absolute bottom-[10%] left-[28%] h-24 w-24 rounded-full border border-[#44F3F0]/10" />
                <div className="absolute right-[20%] bottom-[18%] h-64 w-64 rounded-full border border-white/[0.06]" />
            </div>

            <div className="relative mx-auto max-w-[1440px] px-5 pb-16 pt-28 sm:px-6 md:px-10 md:pb-20 md:pt-20 lg:pt-24">
                {/* ── Mobile-only ambient blobs ───────────────────────────────── */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden md:hidden" aria-hidden="true">
                    <div className="absolute -left-24 top-24 h-80 w-80 rounded-full bg-[#29D8D5]/8 blur-[90px] animate-blob-float" />
                    <div className="absolute -right-16 top-1/3 h-64 w-64 rounded-full bg-[#44F3F0]/6 blur-[70px] animate-blob-float-alt" />
                    <div className="absolute bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#29D8D5]/5 blur-[55px] animate-float-slow" />
                </div>

                <div className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
                    <div className="relative z-10">
                        {/* ── Eyebrow with live pulse dot ─── */}
                        <div className="animate-fade-up inline-flex items-center gap-3 rounded-full border border-white/[0.06] bg-white/[0.035] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#29D8D5] md:border-white/10 md:text-[11px] md:tracking-[0.35em]">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-[#29D8D5] opacity-70 animate-ping" />
                                <span className="relative h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_16px_rgba(41,216,213,0.9)]" />
                            </span>
                            {eyebrow}
                        </div>

                        <h1
                            className="mt-6 max-w-3xl text-[2.65rem] font-semibold leading-[1.02] tracking-tight text-white sm:text-5xl sm:leading-[1.05] md:mt-7 animate-fade-up"
                            style={{ animationDelay: "0.1s" }}
                        >
                            {title}
                        </h1>

                        {cyclingWords.length > 0 && (
                            <div
                                className="mt-3 text-4xl font-semibold tracking-tight animate-fade-up"
                                style={{ animationDelay: "0.15s" }}
                            >
                                <span className="md:hidden">{cyclingWords[0]}</span>
                                <span className="hidden md:inline"><TypewriterWord words={cyclingWords} /></span>
                            </div>
                        )}

                        <p
                            className="mt-6 max-w-2xl text-base leading-8 text-[#A9B3B8] md:text-xl animate-fade-up"
                            style={{ animationDelay: "0.2s" }}
                        >
                            {subtitle}
                        </p>

                        <div
                            className="mt-10 flex flex-col gap-4 sm:flex-row animate-fade-up"
                            style={{ animationDelay: "0.3s" }}
                        >
                            <button
                                type="button"
                                onClick={onPrimary}
                                className="group relative inline-flex items-center justify-center gap-3 rounded-full bg-[#29D8D5] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#44F3F0] animate-glow-pulse"
                            >
                                {primaryCta}
                                <ArrowRightOutlined className="transition-transform duration-300 group-hover:translate-x-1" />
                            </button>
                            {secondaryCta && (
                                <button
                                    type="button"
                                    onClick={onSecondary}
                                    className="group inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-[#29D8D5]/40 hover:bg-white/[0.06]"
                                >
                                    <PlayCircleOutlined className="text-[#29D8D5] transition-transform duration-300 group-hover:scale-110" />
                                    {secondaryCta}
                                </button>
                            )}
                        </div>

                        <div
                            className="mt-10 grid grid-cols-3 gap-2 sm:mt-12 sm:gap-4 animate-fade-up"
                            style={{ animationDelay: "0.4s" }}
                        >
                            {stats.map((stat, i) => (
                                <div
                                    key={stat.label}
                                    className="group rounded-2xl border border-white/[0.045] bg-white/[0.025] px-2.5 py-4 backdrop-blur-sm transition-all duration-300 sm:rounded-3xl sm:px-5 sm:py-5 md:border-white/8 hover:border-[#29D8D5]/30 hover:bg-white/[0.05]"
                                    style={{ animationDelay: `${0.45 + i * 0.08}s` }}
                                >
                                    {stat.icon && (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#29D8D5]/25 bg-[#29D8D5]/10 text-base text-[#44F3F0] transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10 sm:text-lg">
                                            {stat.icon}
                                        </div>
                                    )}
                                    <div className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
                                        {stat.value}
                                    </div>
                                    <div className="mt-1.5 text-[10px] leading-4 text-[#A9B3B8] sm:text-sm sm:leading-normal">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto w-full min-w-0 max-w-[780px] animate-fade-up" style={{ animationDelay: "0.2s" }}>
                        <div className="absolute -inset-14 rounded-[52px] bg-[radial-gradient(circle_at_center,rgba(41,216,213,0.4),transparent_68%)] blur-[42px]" />

                        <div className="relative transition-transform duration-500 hover:-translate-y-1 animate-float">
                            <div className="overflow-visible">
                                <div>
                                    {heroVisual || (
                                        <img
                                            src={productImage}
                                            alt={productImageAlt}
                                            width="1200"
                                            height="760"
                                            className="block w-full select-none"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            {orbitLabels.map((label, i) => (
                                <span
                                    key={label}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.055] bg-[#0B0B0B]/90 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#A9B3B8] backdrop-blur-sm animate-fade-in md:border-white/10 md:text-[11px] md:tracking-[0.18em]"
                                    style={{ animationDelay: `${0.6 + i * 0.15}s` }}
                                >
                                    <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_12px_rgba(68,243,240,0.85)] animate-pulse" />
                                    {label}
                                </span>
                            ))}
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-3 rounded-full border border-white/[0.055] bg-[#0B0B0B]/90 px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-[#A9B3B8] backdrop-blur-md md:border-white/10 md:px-5 md:text-xs md:tracking-[0.22em]">
                            <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_16px_rgba(68,243,240,0.9)]" />
                            {footerNote}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export const ContentSection = ({ id, children, className = "", shell = true }) => {
    const content = (
        <div className={`relative mx-auto max-w-[1440px] px-5 py-16 sm:px-6 md:px-10 md:py-28 animate-fade-up ${className}`}>
            {children}
        </div>
    );

    if (!shell) {
        return <section id={id}>{content}</section>;
    }

    return (
        <section id={id} className={sectionShell}>
            <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)] [background-size:34px_34px]" />
            {content}
        </section>
    );
};

export const CardGrid = ({ items, columns = 3, iconTone = "accent" }) => {
    const [ref, visible] = useScrollReveal();

    const gridClass = {
        2: "md:grid-cols-2",
        3: "md:grid-cols-2 xl:grid-cols-3",
        4: "md:grid-cols-2 xl:grid-cols-4",
    }[columns] || "md:grid-cols-2 xl:grid-cols-3";

    return (
        <div ref={ref} className={`grid gap-5 ${gridClass}`}>
            {items.map((item, index) => {
                const iconClass =
                    iconTone === "accent"
                        ? "text-[#29D8D5]"
                        : "text-white";

                return (
                    <article
                        key={item.title}
                        className={`group rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/30 hover:bg-white/[0.05] ${visible ? "animate-fade-up" : "opacity-0"}`}
                        style={{ animationDelay: `${index * 0.08}s` }}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-3 ${iconClass} transition-transform duration-300 group-hover:scale-110`}>
                                <span className="text-2xl">{item.icon}</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">
                                    {item.title}
                                </h3>
                                <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                                    {item.description}
                                </p>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export const MissionVisionSection = ({ heading, mission, vision, valuesTitle, values }) => (
    <ContentSection id="about">
        <div className="grid gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-start">
            <div>
                <SectionHeading
                    align="left"
                    eyebrow={heading.eyebrow}
                    title={heading.title}
                    description={heading.description}
                />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                <article className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <div className="mb-4 inline-flex rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#44F3F0]">
                        {mission.label}
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">{mission.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{mission.description}</p>
                </article>

                <article className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#A9B3B8]">
                        {vision.label}
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">{vision.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{vision.description}</p>
                </article>

                <div className="md:col-span-2 rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">{valuesTitle}</h3>
                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                        {values.map((value) => (
                            <div
                                key={value.title}
                                className="rounded-2xl border border-white/8 bg-[#070707] p-5 transition-all duration-300 hover:border-[#29D8D5]/25"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#29D8D5]/10 text-[#29D8D5]">
                                    {value.icon}
                                </div>
                                <h4 className="mt-4 text-base font-semibold text-white">{value.title}</h4>
                                <p className="mt-2 text-sm leading-7 text-[#A9B3B8]">{value.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </ContentSection>
);

export const CycleTimelineSection = ({ heading, steps }) => {
    const [ref, visible] = useScrollReveal(0.06);
    return (
    <ContentSection id="timeline">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div ref={ref} className="relative mt-14">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-gradient-to-r from-transparent via-[#29D8D5]/35 to-transparent lg:block"
            />
            <div className="grid gap-5 lg:grid-cols-4">
            {steps.map((step, index) => (
                <article
                    key={step.title}
                    className={`group relative overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-500 hover:-translate-y-2 hover:border-[#29D8D5]/40 hover:bg-white/[0.05] hover:shadow-[0_0_0_1px_rgba(41,216,213,0.12),0_20px_60px_rgba(0,0,0,0.4)] ${
                        visible
                            ? index % 2 === 0 ? "animate-slide-from-left" : "animate-slide-from-right"
                            : "opacity-0"
                    }`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                >
                    {/* sweep on hover */}
                    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden rounded-[28px]">
                        <div className="absolute -left-full top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-sweep" />
                    </div>
                    <div className="absolute right-5 top-5 text-[11px] font-semibold uppercase tracking-[0.35em] text-[#A9B3B8]">
                        {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-[#29D8D5]/10 text-[#29D8D5] transition-all duration-300 group-hover:bg-[#29D8D5]/20 group-hover:scale-110">
                        {step.icon}
                    </div>
                    <h3 className="mt-6 text-lg font-semibold tracking-tight text-white md:text-xl">{step.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{step.description}</p>
                </article>
            ))}
            </div>
        </div>
    </ContentSection>
    );
};

export const MobileStickyCta = ({ primaryCta, secondaryCta, onPrimary, onSecondary }) => (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050505]/96 px-4 py-3 backdrop-blur-xl md:hidden animate-slide-up"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
        <div className="mx-auto flex max-w-lg gap-3">
            {secondaryCta && (
                <button
                    type="button"
                    onClick={onSecondary}
                    className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-white transition-all active:scale-95 hover:border-[#29D8D5]/30"
                >
                    {secondaryCta}
                </button>
            )}
            <button
                type="button"
                onClick={onPrimary}
                className="relative flex-1 overflow-hidden rounded-full bg-[#29D8D5] px-4 py-3.5 text-sm font-semibold text-[#021314] transition-all active:scale-95"
            >
                <span className="pointer-events-none absolute inset-0 rounded-full animate-ripple bg-[#44F3F0]" />
                <span className="pointer-events-none absolute inset-0 rounded-full animate-ripple-delay bg-[#44F3F0]" />
                <span className="relative">{primaryCta}</span>
            </button>
        </div>
    </div>
);

export const ImpactMetricsSection = ({ heading, metrics }) => {
    const [ref, visible] = useScrollReveal();
    return (
    <ContentSection id="impact">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div ref={ref} className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric, i) => (
                <article
                    key={metric.label}
                    className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6 transition-all duration-500 hover:border-[#29D8D5]/30 hover:-translate-y-1 animate-fade-up"
                    style={{ animationDelay: `${i * 0.1}s` }}
                >
                    <div className="text-4xl font-semibold tracking-tight text-white tabular-nums">
                        <AnimatedStat value={metric.value} active={visible} />
                    </div>
                    <div className="mt-3 text-sm uppercase tracking-[0.28em] text-[#29D8D5]">
                        {metric.label}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-[#A9B3B8]">{metric.description}</p>
                </article>
            ))}
        </div>
    </ContentSection>
    );
};

export const UseCasesSection = ({ heading, useCases }) => (
    <ContentSection id="stories">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {useCases.map((useCase) => (
                <article
                    key={useCase.title}
                    className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/30"
                >
                    <div className="text-xs uppercase tracking-[0.3em] text-[#29D8D5]">{useCase.context}</div>
                    <div className="mt-4 text-lg font-semibold tracking-tight text-white md:text-xl">{useCase.title}</div>
                    <p className="mt-3 text-sm leading-7 text-[#D4DBDF]">{useCase.description}</p>
                </article>
            ))}
        </div>
    </ContentSection>
);

export const ComparisonTeaserSection = ({ heading, headers, rows, cta, onCtaClick }) => (
    <ContentSection id="comparison">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-10 overflow-hidden rounded-[24px] border border-white/10">
            <div className="grid grid-cols-3 bg-white/[0.06] px-5 py-4 text-sm font-semibold text-white">
                <div>{headers.criteria}</div>
                <div>{headers.ohnix}</div>
                <div>{headers.competitor}</div>
            </div>
            {rows.map((row) => (
                <div
                    key={row.criteria}
                    className="grid grid-cols-3 gap-4 border-t border-white/10 px-5 py-4 text-sm"
                >
                    <div className="text-white">{row.criteria}</div>
                    <div className="text-[#CFE8E8]">{row.ohnix}</div>
                    <div className="text-[#A9B3B8]">{row.competitor}</div>
                </div>
            ))}
        </div>

        <div className="mt-8 flex justify-center">
            <button
                type="button"
                onClick={onCtaClick}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-[#29D8D5]/40 hover:bg-white/[0.06]"
            >
                {cta}
            </button>
        </div>
    </ContentSection>
);

export const PartnersSection = ({ heading, partners }) => (
    <ContentSection id="partners">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-12 flex flex-wrap justify-center gap-4">
            {partners.map((partner) => (
                <div
                    key={partner}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-5 py-3 text-sm text-[#D4DBDF] transition-all duration-300 hover:border-[#29D8D5]/35 hover:text-white"
                >
                    {partner}
                </div>
            ))}
        </div>
    </ContentSection>
);

export const FaqSection = ({ heading, items }) => (
    <ContentSection id="faq">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
                <details
                    key={item.question}
                    className="group rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 open:border-[#29D8D5]/30 open:bg-white/[0.05]"
                >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold tracking-tight text-white marker:hidden md:text-xl">
                        <span>{item.question}</span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#29D8D5] transition-transform duration-300 group-open:rotate-45">
                            <PlusIcon />
                        </span>
                    </summary>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-[#A9B3B8]">{item.answer}</p>
                </details>
            ))}
        </div>
    </ContentSection>
);

export const ContactSection = ({ heading, primaryCta, secondaryCta, onPrimary, onSecondary, contact }) => (
    <ContentSection id="contact">
        <div className="relative overflow-hidden rounded-[36px] border border-[#29D8D5]/20 bg-[radial-gradient(ellipse_at_top_left,rgba(41,216,213,0.14),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(68,243,240,0.10),transparent_50%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-8 md:p-12 lg:p-16">
            {/* Ambient animated orbs */}
            <div aria-hidden="true" className="pointer-events-none">
                <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-[#29D8D5]/8 blur-[80px] animate-blob-float" />
                <div className="absolute -right-16 -bottom-16 h-56 w-56 rounded-full bg-[#44F3F0]/6 blur-[60px] animate-blob-float-alt" />
            </div>
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div>
                    <SectionHeading
                        align="left"
                        eyebrow={heading.eyebrow}
                        title={heading.title}
                        description={heading.description}
                    />

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                        <button
                            type="button"
                            onClick={onPrimary}
                            className="inline-flex items-center justify-center gap-3 rounded-full bg-[#29D8D5] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#44F3F0]"
                        >
                            {primaryCta}
                            <ArrowRightOutlined />
                        </button>
                        <button
                            type="button"
                            onClick={onSecondary}
                            className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-[#29D8D5]/35 hover:bg-white/[0.06]"
                        >
                            {secondaryCta}
                        </button>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="rounded-[28px] border border-white/8 bg-[#060606] p-6">
                        <div className="text-xs uppercase tracking-[0.35em] text-[#A9B3B8]">{contact.emailLabel}</div>
                        <a href={`mailto:${contact.email}`} className="mt-3 block text-2xl font-semibold text-white transition-colors duration-300 hover:text-[#44F3F0]">
                            {contact.email}
                        </a>
                    </div>
                    <div className="rounded-[28px] border border-white/8 bg-[#060606] p-6">
                        <div className="text-xs uppercase tracking-[0.35em] text-[#A9B3B8]">{contact.signalLabel}</div>
                        <p className="mt-3 text-sm leading-7 text-[#D4DBDF]">{contact.signalDescription}</p>
                    </div>
                </div>
            </div>
        </div>
    </ContentSection>
);

export const PricingSection = ({ heading, plans, featuredLabel, onPlanSelect, billingToggle, paymentMethodsNote }) => {
    const [ref, visible] = useScrollReveal(0.06);
    return (
    <ContentSection id="pricing">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        {billingToggle && <div className="mt-8 flex justify-center">{billingToggle}</div>}
        {paymentMethodsNote && (
            <p className="mt-3 text-center text-[11px] text-[#6B7880]">{paymentMethodsNote}</p>
        )}

        <div ref={ref} className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, i) => (
                <article
                    key={plan.key ?? plan.name}
                    className={`relative flex flex-col overflow-hidden rounded-[28px] border p-6 transition-all duration-500 hover:-translate-y-2 ${
                        plan.featured
                            ? "border-[#29D8D5]/40 bg-[linear-gradient(180deg,rgba(41,216,213,0.12),rgba(255,255,255,0.03))] shadow-[0_0_0_1px_rgba(41,216,213,0.08),0_18px_50px_rgba(0,0,0,0.38)]"
                            : "border-white/8 bg-white/[0.03]"
                    } ${visible ? "animate-reveal-up" : "opacity-0"}`}
                    style={{ animationDelay: `${i * 0.1}s` }}
                >
                    {/* Shimmer sweep on featured card */}
                    {plan.featured && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[28px]">
                            <div className="absolute top-0 h-full w-[45%] -skew-x-12 bg-gradient-to-r from-transparent via-[#29D8D5]/6 to-transparent animate-sweep" />
                        </div>
                    )}

                    {/* Header row: icon + name */}
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#44F3F0]">
                            {plan.icon}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                            <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">{plan.name}</h3>
                            <p className="mt-0.5 text-[11px] leading-snug text-[#6B7880]">{plan.subtitle}</p>
                            {plan.featured && (
                                <span className="mt-2 inline-flex rounded-full border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#44F3F0]">
                                    {featuredLabel}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Price, billing and currency badge always on one row
                        (flex-nowrap) - the badge is deliberately compact
                        (tight padding, no letter-spacing) so even the longest
                        amount ("$200.000 /mes COP") fits without wrapping,
                        keeping every card's row identical regardless of
                        digit count. */}
                    <div className="mt-5 flex flex-nowrap items-baseline gap-1.5 whitespace-nowrap">
                        <span className={`font-semibold tracking-tight text-white ${plan.billing ? "text-4xl" : "text-2xl"}`}>
                            {plan.price}
                        </span>
                        {plan.billing && (
                            <span className="text-sm text-[#6B7880]">{plan.billing}</span>
                        )}
                        {/* Currency badge - only shown for COP, since "$" alone
                            is ambiguous between USD and COP. */}
                        {plan.currencyBadge && (
                            <span className="inline-flex items-center rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[#44F3F0]">
                                {plan.currencyBadge}
                            </span>
                        )}
                    </div>

                    {plan.savings && (
                        <p className="mt-1.5 text-[11px] font-semibold text-[#44F3F0]">{plan.savings}</p>
                    )}

                    {/* Description */}
                    <p className="mt-3 text-[12px] leading-relaxed text-[#8A9BA8]">{plan.description}</p>

                    {/* Divider */}
                    <div className="mt-5 border-t border-white/[0.06]" />

                    {/* Features — flex-1 so all cards align CTA to bottom */}
                    <ul className="mt-4 flex-1 space-y-2">
                        {plan.features.map((feature) => {
                            // A plain string scales with the previous tier; an
                            // object marks the one capability this tier actually
                            // adds - see Precios.jsx for the same pattern.
                            const label = typeof feature === "string" ? feature : feature.text;
                            const isNew = typeof feature === "object" && feature.highlight;
                            return (
                                <li
                                    key={label}
                                    className={`flex items-start gap-2 text-[12px] ${isNew ? "text-white" : "text-[#C4CDD2]"}`}
                                >
                                    <span
                                        className={`mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                                            isNew ? "bg-[#29D8D5] text-[#021314]" : "bg-[#29D8D5]/15 text-[#44F3F0]"
                                        }`}
                                    >
                                        <CheckOutlined className="text-[7px]" />
                                    </span>
                                    <span className={`leading-snug ${isNew ? "font-semibold" : ""}`}>
                                        {label}
                                        {isNew && (
                                            <span className="ml-2 inline-flex items-center rounded-full bg-[#29D8D5]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#44F3F0]">
                                                Nuevo
                                            </span>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>

                    {/* CTA — always flush to bottom */}
                    <div className="mt-6">
                        <button
                            type="button"
                            onClick={() => onPlanSelect?.(plan.key)}
                            className={`w-full rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${
                                plan.featured
                                    ? "bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                                    : "border border-white/12 bg-white/[0.03] text-white hover:border-[#29D8D5]/35 hover:bg-white/[0.06]"
                            }`}
                        >
                            {plan.cta}
                        </button>
                        {plan.note && (
                            <p className="mt-2 text-center text-[10px] text-[#4A5560]">{plan.note}</p>
                        )}
                    </div>
                </article>
            ))}
        </div>
    </ContentSection>
    );
};

export const PlusIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);

// ─────── Feature Hub Section ─────────────────────────────────────────────
export const FeatureHubSection = ({ heading }) => {
    const { t } = useI18n();
    const [ref, visible] = useScrollReveal();
    const [active, setActive] = useState(0);

    const features = [
        {
            title: t("landing.hub.features.teams.title"),
            label: t("landing.hub.features.teams.label"),
            description: t("landing.hub.features.teams.description"),
            highlights: [
                t("landing.hub.features.teams.highlights.one"),
                t("landing.hub.features.teams.highlights.two"),
                t("landing.hub.features.teams.highlights.three"),
            ],
            accent: "#22C55E",
            icon: (
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                    <circle cx="11" cy="10" r="4" />
                    <path d="M4 26c0-4.5 3.1-8 7-8s7 3.5 7 8" />
                    <circle cx="23" cy="9" r="3" />
                    <path d="M19 15.3c3.2 0.3 5.8 2.9 6.4 6.7" />
                    <circle cx="25" cy="24" r="3" fill="currentColor" stroke="none" opacity="0.9" />
                </svg>
            ),
        },
        {
            title: t("landing.hub.features.rbac.title"),
            label: t("landing.hub.features.rbac.label"),
            description: t("landing.hub.features.rbac.description"),
            highlights: [
                t("landing.hub.features.rbac.highlights.one"),
                t("landing.hub.features.rbac.highlights.two"),
                t("landing.hub.features.rbac.highlights.three"),
            ],
            accent: "#29D8D5",
            icon: (
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                    <circle cx="12" cy="10" r="4" />
                    <circle cx="22" cy="10" r="4" />
                    <path d="M4 26c0-4 3.6-7 8-7h4" />
                    <rect x="17" y="19" width="12" height="9" rx="2" />
                    <path d="M23 22v3" />
                    <circle cx="23" cy="21.5" r="0.8" fill="currentColor" stroke="none" />
                </svg>
            ),
        },
        {
            title: t("landing.hub.features.analytics.title"),
            label: t("landing.hub.features.analytics.label"),
            description: t("landing.hub.features.analytics.description"),
            highlights: [
                t("landing.hub.features.analytics.highlights.one"),
                t("landing.hub.features.analytics.highlights.two"),
                t("landing.hub.features.analytics.highlights.three"),
            ],
            accent: "#7C6AF7",
            icon: (
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                    <polyline points="4,24 10,16 15,20 21,10 28,14" />
                    <circle cx="28" cy="14" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="21" cy="10" r="1.5" fill="currentColor" stroke="none" />
                    <line x1="4" y1="28" x2="28" y2="28" />
                    <line x1="4" y1="10" x2="4" y2="28" />
                </svg>
            ),
        },
        {
            title: t("landing.hub.features.accounting.title"),
            label: t("landing.hub.features.accounting.label"),
            description: t("landing.hub.features.accounting.description"),
            highlights: [
                t("landing.hub.features.accounting.highlights.one"),
                t("landing.hub.features.accounting.highlights.two"),
                t("landing.hub.features.accounting.highlights.three"),
            ],
            accent: "#F97316",
            icon: (
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                    <rect x="6" y="4" width="20" height="24" rx="3" />
                    <rect x="9" y="7" width="14" height="5" rx="1" />
                    <circle cx="11" cy="17" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="16" cy="17" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="21" cy="17" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="11" cy="22" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="16" cy="22" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="21" cy="22" r="1.2" fill="currentColor" stroke="none" />
                </svg>
            ),
        },
        {
            title: t("landing.hub.features.locations.title"),
            label: t("landing.hub.features.locations.label"),
            description: t("landing.hub.features.locations.description"),
            highlights: [
                t("landing.hub.features.locations.highlights.one"),
                t("landing.hub.features.locations.highlights.two"),
                t("landing.hub.features.locations.highlights.three"),
            ],
            accent: "#3B82F6",
            icon: (
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                    <rect x="3" y="14" width="9" height="10" rx="1.5" />
                    <path d="M4 14l1.5-5h6L13 14" />
                    <rect x="20" y="10" width="9" height="14" rx="1.5" />
                    <path d="M21 10l1.5-5h6L30 10" />
                    <path d="M14 19h4" />
                    <path d="M16.5 16.5L19 19l-2.5 2.5" />
                </svg>
            ),
        },
    ];

    return (
        <ContentSection id="feature-hub">
            <div ref={ref} className="space-y-12">
                <SectionHeading
                    eyebrow={heading?.eyebrow || t("landing.hub.eyebrow")}
                    title={heading?.title || t("landing.hub.title")}
                    description={heading?.description || t("landing.hub.description")}
                />

                {/* Layout: selector izquierda + detalle derecha */}
                <div className={`grid grid-cols-1 gap-6 lg:grid-cols-5 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>

                    {/* Columna izquierda — tabs */}
                    <div className="flex flex-col gap-3 lg:col-span-2">
                        {features.map((f, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActive(idx)}
                                className="group relative flex items-center gap-4 rounded-xl px-5 py-4 text-left transition-all duration-300"
                                style={{
                                    background: active === idx
                                        ? "linear-gradient(90deg,rgba(41,216,213,0.08) 0%,rgba(41,216,213,0.02) 100%)"
                                        : "transparent",
                                    border: active === idx
                                        ? `1px solid ${f.accent}40`
                                        : "1px solid rgba(255,255,255,0.06)",
                                }}
                            >
                                {/* Acento lateral */}
                                <div
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full transition-all duration-300"
                                    style={{
                                        height: active === idx ? "60%" : "0%",
                                        background: f.accent,
                                    }}
                                />

                                {/* Ícono */}
                                <div
                                    className="shrink-0 rounded-lg p-2 transition-colors duration-300"
                                    style={{
                                        background: active === idx ? `${f.accent}18` : "rgba(255,255,255,0.04)",
                                        color: active === idx ? f.accent : "#6B7280",
                                    }}
                                >
                                    {f.icon}
                                </div>

                                {/* Texto */}
                                <div>
                                    <span
                                        className="block text-[10px] font-semibold tracking-widest mb-0.5 transition-colors duration-300"
                                        style={{ color: active === idx ? f.accent : "#4B5563" }}
                                    >
                                        {f.label}
                                    </span>
                                    <span
                                        className="block text-sm font-medium transition-colors duration-300"
                                        style={{ color: active === idx ? "#fff" : "#9CA3AF" }}
                                    >
                                        {f.title}
                                    </span>
                                </div>

                                {/* Flecha activa */}
                                {active === idx && (
                                    <svg viewBox="0 0 16 16" fill="none" stroke={f.accent} strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4 ml-auto shrink-0">
                                        <path d="M3 8h10M8 3l5 5-5 5" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Columna derecha — detalle animado */}
                    <div className="lg:col-span-3">
                        {features.map((f, idx) => (
                            <div
                                key={idx}
                                className="h-full rounded-2xl p-7 transition-all duration-500"
                                style={{
                                    display: active === idx ? "block" : "none",
                                    background: "linear-gradient(135deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.01) 100%)",
                                    border: `1px solid ${f.accent}25`,
                                    boxShadow: `0 0 40px ${f.accent}08`,
                                }}
                            >
                                {/* Badge label */}
                                <span
                                    className="inline-block rounded-full px-3 py-1 text-[10px] font-bold tracking-widest mb-4"
                                    style={{
                                        background: `${f.accent}15`,
                                        color: f.accent,
                                        border: `1px solid ${f.accent}30`,
                                    }}
                                >
                                    {f.label}
                                </span>

                                <h3 className="text-2xl font-semibold tracking-tight text-white mb-3">{f.title}</h3>
                                <p className="text-sm text-[#A9B3B8] leading-relaxed mb-6">{f.description}</p>

                                {/* Highlights como pills */}
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {f.highlights.map((h, i) => (
                                        <span
                                            key={i}
                                            className="rounded-full px-3 py-1.5 text-xs font-medium"
                                            style={{
                                                background: "rgba(255,255,255,0.05)",
                                                color: "#D1D5DB",
                                                border: "1px solid rgba(255,255,255,0.10)",
                                            }}
                                        >
                                            {h}
                                        </span>
                                    ))}
                                </div>

                                {/* Línea decorativa inferior con color del acento */}
                                <div
                                    className="h-px w-full rounded-full"
                                    style={{ background: `linear-gradient(90deg,${f.accent}50,transparent)` }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </ContentSection>
    );
};

// ─────── WhatsApp Support Button ─────────────────────────────────────────
export const WhatsAppSupportButton = ({
    phoneNumber = "+573142193936",
    message = "Hola, vi Ohnix y tengo preguntas 👋",
}) => {
    const { t } = useI18n();
    const [hovered, setHovered] = useState(false);
    const whatsappUrl = `https://wa.me/${phoneNumber.replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;

    return (
        <>
            {/* ── Desktop: tarjeta flotante personalizada ── */}
            <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("landing.support_widget.aria_label")}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className="fixed bottom-8 right-8 z-50 hidden sm:flex items-center gap-3 no-underline"
                style={{
                    background: hovered
                        ? "linear-gradient(135deg,#071f1f 0%,#0a2e2c 60%,#071a1a 100%)"
                        : "linear-gradient(135deg,#050f0f 0%,#071a1a 60%,#050b0b 100%)",
                    border: hovered
                        ? "1px solid rgba(41,216,213,0.55)"
                        : "1px solid rgba(41,216,213,0.22)",
                    borderRadius: "18px",
                    padding: "12px 18px 12px 14px",
                    boxShadow: hovered
                        ? "0 0 0 1px rgba(41,216,213,0.12), 0 12px 40px rgba(41,216,213,0.22), 0 4px 16px rgba(0,0,0,0.6)"
                        : "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(41,216,213,0.06)",
                    transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
                    transform: hovered ? "translateY(-2px)" : "translateY(0)",
                    backdropFilter: "blur(12px)",
                    textDecoration: "none",
                }}
            >
                {/* Icono tipo "burbuja de chat" custom con teal */}
                <div
                    className="relative shrink-0"
                    style={{
                        width: 40,
                        height: 40,
                    }}
                >
                    {/* Fondo del icono */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "12px",
                            background: hovered
                                ? "linear-gradient(135deg,#29D8D5 0%,#1ab8b5 100%)"
                                : "linear-gradient(135deg,rgba(41,216,213,0.18) 0%,rgba(26,184,181,0.10) 100%)",
                            border: "1px solid rgba(41,216,213,0.35)",
                            transition: "all 0.35s ease",
                        }}
                    />
                    {/* Burbuja de mensaje custom — icono Ohnix en vez de logo WA */}
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={hovered ? "#050f0f" : "#29D8D5"}
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            position: "absolute",
                            inset: "8px",
                            transition: "stroke 0.3s ease",
                        }}
                    >
                        {/* Burbuja de chat */}
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        {/* Puntos dentro */}
                        <circle cx="9" cy="10" r="0.7" fill={hovered ? "#050f0f" : "#29D8D5"} stroke="none" />
                        <circle cx="12" cy="10" r="0.7" fill={hovered ? "#050f0f" : "#29D8D5"} stroke="none" />
                        <circle cx="15" cy="10" r="0.7" fill={hovered ? "#050f0f" : "#29D8D5"} stroke="none" />
                    </svg>
                    {/* Dot verde vivo de "online" */}
                    <span
                        style={{
                            position: "absolute",
                            top: -3,
                            right: -3,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "#4ade80",
                            border: "2px solid #050f0f",
                            boxShadow: "0 0 6px rgba(74,222,128,0.6)",
                        }}
                    />
                </div>

                {/* Texto */}
                <div>
                    <p
                        style={{
                            margin: 0,
                            fontSize: "12px",
                            fontWeight: 600,
                            color: hovered ? "#29D8D5" : "#e5e7eb",
                            letterSpacing: "0.02em",
                            lineHeight: 1,
                            transition: "color 0.3s ease",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {t("landing.support_widget.cta_title")}
                    </p>
                    <p
                        style={{
                            margin: "3px 0 0",
                            fontSize: "10px",
                            color: "#6b7280",
                            whiteSpace: "nowrap",
                            lineHeight: 1,
                        }}
                    >
                        {t("landing.support_widget.cta_subtitle")}
                    </p>
                </div>

                {/* Flecha sutil */}
                <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke={hovered ? "#29D8D5" : "#374151"}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    style={{
                        width: 14,
                        height: 14,
                        marginLeft: 2,
                        transition: "all 0.3s ease",
                        transform: hovered ? "translateX(2px)" : "translateX(0)",
                    }}
                >
                    <path d="M3 8h10M8 3l5 5-5 5" />
                </svg>
            </a>

            {/* ── Mobile: barra inferior personalizada ──
                 Se ubica encima del MobileStickyCta (misma página, siempre juntos)
                 en vez de bottom-0, para no taparlo — antes ambas barras fijas
                 quedaban una sobre otra y el CTA "Crear cuenta gratis" quedaba
                 oculto e inalcanzable en mobile. */}
            <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="fixed left-0 right-0 z-50 flex sm:hidden items-center justify-between px-5 no-underline"
                style={{
                    bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
                    minHeight: 64,
                    background: "linear-gradient(90deg,#050f0f 0%,#071f1e 50%,#050f0f 100%)",
                    borderTop: "1px solid rgba(41,216,213,0.25)",
                    boxShadow: "0 -6px 32px rgba(41,216,213,0.10), 0 -1px 0 rgba(41,216,213,0.08)",
                    textDecoration: "none",
                }}
            >
                <div className="flex items-center gap-3">
                    {/* Icono burbuja mobile */}
                    <div
                        style={{
                            position: "relative",
                            width: 38,
                            height: 38,
                            borderRadius: "11px",
                            background: "linear-gradient(135deg,rgba(41,216,213,0.15) 0%,rgba(41,216,213,0.07) 100%)",
                            border: "1px solid rgba(41,216,213,0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#29D8D5"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ width: 18, height: 18 }}
                        >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            <circle cx="9" cy="10" r="0.8" fill="#29D8D5" stroke="none" />
                            <circle cx="12" cy="10" r="0.8" fill="#29D8D5" stroke="none" />
                            <circle cx="15" cy="10" r="0.8" fill="#29D8D5" stroke="none" />
                        </svg>
                        <span
                            style={{
                                position: "absolute",
                                top: -3,
                                right: -3,
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                background: "#4ade80",
                                border: "2px solid #050f0f",
                            }}
                        />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e5e7eb", lineHeight: 1 }}>
                            {t("landing.support_widget.cta_title")}
                        </p>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: "#6b7280", lineHeight: 1 }}>
                            {t("landing.support_widget.cta_subtitle")}
                        </p>
                    </div>
                </div>

                {/* CTA pill */}
                <div
                    style={{
                        borderRadius: 999,
                        padding: "8px 16px",
                        background: "linear-gradient(135deg,#29D8D5 0%,#1ab8b5 100%)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#050f0f",
                        letterSpacing: "0.03em",
                        whiteSpace: "nowrap",
                    }}
                >
                    Escribir →
                </div>
            </a>
        </>
    );
};

// ─────── Advanced Contact Section with Form ──────────────────────────────
export const ContactFormSection = ({ heading, primaryCta, contact }) => {
    const { t } = useI18n();
    const [ref, visible] = useScrollReveal();
    const [formData, setFormData] = useState({ name: "", email: "", phone: "", message: "", company: "" });
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage("");
        try {
            await api.post("/contact", formData);
            setSubmitted(true);
            trackContactFormConversion();
            trackContactFormLead();
            setFormData({ name: "", email: "", phone: "", message: "", company: "" });
            setTimeout(() => setSubmitted(false), 3000);
        } catch (error) {
            console.error("Error sending form:", error);
            setErrorMessage(error?.response?.data?.message || t("landing.contact_form.error"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <ContentSection id="contact" className={sectionShell}>
            <div ref={ref} className="space-y-12">
                <SectionHeading
                    eyebrow={heading?.eyebrow || t("landing.contact.eyebrow")}
                    title={heading?.title || t("landing.contact.title")}
                    description={heading?.description || t("landing.contact.description")}
                />

                <div className="grid grid-cols-1 gap-12 md:grid-cols-2 items-center">
                    {/* Formulario */}
                    <div className={`space-y-6 transition-all duration-500 ${visible ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0"}`}>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white mb-2">{t("landing.contact_form.name_label")}</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    placeholder={t("landing.contact_form.name_placeholder")}
                                    required
                                    className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/10 text-white placeholder-[#6B7280] focus:border-[#29D8D5] focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white mb-2">{t("landing.contact_form.email_label")}</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder={t("landing.contact_form.email_placeholder")}
                                    required
                                    className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/10 text-white placeholder-[#6B7280] focus:border-[#29D8D5] focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white mb-2">{t("landing.contact_form.phone_label")}</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    placeholder={t("landing.contact_form.phone_placeholder")}
                                    className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/10 text-white placeholder-[#6B7280] focus:border-[#29D8D5] focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white mb-2">{t("landing.contact_form.company_label")}</label>
                                <input
                                    type="text"
                                    name="company"
                                    value={formData.company}
                                    onChange={handleInputChange}
                                    placeholder={t("landing.contact_form.company_placeholder")}
                                    className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/10 text-white placeholder-[#6B7280] focus:border-[#29D8D5] focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-white mb-2">{t("landing.contact_form.message_label")}</label>
                                <textarea
                                    name="message"
                                    value={formData.message}
                                    onChange={handleInputChange}
                                    placeholder={t("landing.contact_form.message_placeholder")}
                                    rows="4"
                                    required
                                    className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/10 text-white placeholder-[#6B7280] focus:border-[#29D8D5] focus:outline-none transition-colors resize-none"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full px-6 py-3 rounded-full bg-[#29D8D5] text-[#021314] font-semibold hover:bg-[#44F3F0] disabled:opacity-50 transition-all duration-300"
                            >
                                {loading ? t("landing.contact_form.submitting") : t("landing.contact_form.submit")}
                            </button>
                            {submitted && <div className="text-[#29D8D5] text-sm text-center">{t("landing.contact_form.success")}</div>}
                            {errorMessage && <div className="text-red-400 text-sm text-center">{errorMessage}</div>}
                        </form>
                    </div>

                    {/* Información de contacto */}
                    <div className={`space-y-8 transition-all duration-500 ${visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}`}>
                        <div>
                            <h3 className="text-2xl font-semibold tracking-tight text-white mb-2">{t("landing.contact_form.questions_title")}</h3>
                            <p className="text-[#A9B3B8]">{t("landing.contact_form.questions_subtitle")}</p>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-lg bg-[#29D8D5]/12 flex items-center justify-center text-[#29D8D5]">
                                    <MailOutlined className="text-xl" />
                                </div>
                                <div>
                                    <p className="text-sm text-[#A9B3B8]">{t("landing.contact_form.email_channel_label")}</p>
                                    <a href="mailto:info@itcycle.com" className="text-white font-medium hover:text-[#29D8D5]">info@itcycle.com</a>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-lg bg-[#25D366]/12 flex items-center justify-center text-[#25D366]">
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-9.746 9.798c0 2.737.732 5.363 2.124 7.596l-.303 1.11 1.142-.312a9.86 9.86 0 007.277 3.028c5.434 0 9.937-4.479 9.937-10 0-2.67-.957-5.156-2.714-7.121-1.757-1.964-4.126-3.089-6.713-3.089z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm text-[#A9B3B8]">{t("landing.contact_form.whatsapp_channel_label")}</p>
                                    <a href="https://wa.me/573142193936" target="_blank" rel="noopener noreferrer" className="text-white font-medium hover:text-[#29D8D5]">+57 314 219 3936</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ContentSection>
    );
};

export const brandIcons = {
    lifecycle: <SyncOutlined />,
    assets: <DatabaseOutlined />,
    sustainability: <EnvironmentOutlined />,
    economy: <GlobalOutlined />,
    innovation: <ThunderboltOutlined />,
    observability: <LineChartOutlined />,
    identity: <TeamOutlined />,
    trust: <SafetyOutlined />,
    connect: <LinkOutlined />,
    api: <ApiOutlined />,
    adaptive: <RocketOutlined />,
    time: <ClockCircleOutlined />,
    action: <CheckCircleOutlined />,
    contact: <MailOutlined />,
    ideas: <QuestionCircleOutlined />,
    delight: <SmileOutlined />,
    facility: <ApartmentOutlined />,
    pricing: <CrownOutlined />,
    growth: <BoltOutlined />,
    accounting: <BookOutlined />,
    compliance: <SafetyCertificateOutlined />,
    assistant: <MessageOutlined />,
    live: <EyeOutlined />,
    trace: <AuditOutlined />,
};
