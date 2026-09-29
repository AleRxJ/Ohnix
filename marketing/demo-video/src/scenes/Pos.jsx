import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CheckCircleFilled, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { AppFrame, Backdrop, Camera, Card, Chip, Cursor, Headline, Sub, V_CAMERA, V_HEADLINE_BOX, Vignette, useAppear, useIsVertical } from "../ui.jsx";
import { C, GRAD, cop, pop, ramp } from "../theme.js";

export const PRODUCTS = [
    { name: "Café especial 500 g", price: 38000, stock: 48, hue: 28 },
    { name: "Termo acero 1 L", price: 65000, stock: 21, hue: 200 },
    { name: "Molino manual", price: 89000, stock: 9, hue: 280 },
    { name: "Filtros x100", price: 12000, stock: 130, hue: 160 },
    { name: "Taza cerámica", price: 18000, stock: 64, hue: 340 },
    { name: "Prensa francesa", price: 74000, stock: 4, hue: 50 },
];

// Clicks: café ×2, filtros ×2, then Cobrar. Subtotal 100.000 + IVA 19% = 119.000 (reused by the next scenes).
const CLICKS = { cafe: [46, 60], filtros: [88, 101], pay: [134] };
const CARD_W = 222;
const CARD_H = 232;
const cardCenter = (i) => ({ x: (i % 3) * (CARD_W + 18) + CARD_W / 2, y: 70 + Math.floor(i / 3) * (CARD_H + 18) + CARD_H / 2 });

const ProductCard = ({ p, i, pressedAt }) => {
    const frame = useCurrentFrame();
    const appear = useAppear(14 + i * 4, 24);
    const press = pressedAt.some((c) => frame >= c && frame < c + 7);
    const flash = pressedAt.some((c) => frame >= c && frame < c + 16);
    return (
        <Card
            glow={flash}
            style={{
                width: CARD_W,
                height: CARD_H,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                ...appear,
                transform: `${appear.transform} scale(${press ? 0.95 : 1})`,
            }}
        >
            <div
                style={{
                    height: 110,
                    borderRadius: 14,
                    background: `radial-gradient(circle at 30% 30%, hsla(${p.hue},80%,65%,0.55), hsla(${p.hue},70%,30%,0.25) 60%, rgba(255,255,255,0.03))`,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 44,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.85)",
                }}
            >
                {p.name[0]}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 14, lineHeight: 1.2 }}>{p.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{cop(p.price)}</span>
                <span style={{ fontSize: 13, color: p.stock < 10 ? C.warn : C.dim }}>{p.stock} uds</span>
            </div>
        </Card>
    );
};

const CartLine = ({ name, qty, price, since }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = pop(frame, fps, since, { damping: 14, stiffness: 170 });
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 0",
                borderBottom: `1px solid ${C.line}`,
                opacity: Math.min(1, p),
                transform: `translateX(${(1 - p) * 60}px)`,
            }}
        >
            <span
                style={{
                    minWidth: 34,
                    height: 34,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    background: C.accentSoft,
                    color: C.accent,
                    fontWeight: 700,
                }}
            >
                {qty}
            </span>
            <span style={{ flex: 1, fontSize: 17 }}>{name}</span>
            <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{cop(qty * price)}</span>
        </div>
    );
};

