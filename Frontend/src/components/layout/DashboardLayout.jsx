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
 * Floating trial banner — two modes:
 *   expired: no dismiss, red/dark brutal design, lock icon
 *   urgent:  dismissable, teal/purple gradient, fire icon
 */
const TrialBanner = ({ mode, daysLeft, onUpgrade, onDismiss, lang, isRenewal = false }) => {
    const isExpired = mode === "expired";

    const borderGradient = isExpired
        ? "linear-gradient(135deg, #ef4444 0%, #7C6AF7 50%, #f59e0b 100%)"
        : "linear-gradient(135deg, #29D8D5 0%, #7C6AF7 60%, #f59e0b 100%)";

    const bgGradient = isExpired
        ? "linear-gradient(135deg, rgba(15,5,5,0.98) 0%, rgba(12,5,15,0.98) 100%)"
        : "linear-gradient(135deg, rgba(9,10,12,0.97) 0%, rgba(12,10,20,0.97) 100%)";

    const iconBg = isExpired
        ? "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(124,106,247,0.18))"
        : "linear-gradient(135deg, rgba(41,216,213,0.18), rgba(124,106,247,0.18))";

    const glowColor = isExpired
        ? "rgba(239,68,68,0.28)"
        : "rgba(41,216,213,0.22)";

    const ctaBg = isExpired
        ? "linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
        : "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)";

    const ctaGlow = isExpired
        ? "0 0 20px rgba(239,68,68,0.45)"
        : "0 0 16px rgba(41,216,213,0.35)";

    const ctaTextColor = isExpired ? "#fff" : "#021314";

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
                    <div
                        className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl"
                        style={{ background: iconBg }}
                    >
                        {isExpired ? (
                            <LockOutlined
                                className="text-xl text-red-400"
                                style={{ animation: "pulse 2s ease-in-out infinite" }}
                            />
                        ) : (
                            <FireOutlined
                                className="text-xl"
                                style={{
                                    color: daysLeft === 1 ? "#f87171" : "#f59e0b",
                                    animation: "pulse 1.4s ease-in-out infinite",
                                }}
                            />
                        )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white m-0 leading-snug">
                            {isRenewal
                                ? isExpired
                                    ? (lang === "es" ? "🔒 Tu plan venció" : "🔒 Your plan has expired")
                                    : (lang === "es"
                                        ? `⏳ Tu plan vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`
                                        : `⏳ Your plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`)
                                : isExpired
                                    ? (lang === "es" ? "🔒 Tu acceso está bloqueado" : "🔒 Your access is blocked")
                                    : (lang === "es"
                                        ? `⏳ Tu prueba termina en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`
                                        : `⏳ Your trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`)
                            }
                        </p>
                        <p className="text-xs m-0 mt-0.5 truncate" style={{ color: isExpired ? "#f87171aa" : "#8B95A1" }}>
                            {isRenewal
                                ? isExpired
                                    ? (lang === "es" ? "Renueva tu plan para recuperar el acceso completo." : "Renew your plan to restore full access.")
                                    : (lang === "es" ? "Renueva antes de que venza para no perder el acceso." : "Renew before it expires to keep your access.")
                                : isExpired
                                    ? (lang === "es"
                                        ? "Los 14 días de prueba terminaron. Contrata un plan para recuperar el acceso."
                                        : "The 14-day trial ended. Subscribe to restore full access.")
                                    : (lang === "es"
                                        ? "Contrata ahora y no pierdas tus datos ni acceso."
                                        : "Subscribe now and keep all your data and access.")
                            }
                        </p>
                    </div>

                    {/* CTA */}
                    <Button
                        size="small"
                        onClick={onUpgrade}
                        icon={<RocketOutlined />}
                        className="shrink-0 h-9 px-4 rounded-xl font-semibold border-0"
                        style={{
                            background: ctaBg,
                            boxShadow: ctaGlow,
                            color: ctaTextColor,
                            minWidth: 110,
                        }}
                    >
                        {isRenewal
                            ? (lang === "es" ? "Renovar" : "Renew")
                            : (lang === "es" ? "Contratar" : "Subscribe")
                        }
                        {lang === "es" ? "Contratar" : "Subscribe"}
                    </Button>

                    {/* Dismiss — only for urgency, not expired */}
                    {!isExpired && (
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
    const planEndsAt     = subscription?.endsAt ?? null;
    const trialExpired   =
        trialEndsAt &&
        new Date() > new Date(trialEndsAt) &&
        (subscription?.plan ?? "starter") === "starter";
    const trialDaysLeft  = trialEndsAt && !trialExpired
        ? Math.max(1, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;
    const trialUrgent    = trialDaysLeft > 0 && trialDaysLeft <= 3;

    // Renewal banner for paid plans expiring soon
    const renewalDaysLeft = planEndsAt && (subscription?.plan ?? "starter") !== "starter"
        ? Math.ceil((new Date(planEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
    const showRenewalBanner =
        renewalDaysLeft !== null &&
        renewalDaysLeft <= 7 &&
        renewalDaysLeft > -5 &&
        !bannerDismissed &&
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
                    lang={lang}
                    onUpgrade={() => navigate("/billing")}
                    onDismiss={renewalDaysLeft > 3 ? handleDismissBanner : undefined}
                />
            )}
        </Layout>
    );
};

export default DashboardLayout;