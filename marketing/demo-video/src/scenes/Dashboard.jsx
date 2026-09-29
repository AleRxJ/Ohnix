import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { AppFrame, Backdrop, Camera, Card, Chip, Headline, Sheen, V_CAMERA, V_FRAME, V_HEADLINE_BOX, Vignette, useAppear, useIsVertical, Sfx, SfxTrain } from "../ui.jsx";
import { C, GRAD, cop, pop, rand, ramp } from "../theme.js";

const KPIS = [
    { label: "Ventas del mes", value: 48750000, delta: "+12% vs agosto", tone: "ok" },
    { label: "Utilidad bruta", value: 17240000, delta: "Margen 35%", tone: "info" },
    { label: "Valor del inventario", value: 49934468, delta: "412 referencias", tone: "info" },
    { label: "Por cobrar", value: 4230000, delta: "3 vencen esta semana", tone: "warn" },
];

const ATTENTION = [
    { tone: "alert", text: "2 agotados", where: "Productos" },
    { tone: "warn", text: "5 con stock bajo", where: "Productos" },
    { tone: "info", text: "3 esperando respuesta", where: "Cotizaciones" },
    { tone: "warn", text: "1 por aprobar", where: "Nómina" },
];

// 30 days of sales with a believable upward drift.
const SERIES = Array.from({ length: 30 }, (_, i) => 0.35 + i * 0.016 + (rand(i + 4) - 0.5) * 0.22);

const Kpi = ({ k, i, basis = 1 }) => {
    const frame = useCurrentFrame();
    const style = useAppear(28 + i * 5);
    const t = ramp(frame, 32 + i * 5, 80 + i * 5);
    return (
        <Card style={{ flex: basis, padding: "22px 24px", position: "relative", overflow: "hidden", ...style }}>
            <div style={{ fontSize: 16, color: C.muted, fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 36, fontWeight: 700, marginTop: 12, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {cop(k.value * t)}
            </div>
            <div style={{ marginTop: 14 }}>
                <Chip tone={k.tone}>{k.delta}</Chip>
            </div>
            <Sheen at={70 + i * 6} />
        </Card>
    );
};

const Chart = ({ W = 700, H = 330 }) => {
    const frame = useCurrentFrame();
    const pts = SERIES.map((v, i) => [(i / (SERIES.length - 1)) * W, H - v * H * 0.9]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const draw = ramp(frame, 50, 110);
    const len = 1400;
    const last = pts[Math.min(pts.length - 1, Math.floor(draw * (pts.length - 1)))];
    return (
        <svg width={W} height={H + 10} style={{ overflow: "visible" }}>
            <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.accent} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
                </linearGradient>
                <clipPath id="reveal">
                    <rect x="0" y="-20" width={W * draw} height={H + 40} />
                </clipPath>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.06)" />
            ))}
            <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#area)" clipPath="url(#reveal)" />
            <path
                d={d}
                fill="none"
                stroke={C.accent}
                strokeWidth="4"
                strokeLinejoin="round"
                strokeDasharray={len}
                strokeDashoffset={len * (1 - draw)}
                style={{ filter: `drop-shadow(0 0 8px ${C.accent})` }}
            />
            {draw > 0.02 && <circle cx={last[0]} cy={last[1]} r="8" fill={C.accent2} style={{ filter: `drop-shadow(0 0 10px ${C.accent})` }} />}
        </svg>
    );
};

// vertical: KPIs in a 2x2 grid and the cards stacked, sized to V_FRAME.
const DashboardContent = ({ vertical = false }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const head = useAppear(18);
    const chartCard = useAppear(44);
    const attn = useAppear(52);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22, height: "100%" }}>
            <div style={head}>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>Buenos días, Laura</div>
                <div style={{ fontSize: 17, color: C.muted, marginTop: 4 }}>Así va tu negocio hoy · lunes, 28 de septiembre</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                {KPIS.map((k, i) => (
                    <Kpi key={k.label} k={k} i={i} basis={vertical ? "1 1 calc(50% - 9px)" : 1} />
                ))}
            </div>
            <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: 18, flex: 1 }}>
                <Card style={{ flex: vertical ? "none" : 1.7, padding: 26, ...chartCard }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Ventas · últimos 30 días</div>
                        <Chip tone="ok">▲ 12%</Chip>
                    </div>
                    {vertical ? <Chart W={780} H={150} /> : <Chart />}
                </Card>
                <Card style={{ flex: 1, padding: 26, ...attn }}>
                    <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 18 }}>Necesita tu atención</div>
                    {(vertical ? ATTENTION.slice(0, 3) : ATTENTION).map((a, i, list) => {
                        const p = pop(frame, fps, 64 + i * 7, { damping: 14, stiffness: 150 });
                        return (
                            <div
                                key={a.text}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "14px 0",
                                    borderBottom: i < list.length - 1 ? `1px solid ${C.line}` : "none",
                                    opacity: Math.min(1, p),
                                    transform: `translateX(${(1 - p) * 40}px)`,
                                }}
                            >
                                <span style={{ fontSize: 17, color: C.soft }}>{a.where}</span>
                                <Chip tone={a.tone}>{a.text}</Chip>
                            </div>
                        );
                    })}
                    {!vertical && (
                        <div
                            style={{
                                marginTop: 22,
                                padding: "12px 16px",
                                borderRadius: 14,
                                background: GRAD,
                                color: "#021314",
                                fontWeight: 700,
                                fontSize: 16,
                                textAlign: "center",
                                opacity: ramp(frame, 96, 110),
                            }}
                        >
                            Ver todo lo pendiente
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export const Dashboard = () => {
    const vertical = useIsVertical();
    const cam = vertical ? V_CAMERA : { from: { x: 420, y: 260, rx: 28, ry: -22, s: 0.7 }, to: { x: 300, y: 10, rx: 6, ry: -14, s: 0.74 } };
    return (
        <AbsoluteFill>
            <Backdrop />
            <Sfx at={2} name="whoosh" volume={0.5} />
            <SfxTrain frames={[30, 35, 40, 45]} name="pop" volume={0.25} />
            <SfxTrain frames={vertical ? [64, 71, 78] : [64, 71, 78, 85]} name="blip" volume={0.2} />
            <Camera {...cam} start={0} end={70}>
                <AppFrame group="home" title="Panel de Control" badges={{ inventory: 2 }} {...(vertical && V_FRAME)}>
                    <DashboardContent vertical={vertical} />
                </AppFrame>
            </Camera>
            <AbsoluteFill style={vertical ? V_HEADLINE_BOX : { justifyContent: "center", paddingLeft: 110 }}>
                <Headline
                    eyebrow="Panel de control"
                    text="Tu negocio, *de* *un* *vistazo.*"
                    width={vertical ? 920 : 520}
                    size={vertical ? 84 : 74}
                    delay={10}
                />
            </AbsoluteFill>
            <Vignette />
        </AbsoluteFill>
    );
};
