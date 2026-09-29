import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CheckOutlined, LoadingOutlined, SafetyCertificateFilled } from "@ant-design/icons";
import { Backdrop, Camera, Card, Headline, Sub, Vignette, useIsVertical } from "../ui.jsx";
import { C, GRAD, clamp, cop, fontFamily, pop, rand, ramp } from "../theme.js";

const CUFE = Array.from({ length: 96 }, (_, i) => "0123456789abcdef"[Math.floor(rand(i + 311) * 16)]).join("");

const Qr = ({ size = 150, reveal }) => {
    const n = 25;
    const cell = size / n;
    const finder = (x, y) => {
        const inBox = (ox, oy) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
        for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
            if (inBox(ox, oy)) {
                const dx = x - ox;
                const dy = y - oy;
                return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
            }
        }
        return -1;
    };
    const rects = [];
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
            const f = finder(x, y);
            const on = f === -1 ? rand(x * 31 + y * 7) > 0.52 : f === 1;
            const order = (x + y) / (2 * n);
            if (on && order <= reveal) rects.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell + 0.3} height={cell + 0.3} fill="#e9fdfd" />);
        }
    return (
        <svg width={size} height={size} style={{ borderRadius: 10, background: "rgba(255,255,255,0.04)", padding: 8, boxSizing: "content-box" }}>
            {rects}
        </svg>
    );
};

const STEPS = [
    { label: "Firmada digitalmente", short: "Firmada", at: 40 },
    { label: "Enviada a la DIAN", short: "Enviada", at: 70 },
    { label: "Validada", short: "Validada", at: 104 },
];

// `row` = compact single line for the 9:16 cut.
const Stepper = ({ row = false }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return (
        <div style={{ display: "flex", flexDirection: row ? "row" : "column", gap: row ? 28 : 18, marginTop: row ? 34 : 44 }}>
            {STEPS.map((s, i) => {
                const started = frame >= s.at - 22;
                const done = frame >= s.at;
                const p = pop(frame, fps, s.at - 22, { damping: 15, stiffness: 150 });
                const check = pop(frame, fps, s.at, { damping: 10, stiffness: 200 });
                return (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 18, opacity: started ? Math.min(1, p) : 0.25, fontFamily }}>
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 99,
                                display: "grid",
                                placeItems: "center",
                                fontSize: 20,
                                background: done ? (i === 2 ? C.ok : GRAD) : "rgba(255,255,255,0.06)",
                                color: done ? "#021314" : C.accent,
                                border: done ? "none" : `1px solid ${C.accentLine}`,
                                boxShadow: done ? `0 0 24px ${i === 2 ? "rgba(52,211,153,0.6)" : "rgba(41,216,213,0.5)"}` : "none",
                            }}
                        >
                            {done ? <CheckOutlined style={{ transform: `scale(${check})` }} /> : started ? <LoadingOutlined spin={false} style={{ transform: `rotate(${frame * 12}deg)` }} /> : null}
                        </div>
                        <span style={{ fontSize: row ? 30 : 28, fontWeight: 700, color: done ? C.text : C.muted }}>{row ? s.short : s.label}</span>
                    </div>
                );
            })}
        </div>
    );
};

