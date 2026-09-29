import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Headline, Vignette, useIsVertical, Sfx, SfxTrain } from "../ui.jsx";
import { C, clamp, fontFamily, pop, rand, ramp } from "../theme.js";

const TOOLS = [
    { t: "Excel de inventario", x: 250, y: 190 },
    { t: "Cuaderno de ventas", x: 1390, y: 170 },
    { t: "Facturador aparte", x: 180, y: 820 },
    { t: "WhatsApp con el contador", x: 1300, y: 850 },
    { t: "Stock \"a ojo\"", x: 1560, y: 380 },
    { t: "Otro Excel de cartera", x: 90, y: 650 },
    { t: "Software contable", x: 760, y: 110 },
    { t: "Nómina en papel", x: 820, y: 930 },
];

// 9:16 layout: chips ring the headline, kept out of the Reels/TikTok UI bands.
const TOOLS_V = [
    { x: 80, y: 300 },
    { x: 560, y: 380 },
    { x: 120, y: 560 },
    { x: 600, y: 1300 },
    { x: 640, y: 620 },
    { x: 60, y: 1220 },
    { x: 150, y: 1420 },
    { x: 560, y: 1500 },
];

// 0–150: the tools a pyme juggles float and jitter, then get sucked into one point.
export const Intro = () => {
    const frame = useCurrentFrame();
    const { fps, width: W, height: H } = useVideoConfig();
    const vertical = useIsVertical();
    const collapse = ramp(frame, 118, 140, (t) => t * t * t);
    const dot = interpolate(frame, [128, 140, 150], [0, 1, 1.6], clamp);
    return (
        <AbsoluteFill>
            <Backdrop intensity={0.5} />
            <SfxTrain frames={[4, 9, 14, 19, 24, 29, 34, 39]} name="pop" volume={0.35} />
            <Sfx at={96} name="riser" volume={0.7} />
            <Sfx at={116} name="whoosh" volume={0.6} />
            <Sfx at={130} name="impact" volume={0.5} />
            {TOOLS.map((tool, i) => {
                const p = pop(frame, fps, 4 + i * 5, { damping: 12, stiffness: 160 });
                const jitterX = Math.sin(frame / 7 + i) * 6 + (rand(i + frame * 0.01) - 0.5) * 2;
                const jitterY = Math.cos(frame / 9 + i * 2) * 6;
                const pos = vertical ? TOOLS_V[i] : tool;
                const x = pos.x + (W / 2 - pos.x - 150) * collapse;
                const y = pos.y + (H / 2 - pos.y - 30) * collapse;
                const glitch = frame % (23 + i) < 2 && frame < 112;
                return (
                    <div
                        key={tool.t}
                        style={{
                            position: "absolute",
                            left: x + jitterX + (glitch ? 12 : 0),
                            top: y + jitterY,
                            transform: `scale(${p * (1 - collapse)}) rotate(${(rand(i) - 0.5) * 10 * (1 - collapse)}deg)`,
                            padding: "16px 24px",
                            borderRadius: 16,
                            border: `1px solid ${glitch ? C.alert : "rgba(255,255,255,0.14)"}`,
                            background: "rgba(20,20,22,0.85)",
                            color: glitch ? C.alert : C.muted,
                            fontFamily,
                            fontSize: 26,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            opacity: 1 - collapse * 0.5,
                            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                        }}
                    >
                        {tool.t}
                    </div>
                );
            })}
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - ramp(frame, 112, 122) }}>
                <Headline
                    align="center"
                    width={vertical ? 940 : 1300}
                    size={vertical ? 96 : 88}
                    delay={24}
                    text="Tu negocio no debería vivir en *ocho* herramientas."
                />
            </AbsoluteFill>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                <div
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 99,
                        background: C.accent,
                        transform: `scale(${dot})`,
                        boxShadow: `0 0 60px 20px ${C.accent}, 0 0 200px 60px rgba(41,216,213,0.5)`,
                        opacity: dot > 0 ? 1 : 0,
                    }}
                />
            </AbsoluteFill>
            <Vignette />
        </AbsoluteFill>
    );
};

// 0–100: flash from the dot, logo lands with a shockwave, tagline under it.
export const LogoReveal = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const flash = interpolate(frame, [0, 3, 18], [0.9, 0.9, 0], clamp);
    const logo = pop(frame, fps, 2, { damping: 11, stiffness: 90 });
    const ring = interpolate(frame, [0, 40], [0, 1], clamp);
    const vertical = useIsVertical();
    return (
        <AbsoluteFill>
            <Backdrop intensity={1} />
            <Sfx at={0} name="impact" volume={0.9} />
            <Sfx at={30} name="chime" volume={0.35} />
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                {[0, 8].map((d) => {
                    const r = interpolate(frame - d, [0, 40], [0, 1], clamp);
                    return (
                        <div
                            key={d}
                            style={{
                                position: "absolute",
                                width: 1600,
                                height: 1600,
                                borderRadius: 9999,
                                border: `2px solid ${C.accent}`,
                                transform: `scale(${r})`,
                                opacity: (1 - r) * 0.8,
                            }}
                        />
                    );
                })}
                <div
                    style={{
                        position: "absolute",
                        width: 900,
                        height: 900,
                        borderRadius: 9999,
                        background: "radial-gradient(circle, rgba(41,216,213,0.28) 0%, transparent 60%)",
                        transform: `translateY(${vertical ? -220 : -80}px) scale(${0.7 + ring * 0.3})`,
                        opacity: logo,
                    }}
                />
                {/* The PNG has a solid black background; screen-blending drops it onto the backdrop. */}
                <div
                    style={{
                        transform: `scale(${0.6 + logo * 0.4}) translateY(${vertical ? -180 : -40}px)`,
                        opacity: Math.min(1, logo),
                        mixBlendMode: "screen",
                    }}
                >
                    <Img src={staticFile("ohnix-logo-full.png")} style={{ width: 640, height: 640, display: "block" }} />
                </div>
                <div style={{ position: "absolute", bottom: vertical ? 520 : 150 }}>
                    <Headline align="center" width={vertical ? 940 : 1400} size={vertical ? 72 : 56} delay={26} text="Todo tu negocio. *Un* *solo* *lugar.*" />
                </div>
            </AbsoluteFill>
            <AbsoluteFill style={{ background: "#e9ffff", opacity: flash, mixBlendMode: "screen" }} />
            <Vignette />
        </AbsoluteFill>
    );
};
