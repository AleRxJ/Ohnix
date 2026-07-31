// components/layout/DashboardLayout.jsx
import React, { useState, useEffect, useContext } from "react";
import { Layout, Button } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { WarningOutlined, CloseOutlined, FireOutlined, RocketOutlined, LockOutlined } from "@ant-design/icons";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import MobileMenu from "./MobileMenu";
import AuthContext from "../../context/AuthContext";
import { subscriptionService } from "../../services/subscriptionService";
import useI18n from "../../hooks/useI18n";

const { Content } = Layout;

const TrialExpiredScreen = ({ onGoToBilling, lang }) => (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-6 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <WarningOutlined className="text-4xl text-red-400" />
        </div>
        <div className="max-w-md">
            <h2 className="text-2xl font-bold text-white mb-2">
                {lang === "es" ? "Tu prueba gratuita ha terminado" : "Your free trial has ended"}
            </h2>
            <p className="text-[#A9B3B8] text-sm leading-relaxed">
                {lang === "es"
                    ? "Tu período de prueba de 14 días ha concluido. Contrata un plan para seguir gestionando tu inventario, ventas y reportes sin interrupciones."
                    : "Your 14-day trial has ended. Subscribe to a plan to keep managing your inventory, sales, and reports without interruption."}
            </p>
        </div>
        <Button
            type="primary"
            size="large"
            onClick={onGoToBilling}
            className="bg-[#29D8D5] border-[#29D8D5] text-[#021314] font-semibold hover:bg-[#44F3F0] hover:border-[#44F3F0] px-8"
        >
            {lang === "es" ? "Ver planes y contratar" : "See plans and subscribe"}
        </Button>
    </div>
);

/**
 * Floating contextual banner — covers all subscription states:
 *   trial active, trial urgent, trial expired, renewal soon, renewal expired
 */
