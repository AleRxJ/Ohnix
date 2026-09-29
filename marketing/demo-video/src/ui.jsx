import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
    AppstoreOutlined,
    HomeOutlined,
    SearchOutlined,
    ShoppingCartOutlined,
    ShoppingOutlined,
    WalletOutlined,
    WifiOutlined,
} from "@ant-design/icons";
import { C, GRAD, clamp, fontFamily, pop, rand, ramp } from "./theme.js";

/* ---------- Backdrop: drifting grid, glows, dust ---------- */
export const Backdrop = ({ hue = 0, intensity = 1 }) => {
    const frame = useCurrentFrame();
    const drift = frame * 0.35;
    return (
        <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
            <AbsoluteFill
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
                    backgroundSize: "64px 64px",
                    backgroundPosition: `${drift}px ${drift * 0.6}px`,
                    maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 85%)",
                    WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 85%)",
                }}
            />
            <div
                style={{
                    position: "absolute",
                    width: 1400,
                    height: 1400,
                    left: -300 + Math.sin(frame / 90 + hue) * 120,
                    top: -700 + Math.cos(frame / 110) * 80,
                    background: "radial-gradient(circle, rgba(41,216,213,0.20) 0%, transparent 60%)",
                    opacity: intensity,
                }}
            />
            <div
                style={{
                    position: "absolute",
                    width: 1200,
                    height: 1200,
                    right: -400 + Math.cos(frame / 100 + hue) * 100,
                    bottom: -700,
                    background: "radial-gradient(circle, rgba(68,243,240,0.12) 0%, transparent 60%)",
                    opacity: intensity,
                }}
            />
            {Array.from({ length: 40 }).map((_, i) => {
                const x = rand(i + 1) * 1920;
                const y = (rand(i + 50) * 1080 - frame * (0.2 + rand(i + 9) * 0.6)) % 1080;
                return (
                    <div
                        key={i}
                        style={{
                            position: "absolute",
                            left: x,
                            top: y < 0 ? y + 1080 : y,
                            width: 2 + rand(i + 3) * 2,
                            height: 2 + rand(i + 3) * 2,
                            borderRadius: 9,
                            background: C.accent,
                            opacity: 0.15 + rand(i + 7) * 0.35,
                            boxShadow: `0 0 8px ${C.accent}`,
                        }}
                    />
                );
            })}
        </AbsoluteFill>
    );
};

/* ---------- Vignette + subtle scanline sheen over everything ---------- */
export const Vignette = () => (
    <AbsoluteFill
        style={{
            pointerEvents: "none",
            background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)",
        }}
    />
);

