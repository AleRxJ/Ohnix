import React, { useEffect, useState } from "react";
import OhnixLogo from "./OhnixLogo";

// Ohnix's loading identity: the brand mark (isometric stack of boxes inside
// an orbit, crossed by the diagonal node line) redrawn as a few SVG strokes -
// the real logo files are 400KB+ Canva exports, far too heavy for something
// that has to paint before anything else. No antd here on purpose: this is
// rendered by App.jsx's route fallback and ProtectedRoute, which are in the
// always-loaded entry chunk (see ProtectedRoute.jsx's note on vendor-antd).
// Animations live in index.css (.ohnix-mark*) and stop under
// prefers-reduced-motion.

export const OhnixMark = ({ size = 64, className = "" }) => (
    <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className={`ohnix-mark ${className}`}
        aria-hidden="true"
        focusable="false"
    >
        <circle cx="32" cy="32" r="28" fill="none" className="ohnix-mark__track" strokeWidth="1.5" />
        <g className="ohnix-mark__orbit">
            <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                className="ohnix-mark__arc"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="44 132"
            />
            {/* Leading end of the dash: the circle path starts at 3 o'clock and runs
                clockwise, so a 44-unit dash on r=28 ends at ~90deg (6 o'clock). */}
            <circle cx="32" cy="60" r="3" className="ohnix-mark__node" />
        </g>
        <g className="ohnix-mark__cube" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M32 17 L45 24.5 L32 32 L19 24.5 Z" className="ohnix-mark__face ohnix-mark__face--top" />
            <path d="M45 24.5 L45 39.5 L32 47 L32 32 Z" className="ohnix-mark__face ohnix-mark__face--right" />
            <path d="M19 24.5 L32 32 L32 47 L19 39.5 Z" className="ohnix-mark__face ohnix-mark__face--left" />
        </g>
        <line x1="13" y1="51" x2="51" y2="13" className="ohnix-mark__axis" strokeWidth="1.25" />
        <circle cx="13" cy="51" r="2" className="ohnix-mark__axis-node" />
        <circle cx="51" cy="13" r="2" className="ohnix-mark__axis-node" />
        <circle cx="32" cy="32" r="3.25" className="ohnix-mark__core" />
    </svg>
);

// OhnixMark above is the compact spinner (antd <Spin>, inline status);
// the full-size loaders below run the animated OhnixLogo instead.
//
// variant "page": fills the viewport (route/auth gates). "section": fills a
// region of an already-rendered page (default 60vh tall).
const OhnixLoader = ({ variant = "page", message = "Cargando…", height, slowHint = false }) => {
    const [isSlow, setIsSlow] = useState(false);

    useEffect(() => {
        if (!slowHint) return undefined;
        const timer = setTimeout(() => setIsSlow(true), 4000);
        return () => clearTimeout(timer);
    }, [slowHint]);

    const isPage = variant === "page";

    return (
        <div
            role="status"
            aria-live="polite"
            className={`ohnix-loader ${isPage ? "ohnix-loader--page" : ""} flex flex-col items-center justify-center gap-5 px-6 text-center`}
            style={{ minHeight: height || (isPage ? "100vh" : "60vh") }}
        >
            <div className="ohnix-loader__halo">
                <OhnixLogo animated size={isPage ? 132 : 104} />
            </div>
            <div className="flex flex-col items-center gap-1.5">
                {isPage && (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.42em] text-[var(--ohnix-text-primary)] opacity-80">
                        Ohnix
                    </span>
                )}
                <span className="ohnix-loader__message text-sm text-[var(--ohnix-text-muted)]">{message}</span>
            </div>
            {isSlow && (
                <p className="m-0 max-w-xs text-xs leading-relaxed text-[var(--ohnix-text-muted)]">
                    El servidor estaba inactivo y se está reactivando, esto puede tardar unos segundos.
                </p>
            )}
        </div>
    );
};

export default OhnixLoader;
