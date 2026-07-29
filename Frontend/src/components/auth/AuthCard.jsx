import React from "react";
import { Card } from "antd";
import PropTypes from "prop-types";
import useI18n from "../../hooks/useI18n";

const AuthCard = ({ title, subtitle, children }) => {
    const { t } = useI18n();
    return (
        <Card
            className="auth-card w-full max-w-md border border-white/10 bg-[#0B0B0B]/92 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md surface-shine animate-fade-up-delay glass-panel"
            styles={{
                body: { padding: "clamp(1rem, 3.4vw, 2.5rem)" },
            }}
            style={{
                borderRadius: "1rem",
            }}
        >
            <div className="pointer-events-none absolute inset-x-6 top-4 h-1 rounded-full bg-[linear-gradient(90deg,transparent,rgba(41,216,213,0.85),rgba(68,243,240,0.9),transparent)] animate-glow-pulse" />
            <div className="text-center mb-7">
                <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#44F3F0]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#44F3F0] shadow-[0_0_16px_rgba(68,243,240,0.9)]" />
                    {t("auth.secure_access")}
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
                    {title}
                </h2>
                {subtitle && (
                    <p className="text-sm text-[#A9B3B8] mt-2">{subtitle}</p>
                )}
            </div>
            {children}
        </Card>
    );
};

AuthCard.propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    children: PropTypes.node.isRequired,
};

export default AuthCard;