/* ---------- Kinetic headline. Wrap words in *stars* for the accent gradient; a lone "|" breaks the line. ---------- */
export const Headline = ({ eyebrow, text, delay = 0, size = 76, align = "left", width = 760, style }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const words = text.split(" ");
    const eb = pop(frame, fps, delay, { damping: 200 });
    return (
        <div style={{ width, textAlign: align, fontFamily, ...style }}>
            {eyebrow && (
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 22,
                        padding: "8px 16px",
                        borderRadius: 999,
                        border: `1px solid ${C.accentLine}`,
                        background: C.accentSoft,
                        color: C.accent,
                        fontSize: 18,
                        fontWeight: 700,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        opacity: eb,
                        transform: `translateY(${(1 - eb) * 16}px)`,
                    }}
                >
                    <span style={{ width: 8, height: 8, borderRadius: 9, background: C.accent, boxShadow: `0 0 12px ${C.accent}` }} />
                    {eyebrow}
                </div>
            )}
            <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.035em", color: C.text }}>
                {words.map((w, i) => {
                    if (w === "|") return <br key={i} />;
                    const accent = w.startsWith("*");
                    const clean = w.replace(/\*/g, "");
                    const p = pop(frame, fps, delay + 4 + i * 3, { damping: 18, stiffness: 120 });
                    return (
                        <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.22em", marginBottom: "-0.2em" }}>
                            <span
                                style={{
                                    display: "inline-block",
                                    transform: `translateY(${(1 - p) * 110}%)`,
                                    filter: `blur(${(1 - Math.min(p, 1)) * 10}px)`,
                                    opacity: Math.min(1, p * 1.4),
                                    ...(accent
                                        ? { backgroundImage: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
                                        : null),
                                }}
                            >
                                {clean}
                            </span>
                            {i < words.length - 1 ? " " : ""}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

/* ---------- Glass card ---------- */
export const Card = ({ children, style, glow = false }) => (
    <div
        style={{
            borderRadius: 22,
            border: `1px solid ${glow ? C.accentLine : C.line}`,
            background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)",
            boxShadow: glow ? `0 0 0 1px rgba(41,216,213,0.15), 0 20px 60px rgba(41,216,213,0.18)` : "0 20px 50px rgba(0,0,0,0.35)",
            fontFamily,
            color: C.text,
            ...style,
        }}
    >
        {children}
    </div>
);

export const Chip = ({ tone = "info", children, style }) => {
    const map = {
        info: [C.accent, "rgba(41,216,213,0.14)"],
        warn: [C.warn, "rgba(245,165,36,0.14)"],
        alert: [C.alert, "rgba(251,113,133,0.14)"],
        ok: [C.ok, "rgba(52,211,153,0.14)"],
    };
    const [fg, bg] = map[tone];
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: bg,
                color: fg,
                fontSize: 15,
                fontWeight: 700,
                fontFamily,
                whiteSpace: "nowrap",
                ...style,
            }}
        >
            {children}
        </span>
    );
};

/* ---------- The app shell: rail + contextual panel + topbar (mirrors DashboardSidebar/DashboardHeader) ---------- */
const GROUPS = [
    { key: "home", label: "Inicio", Icon: HomeOutlined, desc: "Tu negocio de un vistazo", items: ["Panel de Control"] },
    { key: "sell", label: "Ventas", Icon: ShoppingCartOutlined, desc: "Cotiza, vende y cuida a tus clientes", items: ["Punto de venta", "Cotizaciones", "Pedidos", "Clientes"] },
    { key: "inventory", label: "Inventario", Icon: AppstoreOutlined, desc: "Lo que tienes, fabricas y garantizas", items: ["Productos", "Categorías", "Producción", "Garantías"] },
    { key: "buy", label: "Compras", Icon: ShoppingOutlined, desc: "Proveedores y reabastecimiento", items: ["Compras", "Documentos soporte", "Proveedores"] },
    { key: "money", label: "Dinero", Icon: WalletOutlined, desc: "Caja, nómina, contabilidad y DIAN", items: ["Finanzas", "Contabilidad", "Nómina"] },
];

export const AppFrame = ({ group = "home", activeItem, title, children, width = 1560, height = 900, online = true, style, badges = {} }) => {
    const current = GROUPS.find((g) => g.key === group);
    return (
        <div
            style={{
                width,
                height,
                borderRadius: 30,
                border: `1px solid ${C.line2}`,
                background: C.panel,
                boxShadow: "0 60px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(41,216,213,0.08), 0 0 120px rgba(41,216,213,0.10)",
                overflow: "hidden",
                display: "flex",
                fontFamily,
                color: C.text,
                ...style,
            }}
        >
            {/* rail */}
            <div
                style={{
                    width: 92,
                    borderRight: `1px solid ${C.line}`,
                    background: "linear-gradient(180deg, rgba(41,216,213,0.07) 0%, transparent 40%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 14,
                    paddingTop: 18,
                }}
            >
                <Img src={staticFile("ohnix-mark.png")} style={{ width: 54, height: 54, marginBottom: 10 }} />
                {GROUPS.map((g) => {
                    const active = g.key === group;
                    return (
                        <div key={g.key} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <div
                                style={{
                                    width: 50,
                                    height: 40,
                                    borderRadius: 13,
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 20,
                                    background: active ? GRAD : "transparent",
                                    color: active ? "#021314" : C.dim,
                                    boxShadow: active ? "0 8px 20px rgba(41,216,213,0.35)" : "none",
                                }}
                            >
                                <g.Icon />
                            </div>
                            {badges[g.key] ? (
                                <span
                                    style={{
                                        position: "absolute",
                                        top: -4,
                                        right: -4,
                                        minWidth: 20,
                                        height: 20,
                                        borderRadius: 99,
                                        background: C.alert,
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        display: "grid",
                                        placeItems: "center",
                                        padding: "0 5px",
                                    }}
                                >
                                    {badges[g.key]}
                                </span>
                            ) : null}
                            <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? C.text : C.dim }}>{g.label}</span>
                        </div>
                    );
                })}
            </div>
            {/* contextual panel */}
            <div style={{ width: 250, borderRight: `1px solid ${C.line}`, padding: "26px 18px" }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{current.label}</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 1.35 }}>{current.desc}</div>
                <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                    {current.items.map((it) => {
                        const on = it === (activeItem || current.items[0]);
                        return (
                            <div
                                key={it}
                                style={{
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    fontSize: 16,
                                    fontWeight: on ? 700 : 500,
                                    color: on ? C.text : C.muted,
                                    background: on ? C.accentSoft : "transparent",
                                    border: `1px solid ${on ? C.accentLine : "transparent"}`,
                                }}
                            >
                                {it}
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* main */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                    style={{
                        height: 74,
                        borderBottom: `1px solid ${C.line}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "0 28px",
                    }}
                >
                    <div style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{title}</div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: 300,
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${C.line}`,
                            color: C.dim,
                            fontSize: 15,
                        }}
                    >
                        <SearchOutlined /> <span style={{ flex: 1 }}>Ir a un módulo…</span>
                        <span style={{ fontSize: 12, border: `1px solid ${C.line2}`, borderRadius: 6, padding: "2px 6px" }}>Ctrl K</span>
                    </div>
                    <Chip tone={online ? "ok" : "warn"}>
                        <WifiOutlined /> {online ? "En línea" : "Sin conexión"}
                    </Chip>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 99,
                            background: GRAD,
                            color: "#021314",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 700,
                        }}
                    >
                        LM
                    </div>
                </div>
                <div style={{ flex: 1, position: "relative", padding: 28, minHeight: 0 }}>{children}</div>
            </div>
        </div>
    );
};

