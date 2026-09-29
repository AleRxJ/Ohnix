import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
    AppstoreOutlined,
    BankOutlined,
    BarChartOutlined,
    BookOutlined,
    BuildOutlined,
    CloudSyncOutlined,
    FileDoneOutlined,
    FileProtectOutlined,
    FileTextOutlined,
    FundOutlined,
    LockOutlined,
    SafetyOutlined,
    ShoppingCartOutlined,
    ShoppingOutlined,
    StarFilled,
    TeamOutlined,
} from "@ant-design/icons";
import { Backdrop, Headline, Vignette } from "../ui.jsx";
import { C, GRAD, clamp, fontFamily, pop } from "../theme.js";

const MODULES = [
    [AppstoreOutlined, "Inventario y kárdex"],
    [ShoppingCartOutlined, "Punto de venta"],
    [FileDoneOutlined, "Facturación DIAN"],
    [FileTextOutlined, "Cotizaciones y pedidos"],
    [ShoppingOutlined, "Compras y proveedores"],
    [FileProtectOutlined, "Documentos soporte"],
    [BookOutlined, "Contabilidad"],
    [BankOutlined, "Conciliación bancaria"],
    [TeamOutlined, "Nómina"],
    [BuildOutlined, "Producción"],
    [SafetyOutlined, "Garantías"],
    [FundOutlined, "Presupuestos"],
    [BarChartOutlined, "Reportes y exógena"],
    [CloudSyncOutlined, "Modo sin conexión"],
    [LockOutlined, "Roles y permisos"],
    [StarFilled, "Asistente Ohnix"],
];

export const Modules = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return (
        <AbsoluteFill style={{ fontFamily }}>
            <Backdrop hue={12} />
            <AbsoluteFill style={{ alignItems: "center", paddingTop: 110 }}>
                <Headline align="center" width={1500} size={70} delay={0} text="Y todo lo que tu pyme *necesita.*" />
            </AbsoluteFill>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 130, perspective: 1800 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 405px)", gap: 20 }}>
                    {MODULES.map(([Icon, label], i) => {
                        const col = i % 4;
                        const row = Math.floor(i / 4);
                        const delay = 10 + (col + row) * 4;
                        const p = pop(frame, fps, delay, { damping: 14, stiffness: 130 });
                        const lit = interpolate(frame, [delay + 10, delay + 16, delay + 34], [0, 1, 0], clamp);
                        return (
                            <div
                                key={label}
                                style={{
                                    height: 110,
                                    borderRadius: 20,
                                    border: `1px solid ${lit > 0.2 ? C.accentLine : C.line}`,
                                    background: `linear-gradient(135deg, rgba(41,216,213,${0.04 + lit * 0.14}) 0%, rgba(255,255,255,0.02) 100%)`,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 18,
                                    padding: "0 24px",
                                    color: C.text,
                                    fontSize: 23,
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    opacity: Math.min(1, p),
                                    transform: `rotateX(${(1 - p) * -70}deg) translateY(${(1 - p) * 60}px)`,
                                    boxShadow: lit > 0.2 ? "0 0 40px rgba(41,216,213,0.25)" : "none",
                                }}
                            >
                                <span
                                    style={{
                                        width: 54,
                                        height: 54,
                                        borderRadius: 16,
                                        display: "grid",
                                        placeItems: "center",
                                        fontSize: 26,
                                        background: lit > 0.2 ? GRAD : C.accentSoft,
                                        color: lit > 0.2 ? "#021314" : C.accent,
                                    }}
                                >
                                    <Icon />
                                </span>
                                {label}
                            </div>
                        );
                    })}
                </div>
            </AbsoluteFill>
            <Vignette />
        </AbsoluteFill>
    );
};

export const EndCard = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const logo = pop(frame, fps, 0, { damping: 13, stiffness: 100 });
    const cta = pop(frame, fps, 44, { damping: 12, stiffness: 140 });
    const pulse = 0.5 + 0.5 * Math.sin(frame / 8);
    return (
        <AbsoluteFill style={{ fontFamily }}>
            <Backdrop hue={14} />
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                <div style={{ mixBlendMode: "screen", transform: `scale(${0.7 + logo * 0.3})`, opacity: Math.min(1, logo), marginTop: -60 }}>
                    <Img src={staticFile("ohnix-logo-full.png")} style={{ width: 420, height: 420, display: "block" }} />
                </div>
                <Headline
                    align="center"
                    width={1500}
                    size={62}
                    delay={16}
                    text="Inventario, ventas y contabilidad de tu pyme, | *en* *un* *solo* *lugar.*"
                />
                <div
                    style={{
                        marginTop: 44,
                        padding: "20px 40px",
                        borderRadius: 999,
                        background: GRAD,
                        color: "#021314",
                        fontSize: 30,
                        fontWeight: 700,
                        transform: `scale(${cta})`,
                        boxShadow: `0 0 ${40 + pulse * 40}px rgba(41,216,213,${0.35 + pulse * 0.25})`,
                    }}
                >
                    Empieza hoy en ohnix.co
                </div>
            </AbsoluteFill>
            <Vignette />
        </AbsoluteFill>
    );
};