const PosContent = () => {
    const frame = useCurrentFrame();
    const count = (arr) => arr.filter((c) => frame >= c).length;
    const cafe = count(CLICKS.cafe);
    const filtros = count(CLICKS.filtros);
    const subtotal = cafe * 38000 + filtros * 12000;
    const iva = subtotal * 0.19;
    const paid = frame >= CLICKS.pay[0] + 8;
    const cart = useAppear(20, 20);
    const c0 = cardCenter(0);
    const c3 = cardCenter(3);
    const payAt = { x: 952, y: 712 };
    return (
        <div style={{ position: "relative", height: "100%", display: "flex", gap: 22 }}>
            <div style={{ width: 3 * CARD_W + 36 }}>
                <div
                    style={{
                        height: 50,
                        borderRadius: 14,
                        border: `1px solid ${C.line}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "0 16px",
                        color: C.dim,
                        fontSize: 16,
                        marginBottom: 20,
                    }}
                >
                    <SearchOutlined /> Busca o escanea un código de barras
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                    {PRODUCTS.map((p, i) => (
                        <ProductCard key={p.name} p={p} i={i} pressedAt={i === 0 ? CLICKS.cafe : i === 3 ? CLICKS.filtros : []} />
                    ))}
                </div>
            </div>
            <Card style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", ...cart }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>Venta actual</div>
                    <Chip tone="info">Factura electrónica</Chip>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.muted, fontSize: 15, marginTop: 12 }}>
                    <UserOutlined /> Distribuidora Andina S.A.S. · NIT 901.234.567-8
                </div>
                <div style={{ marginTop: 10, flex: 1 }}>
                    {cafe > 0 && <CartLine name="Café especial 500 g" qty={cafe} price={38000} since={CLICKS.cafe[0]} />}
                    {filtros > 0 && <CartLine name="Filtros x100" qty={filtros} price={12000} since={CLICKS.filtros[0]} />}
                    {!cafe && <div style={{ color: C.dim, fontSize: 16, marginTop: 30, textAlign: "center" }}>Agrega productos para empezar</div>}
                </div>
                {[
                    ["Subtotal", subtotal],
                    ["IVA 19%", iva],
                ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 17, color: C.muted, marginBottom: 8 }}>
                        <span>{l}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{cop(v)}</span>
                    </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0 18px" }}>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>Total</span>
                    <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{cop(subtotal + iva)}</span>
                </div>
                <div
                    style={{
                        height: 64,
                        borderRadius: 16,
                        background: paid ? C.ok : GRAD,
                        color: "#021314",
                        fontSize: 21,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        transform: `scale(${frame >= CLICKS.pay[0] && frame < CLICKS.pay[0] + 6 ? 0.96 : 1})`,
                        boxShadow: `0 14px 40px rgba(41,216,213,${0.25 + ramp(frame, 118, 132) * 0.35})`,
                    }}
                >
                    {paid ? (
                        <>
                            <CheckCircleFilled /> Pagado · emitiendo factura
                        </>
                    ) : (
                        "Cobrar"
                    )}
                </div>
            </Card>
            <Cursor
                path={[
                    { f: 20, x: 560, y: 640 },
                    { f: 40, x: c0.x, y: c0.y },
                    { f: 76, x: c0.x, y: c0.y },
                    { f: 86, x: c3.x, y: c3.y },
                    { f: 112, x: c3.x, y: c3.y },
                    { f: 130, x: payAt.x, y: payAt.y },
                ]}
                clicks={[...CLICKS.cafe, ...CLICKS.filtros, ...CLICKS.pay]}
            />
        </div>
    );
};

export const Pos = () => {
    const vertical = useIsVertical();
    const cam = vertical ? V_CAMERA : { from: { x: -380, y: 80, rx: 18, ry: 24, s: 0.72 }, to: { x: -290, y: 0, rx: 4, ry: 12, s: 0.74 } };
    return (
        <AbsoluteFill>
            <Backdrop hue={2} />
            <Camera {...cam} start={0} end={60}>
                <AppFrame group="sell" activeItem="Punto de venta" title="Punto de venta">
                    <PosContent />
                </AppFrame>
            </Camera>
            <AbsoluteFill style={vertical ? V_HEADLINE_BOX : { justifyContent: "center", alignItems: "flex-end", paddingRight: 110 }}>
                <Headline eyebrow="Punto de venta" text="Vende en *segundos.*" width={vertical ? 920 : 470} size={vertical ? 84 : 78} delay={8} />
                {!vertical && (
                    <div style={{ width: 470, marginTop: 26 }}>
                        <Sub delay={30} text="Escanea, cobra y listo. Con factura electrónica desde el mismo botón." />
                    </div>
                )}
            </AbsoluteFill>
            <Vignette />
        </AbsoluteFill>
    );
};