/* ---------- 3D camera move for the app shell ---------- */
export const Camera = ({ children, from, to, start = 0, end = 60, style }) => {
    const frame = useCurrentFrame();
    const t = ramp(frame, start, end);
    const v = (k) => from[k] + (to[k] - from[k]) * t;
    return (
        <AbsoluteFill style={{ perspective: 2400, alignItems: "center", justifyContent: "center", ...style }}>
            <div
                style={{
                    transformStyle: "preserve-3d",
                    transform: `translate(${v("x")}px, ${v("y")}px) rotateX(${v("rx")}deg) rotateY(${v("ry")}deg) rotateZ(${v("rz") || 0}deg) scale(${v("s")})`,
                }}
            >
                {children}
            </div>
        </AbsoluteFill>
    );
};

/* ---------- Mouse cursor that travels through keyframes and clicks ---------- */
export const Cursor = ({ path, clicks = [] }) => {
    const frame = useCurrentFrame();
    const frames = path.map((p) => p.f);
    const x = interpolate(frame, frames, path.map((p) => p.x), { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
    const y = interpolate(frame, frames, path.map((p) => p.y), { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
    const pressing = clicks.some((c) => frame >= c && frame < c + 6);
    const ripple = clicks.map((c) => frame - c).find((d) => d >= 0 && d < 20);
    return (
        <div style={{ position: "absolute", left: x, top: y, zIndex: 50, pointerEvents: "none" }}>
            {ripple !== undefined && (
                <div
                    style={{
                        position: "absolute",
                        left: -30,
                        top: -30,
                        width: 60,
                        height: 60,
                        borderRadius: 99,
                        border: `3px solid ${C.accent}`,
                        transform: `scale(${0.3 + ripple / 12})`,
                        opacity: 1 - ripple / 20,
                    }}
                />
            )}
            <svg width="34" height="34" viewBox="0 0 24 24" style={{ transform: `scale(${pressing ? 0.85 : 1})`, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }}>
                <path d="M4 2l16 9.5-7 1.5-3.5 7L4 2z" fill="#fff" stroke="#021314" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
        </div>
    );
};

/* ---------- Light sweep across an element ---------- */
export const Sheen = ({ at, dur = 24 }) => {
    const frame = useCurrentFrame();
    const t = interpolate(frame, [at, at + dur], [-40, 140], clamp);
    if (frame < at || frame > at + dur) return null;
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background: `linear-gradient(105deg, transparent ${t - 20}%, rgba(255,255,255,0.14) ${t}%, transparent ${t + 20}%)`,
            }}
        />
    );
};

export const useAppear = (delay, from = 30) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = pop(frame, fps, delay, { damping: 16, stiffness: 120 });
    return { opacity: Math.min(1, p * 1.3), transform: `translateY(${(1 - p) * from}px)` };
};

export const Sub = ({ text, delay = 0, width, style }) => {
    const appear = useAppear(delay, 16);
    return <div style={{ fontFamily, fontSize: 28, lineHeight: 1.4, color: C.muted, width, ...appear, ...style }}>{text}</div>;
};