const Invoice = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const typed = Math.floor(ramp(frame, 30, 76, (t) => t) * CUFE.length);
    const stamp = pop(frame, fps, 108, { damping: 9, stiffness: 180, mass: 0.9 });
    const shake = frame >= 110 && frame < 122 ? Math.sin(frame * 3) * (122 - frame) * 0.8 : 0;
    const row = (l, r, strong) => (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 24 : 18, fontWeight: strong ? 700 : 500, color: strong ? C.text : C.muted, padding: "5px 0" }}>
            <span>{l}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: strong ? C.text : C.soft }}>{r}</span>
        </div>
    );
    return (
        <div style={{ position: "relative", transform: `translate(${shake}px, ${shake * 0.4}px)` }}>
            <Card glow={frame > 104} style={{ width: 640, padding: 36, background: "linear-gradient(180deg, #111516 0%, #0b0d0e 100%)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ fontSize: 14, letterSpacing: "0.2em", color: C.accent, fontWeight: 700 }}>FACTURA ELECTRÓNICA DE VENTA</div>
                        <div style={{ fontSize: 44, fontWeight: 700, marginTop: 8, letterSpacing: "-0.02em" }}>FE-1043</div>
                        <div style={{ fontSize: 16, color: C.muted, marginTop: 4 }}>28 sep 2026 · 10:42 a. m.</div>
                    </div>
                    <Qr size={130} reveal={ramp(frame, 70, 100, (t) => t)} />
                </div>
                <div style={{ height: 1, background: C.line, margin: "24px 0" }} />
                <div style={{ fontSize: 15, color: C.dim, textTransform: "uppercase", letterSpacing: "0.12em" }}>Adquiriente</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>Distribuidora Andina S.A.S.</div>
                <div style={{ fontSize: 16, color: C.muted }}>NIT 901.234.567-8</div>
                <div style={{ height: 1, background: C.line, margin: "22px 0 12px" }} />
                {row("2 × Café especial 500 g", cop(76000))}
                {row("2 × Filtros x100", cop(24000))}
                {row("IVA 19%", cop(19000))}
                <div style={{ height: 1, background: C.line, margin: "12px 0" }} />
                {row("Total", cop(119000), true)}
                <div style={{ marginTop: 22, fontSize: 13, color: C.dim, letterSpacing: "0.12em" }}>CUFE</div>
                <div style={{ marginTop: 6, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 15, color: C.accent, wordBreak: "break-all", lineHeight: 1.45, minHeight: 66 }}>
                    {CUFE.slice(0, typed)}
                    {typed < CUFE.length && frame >= 30 ? <span style={{ opacity: frame % 10 < 5 ? 1 : 0 }}>▌</span> : null}
                </div>
            </Card>
            {frame >= 108 && (
                <div
                    style={{
                        position: "absolute",
                        right: -70,
                        bottom: -34,
                        transform: `rotate(-12deg) scale(${interpolate(stamp, [0, 1], [2.6, 1])})`,
                        opacity: Math.min(1, stamp * 2),
                        padding: "16px 28px",
                        borderRadius: 18,
                        border: `4px solid ${C.ok}`,
                        color: C.ok,
                        background: "rgba(5,20,14,0.85)",
                        fontFamily,
                        fontSize: 34,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        boxShadow: "0 0 60px rgba(52,211,153,0.45)",
                    }}
                >
                    <SafetyCertificateFilled /> ACEPTADA · DIAN
                </div>
            )}
        </div>
    );
};

export const Dian = () => {
    const frame = useCurrentFrame();
    const flash = interpolate(frame, [108, 111, 126], [0, 0.35, 0], clamp);
    const vertical = useIsVertical();
    const cam = vertical
        ? { from: { x: 0, y: 560, rx: 30, ry: -20, s: 0.75 }, to: { x: 0, y: 150, rx: 4, ry: -4, s: 1.2 } }
        : { from: { x: 420, y: 120, rx: 30, ry: -30, s: 0.8 }, to: { x: 400, y: 0, rx: 4, ry: -10, s: 1 } };
    return (
        <AbsoluteFill>
            <Backdrop hue={4} />
            <Camera {...cam} start={0} end={50}>
                <Invoice />
            </Camera>
            <AbsoluteFill
                style={vertical ? { justifyContent: "flex-start", padding: "230px 80px 0" } : { justifyContent: "center", paddingLeft: 130 }}
            >
                <Headline
                    eyebrow="Facturación electrónica"
                    text="Emitida, firmada y *validada* *por* *la* *DIAN.*"
                    width={vertical ? 920 : 760}
                    size={vertical ? 76 : 72}
                    delay={6}
                />
                <Stepper row={vertical} />
                {!vertical && (
                    <Sub delay={112} width={640} style={{ marginTop: 36, fontSize: 24 }} text="Con nuestro propio motor de facturación, sin salir de Ohnix." />
                )}
            </AbsoluteFill>
            <AbsoluteFill style={{ background: C.ok, opacity: flash, mixBlendMode: "screen" }} />
            <Vignette />
        </AbsoluteFill>
    );
};
