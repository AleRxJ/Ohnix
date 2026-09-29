import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AppstoreOutlined, BarChartOutlined, BookOutlined, ThunderboltFilled } from "@ant-design/icons";
import { Backdrop, Card, Chip, Headline, Vignette, useAppear } from "../ui.jsx";
import { C, GRAD, clamp, cop, fontFamily, pop, ramp } from "../theme.js";

const NODE = { x: 960, y: 370 };
const CARDS = [
    { x: 355, y: 580, arrive: 58 },
    { x: 960, y: 620, arrive: 66 },
    { x: 1565, y: 580, arrive: 74 },
];
const CARD_W = 560;

const Rolling = ({ from, to, at, format = (n) => n }) => {
    const frame = useCurrentFrame();
    const t = ramp(frame, at, at + 24);
    return <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(from + (to - from) * t)}</span>;
};

const CardHead = ({ Icon, title }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: C.accentSoft, color: C.accent, fontSize: 20 }}>
            <Icon />
        </span>
        <span style={{ fontSize: 24, fontWeight: 700 }}>{title}</span>
    </div>
);

const Inventory = ({ at }) => {
    const frame = useCurrentFrame();
    const items = [
        { n: "Café especial 500 g", from: 48, to: 46, max: 60 },
        { n: "Filtros x100", from: 130, to: 128, max: 160 },
    ];
    return (
        <>
            <CardHead Icon={AppstoreOutlined} title="Inventario" />
            {items.map((it) => {
                const v = it.from + (it.to - it.from) * ramp(frame, at, at + 24);
                return (
                    <div key={it.n} style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18 }}>
                            <span style={{ color: C.soft }}>{it.n}</span>
                            <span style={{ fontWeight: 700 }}>
                                <Rolling from={it.from} to={it.to} at={at} format={Math.round} /> uds
                            </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 9, background: "rgba(255,255,255,0.06)", marginTop: 8 }}>
                            <div style={{ height: 8, borderRadius: 9, width: `${(v / it.max) * 100}%`, background: GRAD }} />
                        </div>
                    </div>
                );
            })}
            <Chip tone="info" style={{ opacity: ramp(frame, at + 20, at + 30) }}>Kárdex actualizado</Chip>
        </>
    );
};

const Journal = ({ at }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const rows = [
        ["1105", "Caja general", 119000, 0],
        ["4135", "Comercio al por mayor y menor", 0, 100000],
        ["2408", "IVA por pagar", 0, 19000],
    ];
    return (
        <>
            <CardHead Icon={BookOutlined} title="Contabilidad" />
            <div style={{ display: "flex", fontSize: 13, color: C.dim, letterSpacing: "0.1em", paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ flex: 1 }}>CUENTA</span>
                <span style={{ width: 110, textAlign: "right" }}>DÉBITO</span>
                <span style={{ width: 110, textAlign: "right" }}>CRÉDITO</span>
            </div>
            {rows.map(([code, name, d, c], i) => {
                const p = pop(frame, fps, at + i * 6, { damping: 15, stiffness: 160 });
                return (
                    <div
                        key={code}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            fontSize: 16,
                            padding: "11px 0",
                            borderBottom: `1px solid ${C.line}`,
                            opacity: Math.min(1, p),
                            transform: `translateY(${(1 - p) * 14}px)`,
                        }}
                    >
                        <span style={{ flex: 1, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <b style={{ color: C.accent, marginRight: 8 }}>{code}</b>
                            {name}
                        </span>
                        <span style={{ width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d ? cop(d) : ""}</span>
                        <span style={{ width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c ? cop(c) : ""}</span>
                    </div>
                );
            })}
            <Chip tone="ok" style={{ marginTop: 16, opacity: ramp(frame, at + 24, at + 34) }}>Asiento automático · cuadrado</Chip>
        </>
    );
};

const Cash = ({ at }) => {
    const frame = useCurrentFrame();
    const bars = [0.42, 0.55, 0.48, 0.66, 0.58, 0.72];
    const grow = ramp(frame, at, at + 26);
    return (
        <>
            <CardHead Icon={BarChartOutlined} title="Caja y reportes" />
            <div style={{ fontSize: 16, color: C.muted }}>Ventas de hoy</div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>
                <Rolling from={2380000} to={2499000} at={at} format={cop} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 90, marginTop: 14 }}>
                {bars.map((b, i) => (
                    <div
                        key={i}
                        style={{
                            flex: 1,
                            borderRadius: 8,
                            height: `${(i === bars.length - 1 ? b + 0.26 * grow : b) * 100}%`,
                            background: i === bars.length - 1 ? GRAD : "rgba(255,255,255,0.09)",
                            boxShadow: i === bars.length - 1 ? `0 0 ${20 * grow}px rgba(41,216,213,0.6)` : "none",
                        }}
                    />
                ))}
            </div>
            <Chip tone="info" style={{ marginTop: 16, opacity: ramp(frame, at + 20, at + 30) }}>IVA listo para tu declaración</Chip>
        </>
    );
};

