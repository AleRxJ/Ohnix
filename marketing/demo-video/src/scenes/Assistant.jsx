import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ArrowRightOutlined, BellFilled, SendOutlined, StarFilled } from "@ant-design/icons";
import { AppFrame, Backdrop, Camera, Headline, Sub, Vignette, useAppear, useIsVertical } from "../ui.jsx";
import { C, GRAD, fontFamily, pop, ramp } from "../theme.js";

const QUESTION = "¿Cómo registro una compra a crédito?";
const Q_START = 52;
const Q_SENT = 88;
const A_START = 108;

const Bubble = ({ from = "bot", delay, children, style }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = pop(frame, fps, delay, { damping: 14, stiffness: 160 });
    if (frame < delay) return null;
    const me = from === "me";
    return (
        <div
            style={{
                alignSelf: me ? "flex-end" : "flex-start",
                maxWidth: "88%",
                padding: "16px 20px",
                borderRadius: 20,
                borderBottomRightRadius: me ? 6 : 20,
                borderBottomLeftRadius: me ? 20 : 6,
                background: me ? GRAD : "rgba(255,255,255,0.05)",
                border: me ? "none" : `1px solid ${C.line}`,
                color: me ? "#021314" : C.text,
                fontSize: 19,
                lineHeight: 1.45,
                fontWeight: me ? 700 : 500,
                opacity: Math.min(1, p),
                transform: `translateY(${(1 - p) * 24}px) scale(${0.94 + 0.06 * Math.min(1, p)})`,
                transformOrigin: me ? "bottom right" : "bottom left",
                ...style,
            }}
        >
            {children}
        </div>
    );
};

const Typing = ({ from, to }) => {
    const frame = useCurrentFrame();
    if (frame < from || frame >= to) return null;
    return (
        <div style={{ display: "flex", gap: 6, padding: "16px 20px", borderRadius: 20, background: "rgba(255,255,255,0.05)", alignSelf: "flex-start" }}>
            {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 9, height: 9, borderRadius: 9, background: C.accent, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - i * 4) / 4)) }} />
            ))}
        </div>
    );
};

const Panel = ({ width = 640, height = 860 }) => {
    const frame = useCurrentFrame();
    const typed = QUESTION.slice(0, Math.floor(ramp(frame, Q_START, Q_START + 30, (t) => t) * QUESTION.length));
    const steps = ["Abre Compras → Nueva compra.", "Elige el proveedor y agrega los productos.", "En forma de pago marca «A crédito» y la fecha de vencimiento."];
    const appear = useAppear(4, 60);
    return (
        <div
            style={{
                width,
                height,
                borderRadius: 30,
                border: `1px solid ${C.accentLine}`,
                background: "linear-gradient(180deg, #101415 0%, #0a0c0d 100%)",
                boxShadow: "0 50px 120px rgba(0,0,0,0.7), 0 0 90px rgba(41,216,213,0.18)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                fontFamily,
                color: C.text,
                ...appear,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 26px", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: GRAD, display: "grid", placeItems: "center", color: "#021314", fontSize: 22 }}>
                    <StarFilled />
                </div>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>Asistente Ohnix</div>
                    <div style={{ fontSize: 15, color: C.muted }}>Conoce cada pantalla y el estado de tu empresa</div>
                </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, padding: 24, justifyContent: "flex-end" }}>
                <Bubble delay={14} style={{ border: `1px solid rgba(245,165,36,0.4)`, background: "rgba(245,165,36,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.warn, fontWeight: 700, marginBottom: 6 }}>
                        <BellFilled /> Buenos días, Laura
                    </div>
                    La nómina de septiembre está calculada y espera tu aprobación. ¿Te llevo?
                </Bubble>
                <Bubble from="me" delay={Q_SENT}>
                    {QUESTION}
                </Bubble>
                <Typing from={Q_SENT + 6} to={A_START} />
                <Bubble delay={A_START}>
                    <div style={{ marginBottom: 10 }}>Así de fácil, en 3 pasos:</div>
                    {steps.map((s, i) => {
                        const on = frame >= A_START + 8 + i * 8;
                        return (
                            <div key={s} style={{ display: "flex", gap: 12, marginBottom: 8, opacity: on ? 1 : 0, transform: `translateX(${on ? 0 : 12}px)` }}>
                                <span
                                    style={{
                                        minWidth: 28,
                                        height: 28,
                                        borderRadius: 9,
                                        background: C.accentSoft,
                                        color: C.accent,
                                        display: "grid",
                                        placeItems: "center",
                                        fontWeight: 700,
                                        fontSize: 15,
                                    }}
                                >
                                    {i + 1}
                                </span>
                                <span>{s}</span>
                            </div>
                        );
                    })}
                    <div
                        style={{
                            marginTop: 12,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 18px",
                            borderRadius: 999,
                            background: GRAD,
                            color: "#021314",
                            fontWeight: 700,
                            opacity: ramp(frame, A_START + 34, A_START + 42),
                        }}
                    >
                        Llévame a Compras <ArrowRightOutlined />
                    </div>
                </Bubble>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 24px 24px", padding: "16px 18px", borderRadius: 16, border: `1px solid ${C.line2}` }}>
                <span style={{ flex: 1, fontSize: 18, color: frame >= Q_START && frame < Q_SENT ? C.text : C.dim }}>
                    {frame >= Q_START && frame < Q_SENT ? (
                        <>
                            {typed}
                            <span style={{ opacity: frame % 10 < 5 ? 1 : 0, color: C.accent }}>|</span>
                        </>
                    ) : (
                        "Escribe tu pregunta..."
                    )}
                </span>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: GRAD, color: "#021314", display: "grid", placeItems: "center" }}>
                    <SendOutlined />
                </span>
            </div>
        </div>
    );
};

export const Assistant = () => {
    const vertical = useIsVertical();
    if (vertical) return <AssistantVertical />;
    return (
    <AbsoluteFill>
        <Backdrop hue={10} />
        <Camera from={{ x: 280, y: 40, rx: 8, ry: -10, s: 0.66 }} to={{ x: 180, y: 0, rx: 4, ry: -8, s: 0.7 }} start={0} end={160}>
            <div style={{ filter: "blur(3px) brightness(0.45)" }}>
                <AppFrame group="money" activeItem="Nómina" title="Nómina" badges={{ money: 1 }}>
                    <div />
                </AppFrame>
            </div>
        </Camera>
        <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "center", paddingRight: 150 }}>
            <Panel />
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 110 }}>
            <Headline eyebrow="Asistente Ohnix" text="Un asistente que *conoce* *tu* *negocio.*" width={640} size={70} delay={8} />
            <Sub delay={36} width={560} style={{ marginTop: 26 }} text="Te avisa lo que necesita tu atención y te guía paso a paso hasta la pantalla correcta." />
        </AbsoluteFill>
        <Vignette />
    </AbsoluteFill>
    );
};

// 9:16: headline on top, the chat panel scaled up underneath so the bubbles read on a phone.
const AssistantVertical = () => (
    <AbsoluteFill>
        <Backdrop hue={10} />
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 590 }}>
            <div style={{ transform: "scale(1.35)", transformOrigin: "top center" }}>
                <Panel width={680} height={700} />
            </div>
        </AbsoluteFill>
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: "230px 80px 0" }}>
            <Headline eyebrow="Asistente Ohnix" text="Un asistente que *conoce* *tu* *negocio.*" width={920} size={80} delay={8} />
        </AbsoluteFill>
        <Vignette />
    </AbsoluteFill>
);
