import React from "react";
import { LockOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import useI18n from "../../hooks/useI18n";
import { FEATURE_MINIMUM_PLAN } from "../../hooks/useSubscription";

const PLAN_DISPLAY = {
    growth:     { es: "Negocio",    en: "Business"  },
    scale:      { es: "Escala",     en: "Scale"     },
    enterprise: { es: "Enterprise", en: "Enterprise" },
};

/**
 * Renders a full-height locked state when a feature is not available on the user's plan.
 *
 * Props:
 *   featureKey   — key from PLAN_FEATURES (e.g. "reportSales")
 *   requiredPlan — override the minimum plan (defaults to FEATURE_MINIMUM_PLAN[featureKey])
 */
const PlanGate = ({ featureKey, requiredPlan }) => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";

    const plan = requiredPlan ?? FEATURE_MINIMUM_PLAN[featureKey] ?? "growth";
    const planLabel = PLAN_DISPLAY[plan]?.[lang] ?? plan;

    const title =
        lang === "es"
            ? `Disponible desde el plan ${planLabel}`
            : `Available from the ${planLabel} plan`;

    const body =
        lang === "es"
            ? "Actualiza tu plan para desbloquear esta función y acceder a todos los beneficios."
            : "Upgrade your plan to unlock this feature and access all benefits.";

    const cta =
        lang === "es"
            ? `Actualizar a ${planLabel}`
            : `Upgrade to ${planLabel}`;

    return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-2xl border border-white/8 bg-white/[0.02] px-8 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/8 text-[#44F3F0]">
                <LockOutlined style={{ fontSize: 22 }} />
            </div>
            <div>
                <p className="text-base font-semibold text-white">{title}</p>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[#8A9BA8]">{body}</p>
            </div>
            <button
                type="button"
                onClick={() => navigate("/profile?tab=billing")}
                className="inline-flex items-center gap-2 rounded-full bg-[#29D8D5] px-5 py-2.5 text-sm font-semibold text-[#021314] transition-colors hover:bg-[#44F3F0]"
            >
                {cta}
                <ArrowRightOutlined />
            </button>
        </div>
    );
};

export default PlanGate;
