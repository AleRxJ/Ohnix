import React from "react";
import PropTypes from "prop-types";
import LanguageSwitcher from "../LanguageSwitcher/LanguageSwitcher";

// The brand logo below is a static SVG asset drawn in light strokes for a
// dark backdrop (not inline/currentColor, so it can't follow theme tokens) -
// this shell intentionally stays on the fixed dark brand backdrop in both
// Dark and Lite, same as many SaaS auth screens keep a dark/branded side
// panel regardless of app theme. Only the form card itself (AuthCard)
// adapts to Lite.
const AuthLayout = ({ children }) => {
    return (
        <div className="auth-shell relative flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(41,216,213,0.14),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(68,243,240,0.10),transparent_30%),linear-gradient(180deg,#050608_0%,#050505_100%)]">
            {/* Grid */}
            <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:46px_46px]" />

            {/* ── Left panel — desktop only ────────────────────────────── */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">

                {/* Gradient divider — fades top/bottom, teal glow centre */}
                <div className="pointer-events-none absolute right-0 inset-y-0 w-px bg-gradient-to-b from-transparent via-[#29D8D5]/30 to-transparent" aria-hidden="true" />
                <div className="pointer-events-none absolute right-0 inset-y-[20%] h-[60%] w-[1px] blur-[3px] bg-[#29D8D5]/15" aria-hidden="true" />

                {/* Central ambient glow behind the logo */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                    <div className="h-[500px] w-[500px] rounded-full bg-[#29D8D5]/14 blur-[120px] animate-blob-float" />
                    <div className="absolute h-[260px] w-[260px] rounded-full bg-[#44F3F0]/10 blur-[70px] animate-blob-float-alt" />
                </div>

                {/* 3 concentric orbital rings centered on logo */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
                    {/* Inner ring */}
                    <div className="absolute h-[700px] w-[700px] rounded-full border border-[#29D8D5]/[0.08] animate-orbit-xs">
                        <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#29D8D5] shadow-[0_0_14px_5px_rgba(41,216,213,0.9),0_0_32px_rgba(41,216,213,0.45)]" />
                    </div>
                    {/* Middle ring */}
                    <div className="absolute h-[880px] w-[880px] rounded-full border border-[#44F3F0]/[0.06] animate-orbit-mid">
                        <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#44F3F0] shadow-[0_0_14px_4px_rgba(68,243,240,0.85),0_0_28px_rgba(68,243,240,0.4)]" />
                    </div>
                    {/* Outer ring */}
                    <div className="absolute h-[1080px] w-[1080px] rounded-full border border-[rgba(255,255,255,0.03)] animate-orbit-slow" style={{ animationDirection: "reverse" }}>
                        <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#29D8D5] shadow-[0_0_12px_4px_rgba(41,216,213,0.75)]" />
                    </div>
                </div>

                {/* Logo + tagline */}
                <div className="relative z-10 flex flex-col items-center gap-5">
                    <img
                        src="/trasnparente%20-%20Logo%20y%20boucher%20para%20Creame%20(3).svg"
                        alt="Ohnix"
                        className="w-[88%] h-auto animate-float-glow drop-shadow-2xl select-none"
                    />
                    <p className="text-sm font-medium uppercase tracking-[0.38em] text-[#8b98a0]">
                        Todo bajo control
                    </p>
                </div>
            </div>

            {/* ── Right panel — form ───────────────────────────────────── */}
            <div
                className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-8 lg:p-12"
                style={{ position: "relative" }}
            >

                {/* Language switcher — top right. Positioned via inline style
                    (not Tailwind's `absolute`/`top-4`/`right-4` utilities) so it
                    can't fall back into the normal document flow - and land on
                    top of the email field - during the moment on a cold first
                    load where the app's CSS bundle hasn't finished applying yet
                    but React has already mounted the form. */}
                <div style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 50 }}>
                    <LanguageSwitcher />
                </div>

                {/* Mobile logo — only visible when left panel is hidden */}
                <div className="lg:hidden mb-8 flex flex-col items-center gap-2">
                    <img src="/trasnparente%20-%20Logo%20y%20boucher%20para%20Creame%20(3).svg" alt="Ohnix" className="h-20 w-auto" />
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#8b98a0]">Todo bajo control</p>
                </div>

                {/* Accent orbital rings */}
                <div className="pointer-events-none absolute top-8 right-8 h-20 w-20 rounded-full border border-[#29D8D5]/10 animate-orbit-mid" aria-hidden="true">
                    <div className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#29D8D5] shadow-[0_0_8px_2px_rgba(41,216,213,0.65)]" />
                </div>
                <div className="pointer-events-none absolute bottom-10 left-6 h-12 w-12 rounded-full border border-[rgba(255,255,255,0.08)] animate-orbit-xs" aria-hidden="true">
                    <div className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#44F3F0] shadow-[0_0_6px_1px_rgba(68,243,240,0.65)]" />
                </div>

                <div className="w-full max-w-md animate-fade-up-slow">{children}</div>
            </div>
        </div>
    );
};

AuthLayout.propTypes = {
    children: PropTypes.node.isRequired,
};

export default AuthLayout;