const TrialBanner = ({ mode, daysLeft, onUpgrade, onDismiss, lang, isRenewal = false, planLabel = "" }) => {
    const isExpired = mode === "expired";
    const isUrgent  = !isExpired && daysLeft <= 3;

    // Colors
    const borderGradient = isExpired
        ? "linear-gradient(135deg, #ef4444 0%, #7C6AF7 50%, #f59e0b 100%)"
        : isUrgent
            ? "linear-gradient(135deg, #f59e0b 0%, #ef4444 60%, #7C6AF7 100%)"
            : "linear-gradient(135deg, #29D8D5 0%, #7C6AF7 60%, #f59e0b 100%)";

    const bgGradient = isExpired
        ? "linear-gradient(135deg, rgba(15,5,5,0.98) 0%, rgba(12,5,15,0.98) 100%)"
        : "linear-gradient(135deg, rgba(9,10,12,0.97) 0%, rgba(12,10,20,0.97) 100%)";

    const iconBg = isExpired
        ? "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(124,106,247,0.18))"
        : "linear-gradient(135deg, rgba(41,216,213,0.18), rgba(124,106,247,0.18))";

    const glowColor = isExpired ? "rgba(239,68,68,0.28)" : isUrgent ? "rgba(245,158,11,0.28)" : "rgba(41,216,213,0.22)";
    const ctaBg     = isExpired ? "linear-gradient(135deg, #ef4444 0%, #f87171 100%)" : "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)";
    const ctaGlow   = isExpired ? "0 0 20px rgba(239,68,68,0.45)" : "0 0 16px rgba(41,216,213,0.35)";
    const ctaColor  = isExpired ? "#fff" : "#021314";

    // ── Contextual copy ──────────────────────────────────────────────────────
    const plan = planLabel || (lang === "es" ? "tu plan" : "your plan");

    const headline = (() => {
        if (isRenewal) {
            if (isExpired) return lang === "es" ? `🔒 ${plan} venció · Acceso limitado` : `🔒 ${plan} expired · Limited access`;
            if (daysLeft === 1) return lang === "es" ? `🚨 ${plan} vence mañana` : `🚨 ${plan} expires tomorrow`;
            if (isUrgent) return lang === "es" ? `🔥 ${plan} vence en ${daysLeft} días` : `🔥 ${plan} expires in ${daysLeft} days`;
            return lang === "es" ? `⏳ ${plan} vence en ${daysLeft} días` : `⏳ ${plan} expires in ${daysLeft} days`;
        }
        if (isExpired) return lang === "es" ? "🔒 Tu acceso está bloqueado" : "🔒 Your access is blocked";
        if (daysLeft === 1) return lang === "es" ? "🔥 Tu prueba termina mañana" : "🔥 Your trial ends tomorrow";
        if (isUrgent) return lang === "es" ? `🔥 Solo quedan ${daysLeft} días de prueba` : `🔥 Only ${daysLeft} trial days left`;
        return lang === "es" ? `⏳ Prueba activa · ${daysLeft} días restantes` : `⏳ Trial active · ${daysLeft} days left`;
    })();

    const subtext = (() => {
        if (isRenewal) {
            if (isExpired) return lang === "es" ? "Renueva ahora para recuperar todas las funcionalidades de tu plan." : "Renew now to restore all plan features.";
            if (isUrgent) return lang === "es" ? "Renueva hoy para no perder tus datos ni el acceso." : "Renew today to keep your data and access.";
            return lang === "es" ? "Renueva antes de que venza para continuar sin interrupciones." : "Renew before it expires to continue without interruption.";
        }
        if (isExpired) return lang === "es" ? "Los 14 días de prueba terminaron. Contrata un plan para recuperar el acceso." : "The 14-day trial ended. Subscribe to restore full access.";
        if (isUrgent) return lang === "es" ? "Contrata ahora y no pierdas tus datos ni acceso." : "Subscribe now and keep all your data and access.";
        return lang === "es" ? "Acceso completo al plan Negocio durante la prueba." : "Full Business plan access during your trial.";
    })();

    const ctaLabel = isRenewal
        ? (lang === "es" ? "Renovar" : "Renew")
        : (lang === "es" ? "Contratar" : "Subscribe");

    return (
        <div
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-2rem)] max-w-2xl"
            style={{ filter: `drop-shadow(0 8px 40px ${glowColor})` }}
        >
            <div className="rounded-2xl p-px" style={{ background: borderGradient }}>
                <div
                    className="rounded-2xl px-5 py-4 flex items-center gap-4"
                    style={{ background: bgGradient, backdropFilter: "blur(20px)" }}
                >
                    {/* Icon */}
                    <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: iconBg }}>
                        {isExpired ? (
                            <LockOutlined className="text-xl text-red-400" style={{ animation: "pulse 2s ease-in-out infinite" }} />
                        ) : (
                            <FireOutlined className="text-xl"
                                style={{ color: isUrgent ? "#f87171" : "#f59e0b", animation: "pulse 1.4s ease-in-out infinite" }} />
                        )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white m-0 leading-snug">{headline}</p>
                        <p className="text-xs m-0 mt-0.5 truncate" style={{ color: isExpired ? "#f87171aa" : "#8B95A1" }}>{subtext}</p>
                    </div>

                    {/* CTA */}
                    <Button
                        size="small"
                        onClick={onUpgrade}
                        icon={<RocketOutlined />}
                        className="shrink-0 h-9 px-4 rounded-xl font-semibold border-0"
                        style={{ background: ctaBg, boxShadow: ctaGlow, color: ctaColor, minWidth: 100 }}
                    >
                        {ctaLabel}
                    </Button>

                    {/* Dismiss */}
                    {!isExpired && onDismiss && (
                        <button
                            onClick={onDismiss}
                            className="shrink-0 text-[#4A5560] hover:text-white transition-colors p-1"
                            aria-label="dismiss"
                        >
                            <CloseOutlined style={{ fontSize: 12 }} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const DashboardLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [subscription, setSubscription] = useState(null);
    const [bannerDismissed, setBannerDismissed] = useState(
        () => sessionStorage.getItem("trial_banner_dismissed") === "1"
    );
    // Renewal banner dismiss is in-memory only — resets on page reload
    const [renewalBannerDismissed, setRenewalBannerDismissed] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    const { currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";

    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 768) {
                setCollapsed(true);
            }
        };

        checkScreenSize();
        window.addEventListener("resize", checkScreenSize);

        return () => {
            window.removeEventListener("resize", checkScreenSize);
        };
    }, []);

    // Fetch subscription once to know trial status globally
    useEffect(() => {
        if (!user || user.role === "admin") return;
        subscriptionService
            .getMySubscription()
            .then((res) => setSubscription(res?.data ?? null))
            .catch(() => {});
    }, [user?.id]);

    const currentPath = location.pathname;
    const pathSegments = currentPath.split("/").filter(Boolean);
    const currentPage = pathSegments.length > 0 ? pathSegments[0] : "dashboard";

    // Trial expired = trialEndsAt set, past expiry, still on starter plan
    const trialEndsAt    = subscription?.trialEndsAt ?? null;
    const trialExpired   =
        trialEndsAt &&
        new Date() > new Date(trialEndsAt) &&
        (subscription?.plan ?? "starter") === "starter";
    const trialDaysLeft  = trialEndsAt && !trialExpired
        ? Math.max(1, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;
    const trialUrgent    = trialDaysLeft > 0 && trialDaysLeft <= 3;

    // Renewal banner for paid plans expiring soon.
    // Only use endsAt if it comes from the real API response (string), not stale cache.
    const planEndsAt = typeof subscription?.endsAt === "string" ? subscription.endsAt : null;
    const renewalDaysLeft = planEndsAt && (subscription?.plan ?? "starter") !== "starter"
        ? Math.ceil((new Date(planEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
    const showRenewalBanner =
        renewalDaysLeft !== null &&
        renewalDaysLeft <= 7 &&
        renewalDaysLeft > -5 &&
        !renewalBannerDismissed &&
        user?.role !== "admin";

    // Admins and users on billing page are never blocked
    const isBlocked = trialExpired && user?.role !== "admin" && currentPage !== "billing";

    // Never show trial banners on the payment-success page (user just paid)
    const isOnPaymentSuccess = location.pathname.includes("payment-success");

    // Show expired banner on every page except billing (no dismiss — must act)
    const showExpiredBanner = trialExpired && !isOnPaymentSuccess && user?.role !== "admin" && currentPage !== "billing";

    // Show urgency banner when ≤3 days left AND still on starter (dismissable for the session)
    const showUrgencyBanner =
        trialUrgent &&
        !trialExpired &&
        !bannerDismissed &&
        !isOnPaymentSuccess &&
        (subscription?.plan ?? "starter") === "starter" &&
        user?.role !== "admin";

    const handleDismissBanner = () => {
        sessionStorage.setItem("trial_banner_dismissed", "1");
        setBannerDismissed(true);
    };

    const handleDismissRenewalBanner = () => {
        setRenewalBannerDismissed(true);
    };

    return (
        <Layout className="dashboard-app min-h-screen relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-70 section-glow" />
            <DashboardSidebar
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                currentPage={currentPage}
            />

            <Layout className="bg-transparent relative z-10">
                <DashboardHeader
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                />

                <MobileMenu
                    collapsed={collapsed}
                    currentPage={currentPage}
                    onClose={() => setCollapsed(true)}
                />

                <Content className="mx-3 my-3 sm:mx-5 sm:my-5 lg:mx-7 lg:my-7">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(11,11,11,0.9),rgba(8,8,8,0.96))] min-h-[calc(100vh-8rem)] shadow-[0_20px_45px_rgba(0,0,0,0.42)] transition-shadow duration-300 hover:shadow-[0_24px_54px_rgba(0,0,0,0.5)] reveal-card">
                        {isBlocked
                            ? <TrialExpiredScreen lang={lang} onGoToBilling={() => navigate("/billing")} />
                            : <Outlet />
                        }
                    </div>
                </Content>
            </Layout>

            {showExpiredBanner && (
                <TrialBanner
                    mode="expired"
                    lang={lang}
                    onUpgrade={() => navigate("/billing")}
                />
            )}
            {showUrgencyBanner && (
                <TrialBanner
                    mode="urgent"
                    daysLeft={trialDaysLeft}
                    lang={lang}
                    onUpgrade={() => navigate("/billing")}
                    onDismiss={handleDismissBanner}
                />
            )}
            {showRenewalBanner && (
                <TrialBanner
                    mode={renewalDaysLeft <= 0 ? "expired" : "urgent"}
                    daysLeft={renewalDaysLeft > 0 ? renewalDaysLeft : 0}
                    isRenewal
                    planLabel={lang === "es"
                        ? { growth: "Plan Negocio", scale: "Plan Escala", enterprise: "Plan Enterprise" }[subscription?.plan] || "tu plan"
                        : { growth: "Business plan", scale: "Scale plan", enterprise: "Enterprise plan" }[subscription?.plan] || "your plan"
                    }
                    lang={lang}
                    onUpgrade={() => navigate("/billing")}
                    onDismiss={renewalDaysLeft > 0 ? handleDismissRenewalBanner : undefined}
                />
            )}
        </Layout>
    );
};

export default DashboardLayout;