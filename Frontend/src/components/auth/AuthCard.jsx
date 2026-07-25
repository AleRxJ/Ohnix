import React from "react";
import { Card } from "antd";
import PropTypes from "prop-types";

const AuthCard = ({ title, subtitle, children }) => {
    return (
        <Card
            className="auth-card w-full max-w-md border border-white/10 bg-[#0B0B0B]/92 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md surface-shine animate-fade-up-delay"
            styles={{
                body: { padding: "clamp(1rem, 3.4vw, 2.5rem)" },
            }}
            style={{
                borderRadius: "1rem",
            }}
        >
            <div className="text-center mb-7">
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