const BODIES = [Inventory, Journal, Cash];

export const Flow = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const node = pop(frame, fps, 10, { damping: 11, stiffness: 140 });
    const nodePulse = 1 + Math.max(0, Math.sin((frame - 34) / 3)) * (frame > 34 && frame < 44 ? 0.08 : 0);
    return (
        <AbsoluteFill style={{ fontFamily }}>
            <Backdrop hue={6} />
            <AbsoluteFill style={{ alignItems: "center", paddingTop: 90 }}>
                <Headline align="center" width={1500} size={68} delay={2} text="Una venta. *Todo* *se* *actualiza* *solo.*" />
            </AbsoluteFill>
            <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
                <defs>
                    <linearGradient id="wire" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.accent} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={C.accent} stopOpacity="0.15" />
                    </linearGradient>
                </defs>
                {CARDS.map((c, i) => {
                    const d = `M${NODE.x},${NODE.y + 40} C${NODE.x},${NODE.y + 140} ${c.x},${c.y - 140} ${c.x},${c.y}`;
                    const draw = ramp(frame, 30 + i * 4, 50 + i * 4);
                    const travel = interpolate(frame, [34 + i * 4, c.arrive], [0, 1], clamp);
                    // point along the cubic bezier for the pulse
                    const t = travel;
                    const bx = (1 - t) ** 3 * NODE.x + 3 * (1 - t) ** 2 * t * NODE.x + 3 * (1 - t) * t ** 2 * c.x + t ** 3 * c.x;
                    const by = (1 - t) ** 3 * (NODE.y + 40) + 3 * (1 - t) ** 2 * t * (NODE.y + 140) + 3 * (1 - t) * t ** 2 * (c.y - 140) + t ** 3 * c.y;
                    return (
                        <g key={i}>
                            <path d={d} fill="none" stroke="url(#wire)" strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} />
                            {frame >= 34 + i * 4 && frame <= c.arrive + 2 && (
                                <circle cx={bx} cy={by} r="10" fill={C.accent2} style={{ filter: `drop-shadow(0 0 14px ${C.accent}) drop-shadow(0 0 30px ${C.accent})` }} />
                            )}
                        </g>
                    );
                })}
            </svg>
            <div
                style={{
                    position: "absolute",
                    left: NODE.x,
                    top: NODE.y,
                    transform: `translate(-50%, -50%) scale(${node * nodePulse})`,
                    padding: "18px 30px",
                    borderRadius: 999,
                    background: GRAD,
                    color: "#021314",
                    fontSize: 26,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    boxShadow: "0 0 50px rgba(41,216,213,0.55)",
                    whiteSpace: "nowrap",
                }}
            >
                <ThunderboltFilled /> Venta FE-1043 · {cop(119000)}
            </div>
            {CARDS.map((c, i) => (
                <FlowCard key={i} c={c} i={i} Body={BODIES[i]} />
            ))}
            <Vignette />
        </AbsoluteFill>
    );
};

const FlowCard = ({ c, i, Body }) => {
    const frame = useCurrentFrame();
    const appear = useAppear(20 + i * 5, 40);
    const hit = interpolate(frame, [c.arrive, c.arrive + 4, c.arrive + 20], [0, 1, 0], clamp);
    return (
        <div style={{ position: "absolute", left: c.x - CARD_W / 2, top: c.y, width: CARD_W, ...appear }}>
            <Card glow={hit > 0.1} style={{ padding: 30, transform: `scale(${1 + hit * 0.03})` }}>
                <Body at={c.arrive} />
            </Card>
        </div>
    );
};
