import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    ArrowRightOutlined,
    ApiOutlined,
    ApartmentOutlined,
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
} from "@ant-design/icons";

const sectionShell =
    "relative overflow-hidden border-t border-white/5 bg-[#050505] text-white";

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

/* ── Video demo modal ───────────────────────────────────────────────── */
export const VideoModal = ({ isOpen, onClose, src, title }) => {
    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [isOpen]);

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
                    aria-label="Cerrar"
                >
                    <CloseOutlined />
                </button>

                <div className="overflow-hidden rounded-[28px] border border-[#29D8D5]/25 bg-[#090909] shadow-[0_0_0_1px_rgba(41,216,213,0.08),0_48px_120px_rgba(0,0,0,0.85)]">
                    <div className="aspect-video bg-[#090909]">
                        {embedSrc ? (
                            <iframe
                                title={title || "Demo Ohnix"}
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
                                    <p className="text-lg font-semibold text-white">Demo próximamente</p>
                                    <p className="mt-2 text-sm text-[#A9B3B8]">Estamos preparando el video de demo. Contáctanos para una demostración en vivo.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ── Horizontal marquee ticker ──────────────────────────────────────── */
export const MarqueeStrip = ({ items }) => {
    const doubled = [...items, ...items];
    return (
        <div className="relative overflow-hidden border-y border-white/[0.04] bg-[#030303] py-4 select-none">
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

export const SectionHeading = ({ eyebrow, title, description, align = "center" }) => {
    const [ref, visible] = useScrollReveal(0.1);
    const alignment = align === "left" ? "items-start text-left" : "items-center text-center";

    return (
        <div
            ref={ref}
            className={`flex flex-col gap-4 ${alignment} transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
            {eyebrow ? (
                <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#29D8D5] shadow-[0_0_0_1px_rgba(41,216,213,0.08)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_18px_rgba(41,216,213,0.85)]" />
                    {eyebrow}
                </span>
            ) : null}
            <div className="max-w-4xl">
                <h2 className="text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.05] bg-gradient-to-br from-white via-[#E8EDEE] to-[#29D8D5]/55 bg-clip-text text-transparent">
                    {title}
                </h2>
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
    footerNote = "Traceability on every movement",
    productImage = "/Ohnix_FullLogo.svg",
    productImageAlt = "Ohnix inventory dashboard",
}) => {
    const [pointer, setPointer] = useState({ x: 50, y: 40 });

    return (
        <section
            id="home"
            className="relative overflow-hidden border-b border-white/5 bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.12),transparent_24%),radial-gradient(circle_at_20%_20%,rgba(68,243,240,0.08),transparent_24%),linear-gradient(180deg,#070707_0%,#050505_36%,#050505_100%)]"
            onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                setPointer({ x, y });
            }}
        >
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]" />
            <div
                className="pointer-events-none absolute inset-0 opacity-70 transition-transform duration-300"
                style={{
                    transform: `translate3d(${(pointer.x - 50) * 0.14}px, ${(pointer.y - 50) * 0.14}px, 0)`,
                }}
            >
                <div className="absolute left-[10%] top-[8%] h-40 w-40 rounded-full border border-[#29D8D5]/10 blur-[1px]" />
                <div className="absolute right-[6%] top-[12%] h-56 w-56 rounded-full border border-white/10" />
                <div className="absolute bottom-[10%] left-[28%] h-24 w-24 rounded-full border border-[#44F3F0]/10" />
                <div className="absolute right-[20%] bottom-[18%] h-64 w-64 rounded-full border border-white/[0.06]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-28 md:px-10 md:pb-28 lg:pt-32">
                {/* ── Mobile-only ambient blobs ───────────────────────────────── */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden md:hidden" aria-hidden="true">
                    <div className="absolute -left-24 top-24 h-80 w-80 rounded-full bg-[#29D8D5]/8 blur-[90px] animate-blob-float" />
                    <div className="absolute -right-16 top-1/3 h-64 w-64 rounded-full bg-[#44F3F0]/6 blur-[70px] animate-blob-float-alt" />
                    <div className="absolute bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#29D8D5]/5 blur-[55px] animate-float-slow" />
                </div>

                <div className="grid items-center gap-14 lg:grid-cols-[1.03fr_0.97fr] lg:gap-20">
                    <div className="relative z-10">
                        {/* ── Eyebrow with live pulse dot ─── */}
                        <div className="animate-fade-up inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-[#29D8D5]">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-[#29D8D5] opacity-70 animate-ping" />
                                <span className="relative h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_16px_rgba(41,216,213,0.9)]" />
                            </span>
                            {eyebrow}
                        </div>

                        <h1
                            className="mt-7 max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-7xl md:leading-[0.94] animate-fade-up"
                            style={{ animationDelay: "0.1s" }}
                        >
                            {title}
                        </h1>

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
                            <button
                                type="button"
                                onClick={onSecondary}
                                className="group inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-[#29D8D5]/40 hover:bg-white/[0.06]"
                            >
                                <PlayCircleOutlined className="text-[#29D8D5] transition-transform duration-300 group-hover:scale-110" />
                                {secondaryCta}
                            </button>
                        </div>

                        <div
                            className="mt-12 grid gap-4 sm:grid-cols-3 animate-fade-up"
                            style={{ animationDelay: "0.4s" }}
                        >
                            {stats.map((stat, i) => (
                                <div
                                    key={stat.label}
                                    className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-5 backdrop-blur-sm transition-all duration-300 hover:border-[#29D8D5]/30 hover:bg-white/[0.05]"
                                    style={{ animationDelay: `${0.45 + i * 0.08}s` }}
                                >
                                    <div className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                                        {stat.value}
                                    </div>
                                    <div className="mt-2 text-sm text-[#A9B3B8]">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-[620px] animate-fade-up" style={{ animationDelay: "0.2s" }}>
                        <div className="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle_at_center,rgba(41,216,213,0.2),transparent_62%)] blur-2xl" />

                        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)] transition-transform duration-300 hover:-translate-y-1 animate-float">
                            <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#0a0a0a]">
                                <img
                                    src={productImage}
                                    alt={productImageAlt}
                                    className="block w-full select-none"
                                />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            {orbitLabels.map((label, i) => (
                                <span
                                    key={label}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0B0B0B]/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#A9B3B8] backdrop-blur-sm animate-fade-in"
                                    style={{ animationDelay: `${0.6 + i * 0.15}s` }}
                                >
                                    <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_12px_rgba(68,243,240,0.85)] animate-pulse" />
                                    {label}
                                </span>
                            ))}
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-3 rounded-full border border-white/10 bg-[#0B0B0B]/90 px-5 py-3 text-xs uppercase tracking-[0.22em] text-[#A9B3B8] backdrop-blur-md">
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
        <div className={`relative mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28 animate-fade-up ${className}`}>
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
                    <h3 className="text-xl font-semibold text-white">{mission.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{mission.description}</p>
                </article>

                <article className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#A9B3B8]">
                        {vision.label}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{vision.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{vision.description}</p>
                </article>

                <div className="md:col-span-2 rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <h3 className="text-xl font-semibold text-white">{valuesTitle}</h3>
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
                    <h3 className="mt-6 text-xl font-semibold text-white">{step.title}</h3>
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
            <button
                type="button"
                onClick={onSecondary}
                className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-white transition-all active:scale-95 hover:border-[#29D8D5]/30"
            >
                {secondaryCta}
            </button>
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

export const TestimonialsSection = ({ heading, testimonials }) => (
    <ContentSection id="stories">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
                <article
                    key={testimonial.name}
                    className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/30"
                >
                    <div className="text-3xl leading-none text-[#29D8D5]">“</div>
                    <p className="mt-4 text-sm leading-7 text-[#D4DBDF]">{testimonial.content}</p>
                    <div className="mt-8 border-t border-white/8 pt-5">
                        <div className="text-sm font-semibold text-white">{testimonial.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-[#A9B3B8]">{testimonial.role}</div>
                    </div>
                </article>
            ))}
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
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-white marker:hidden">
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

export const PricingSection = ({ heading, plans, featuredLabel, onPlanSelect }) => {
    const [ref, visible] = useScrollReveal(0.06);
    return (
    <ContentSection id="pricing">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div ref={ref} className="mt-14 grid gap-5 lg:grid-cols-3">
            {plans.map((plan, i) => (
                <article
                    key={plan.name}
                    className={`relative overflow-hidden rounded-[32px] border p-7 transition-all duration-500 hover:-translate-y-2 ${
                        plan.featured
                            ? "border-[#29D8D5]/40 bg-[linear-gradient(180deg,rgba(41,216,213,0.12),rgba(255,255,255,0.03))] shadow-[0_0_0_1px_rgba(41,216,213,0.08),0_18px_50px_rgba(0,0,0,0.38)]"
                            : "border-white/8 bg-white/[0.03]"
                    } ${visible ? "animate-reveal-up" : "opacity-0"}`}
                    style={{ animationDelay: `${i * 0.1}s` }}
                >
                    {/* Shimmer sweep on featured card */}
                    {plan.featured && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[32px]">
                            <div className="absolute top-0 h-full w-[45%] -skew-x-12 bg-gradient-to-r from-transparent via-[#29D8D5]/6 to-transparent animate-sweep" />
                        </div>
                    )}
                    {plan.featured ? (
                        <div className="absolute right-5 top-5 z-10 rounded-full border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#44F3F0]">
                            {featuredLabel}
                        </div>
                    ) : null}

                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#44F3F0]">
                            {plan.icon}
                        </div>
                        <div>
                            <h3 className="text-2xl font-semibold text-white">{plan.name}</h3>
                            <p className="text-sm text-[#A9B3B8]">{plan.subtitle}</p>
                        </div>
                    </div>

                    <div className="mt-6 flex items-end gap-2">
                        <span className="text-5xl font-semibold tracking-tight text-white">{plan.price}</span>
                        <span className="pb-1 text-sm text-[#A9B3B8]">{plan.billing}</span>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-[#D4DBDF]">{plan.description}</p>

                    <ul className="mt-6 space-y-3">
                        {plan.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-3 text-sm text-[#D4DBDF]">
                                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#29D8D5]/12 text-[#44F3F0]">
                                    <CheckOutlined className="text-[10px]" />
                                </span>
                                <span>{feature}</span>
                            </li>
                        ))}
                    </ul>

                    <button
                        type="button"
                        onClick={() => onPlanSelect?.(plan.key)}
                        className={`mt-7 w-full rounded-full px-5 py-3 text-sm font-semibold transition-all duration-300 ${
                            plan.featured
                                ? "bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                                : "border border-white/12 bg-white/[0.03] text-white hover:border-[#29D8D5]/35 hover:bg-white/[0.06]"
                        }`}
                    >
                        {plan.cta}
                    </button>
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
};
