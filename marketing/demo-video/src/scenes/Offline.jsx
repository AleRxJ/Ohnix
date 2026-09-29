import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CheckCircleFilled, ClockCircleOutlined, CloudSyncOutlined, DisconnectOutlined } from "@ant-design/icons";
import { AppFrame, Backdrop, Camera, Card, Chip, Headline, Sub, V_CAMERA, V_HEADLINE_BOX, Vignette, useIsVertical } from "../ui.jsx";
import { C, clamp, cop, pop, ramp } from "../theme.js";

const CUT = 30;
const BACK = 122;
const SALES = [
    { n: "Venta #1044", v: 54000, at: 48 },
    { n: "Venta #1045", v: 187000, at: 70 },
    { n: "Venta #1046", v: 36000, at: 92 },
];

const OfflineContent = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const offline = frame >= CUT && frame < BACK;
    const banner = pop(frame, fps, CUT + 2, { damping: 15, stiffness: 150 });
    const bannerOut = ramp(frame, BACK, BACK + 10);
    const queued = SALES.filter((s) => frame >= s.at).length;
    const synced = frame >= BACK + 26;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "18px 22px",
                    borderRadius: 16,
                    background: synced ? "rgba(52,211,153,0.12)" : "rgba(245,165,36,0.12)",
                    border: `1px solid ${synced ? "rgba(52,211,153,0.4)" : "rgba(245,165,36,0.4)"}`,
                    color: synced ? C.ok : C.warn,
                    fontSize: 20,
                    fontWeight: 700,
                    opacity: frame < BACK ? Math.min(1, banner) : synced ? 1 : 1 - bannerOut,
                    transform: `translateY(${(1 - Math.min(1, banner)) * -30}px)`,
                }}
            >
                {synced ? <CheckCircleFilled /> : <DisconnectOutlined />}
                <span style={{ flex: 1 }}>
                    {synced ? "De vuelta en línea: todo quedó sincronizado." : "Estás sin conexión. Sigue trabajando, guardamos todo en este equipo."}
                </span>
            </div>
            <Card style={{ padding: 28, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 700 }}>
                        <CloudSyncOutlined style={{ color: C.accent, transform: `rotate(${frame >= BACK && !synced ? frame * 10 : 0}deg)` }} />
                        Cola de sincronización
                    </div>
                    <Chip tone={synced ? "ok" : queued ? "warn" : "info"}>{synced ? "Todo sincronizado" : `${queued} pendiente${queued === 1 ? "" : "s"}`}</Chip>
                </div>
                {SALES.map((s, i) => {
                    if (frame < s.at) return null;
                    const p = pop(frame, fps, s.at, { damping: 13, stiffness: 170 });
                    const doneAt = BACK + 8 + i * 6;
                    const done = frame >= doneAt;
                    const tick = pop(frame, fps, doneAt, { damping: 9, stiffness: 220 });
                    return (
                        <div
                            key={s.n}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                                padding: "18px 20px",
                                marginBottom: 12,
                                borderRadius: 14,
                                border: `1px solid ${done ? "rgba(52,211,153,0.35)" : C.line}`,
                                background: done ? "rgba(52,211,153,0.07)" : "rgba(255,255,255,0.02)",
                                opacity: Math.min(1, p),
                                transform: `translateY(${(1 - p) * -50}px) scale(${0.9 + 0.1 * Math.min(1, p)})`,
                                fontSize: 19,
                            }}
                        >
                            {done ? (
                                <CheckCircleFilled style={{ color: C.ok, fontSize: 24, transform: `scale(${tick})` }} />
                            ) : (
                                <ClockCircleOutlined style={{ color: C.warn, fontSize: 24 }} />
                            )}
                            <span style={{ fontWeight: 700 }}>{s.n}</span>
                            <span style={{ color: C.muted, flex: 1 }}>{done ? "Sincronizada con la nube" : "Guardada en este equipo"}</span>
                            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{cop(s.v)}</span>
                        </div>
                    );
                })}
                {offline && queued === 0 && <div style={{ color: C.dim, fontSize: 18, marginTop: 20 }}>Las ventas que registres aparecerán aquí…</div>}
            </Card>
        </div>
    );
};

export const Offline = () => {
    const frame = useCurrentFrame();
    const offline = frame >= CUT && frame < BACK;
    const glitch = (frame >= CUT && frame < CUT + 6) || (frame >= BACK && frame < BACK + 4);
    const dim = interpolate(frame, [CUT, CUT + 10, BACK, BACK + 10], [0, 1, 1, 0], clamp);
    const greenFlash = interpolate(frame, [BACK, BACK + 3, BACK + 18], [0, 0.22, 0], clamp);
    const vertical = useIsVertical();
    const cam = vertical ? V_CAMERA : { from: { x: 330, y: 40, rx: 10, ry: -20, s: 0.7 }, to: { x: 300, y: 0, rx: 4, ry: -12, s: 0.74 } };
    return (
        <AbsoluteFill>
            <Backdrop hue={8} intensity={1 - dim * 0.7} />
            <Camera {...cam} start={0} end={60}>
                <div style={{ filter: `saturate(${1 - dim * 0.5})`, transform: glitch ? `translateX(${frame % 2 ? 14 : -14}px)` : "none" }}>
                    <AppFrame group="sell" activeItem="Punto de venta" title="Punto de venta" online={!offline}>
                        <OfflineContent />
                    </AppFrame>
                </div>
            </Camera>
            <AbsoluteFill style={vertical ? V_HEADLINE_BOX : { justifyContent: "center", paddingLeft: 110 }}>
                <Headline
                    eyebrow="Modo sin conexión"
                    text="¿Se fue el internet? *Sigue* *vendiendo.*"
                    width={vertical ? 920 : 560}
                    size={vertical ? 80 : 70}
                    delay={6}
                />
                {!vertical && (
                    <Sub delay={40} width={520} style={{ marginTop: 26 }} text="Ohnix guarda cada venta en el equipo y la sincroniza sola cuando vuelve la señal." />
                )}
            </AbsoluteFill>
            {glitch && <AbsoluteFill style={{ background: offline ? "rgba(245,165,36,0.12)" : "rgba(52,211,153,0.12)" }} />}
            <AbsoluteFill style={{ background: C.ok, opacity: greenFlash, mixBlendMode: "screen" }} />
            <Vignette />
        </AbsoluteFill>
    );
};
