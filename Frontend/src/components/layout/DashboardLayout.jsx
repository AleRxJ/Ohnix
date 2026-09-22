// components/layout/DashboardLayout.jsx
import React, { useState, useEffect, useContext } from "react";
import { Layout, Button } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { WarningOutlined, CloseOutlined, FireOutlined, RocketOutlined, LockOutlined } from "@ant-design/icons";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import MobileMenu from "./MobileMenu";
import ImpersonationBanner from "./ImpersonationBanner";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { subscriptionService } from "../../services/subscriptionService";
import { toast } from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useTheme } from "../../context/ThemeContext";
import InventoryTour from "../inventoryTour/InventoryTour";
import InventoryTourFab from "../inventoryTour/InventoryTourFab";
import AssistantWidget from "../assistant/AssistantWidget";
import DiscoveryWidget from "../discoveries/DiscoveryWidget";
import DiscoveryRevealOverlay from "../discoveries/DiscoveryRevealOverlay";
import { initConnectivityWatcher } from "../../offline/connectivity";
import { startSyncEngine } from "../../offline/syncEngine";
import { resetOfflineDataIfAccountChanged } from "../../offline/db";
import "../../offline/entitySync"; // registers Etapa 1 entities' pull handlers

const { Content } = Layout;

// Internal app pages are gated behind ProtectedRoute and never crawled by
// search engines, so this is a UX/accessibility concern (tab title, browser
// history, screen readers), not real SEO - no need for the full SeoHead
// treatment (canonical/og/twitter/robots) that the public marketing pages
// use. Reuses the same sidebar labels (data/index.jsx) so page names stay
// in sync in one place.
const PAGE_TITLE_KEYS = {
    dashboard: "common.dashboard",
    products: "common.products",
    orders: "common.orders",
    customers: "common.customers",
    purchases: "common.purchases",
    quotations: "common.quotations_nav",
    suppliers: "common.suppliers",
    categories: "common.categories",
    "electronic-invoices": "common.electronic_invoices_nav",
    "fiscal-setup": "common.settings",
    reports: "common.reports",
    discoveries: "common.discoveries_nav",
    team: "common.team_nav",
    billing: "common.billing",
    integrations: "common.integrations_nav",
    "admin-management": "common.admin_panel",
    "admin-subscriptions": "common.admin_subscriptions",
    "admin-firmapass-validations": "common.admin_firmapass_validations",
};

// hasNeverHadPlan: a Negocio/Escala signup whose payment never completed
// (registerUser creates that subscription as status: paused with no trial
// ever granted, see Backend/controllers/user.controller.js) - distinct from
// isRenewal (a real trial or paid plan that lapsed), since this account
// never had a trial or a paid period to begin with.
// canActOnBilling = false means this is a team member without billing:edit -
// the CTA below would just bounce them to /billing's own "you don't have
// access" screen (see Billing.jsx's canViewBilling block), so instead of a
// button that looks actionable but isn't, tell them plainly who to ask.
const TrialExpiredScreen = ({ onGoToBilling, lang, isRenewal = false, hasNeverHadPlan = false, canActOnBilling = true, ownerName = null, ownerEmail = null }) => (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-6 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <WarningOutlined className="text-4xl text-red-400" />
        </div>
        <div className="max-w-md">
            <h2 className="text-2xl font-bold text-[var(--ohnix-text-primary)] mb-2">
                {hasNeverHadPlan
                    ? (lang === "es" ? "Completa tu pago para activar tu plan" : "Complete your payment to activate your plan")
                    : isRenewal
                        ? (lang === "es" ? "Tu plan ha vencido" : "Your plan has expired")
                        : (lang === "es" ? "Tu prueba gratuita ha terminado" : "Your free trial has ended")}
            </h2>
            <p className="text-[var(--ohnix-text-muted)] text-sm leading-relaxed">
                {hasNeverHadPlan
                    ? (lang === "es"
                        ? "Tu cuenta esta creada, pero ese plan no incluye periodo de prueba. Completa el pago para activarlo, o comienza gratis con Emprendedor mientras decides."
                        : "Your account is created, but that plan doesn't include a trial. Complete payment to activate it, or start free with Starter while you decide.")
                    : isRenewal
                        ? (lang === "es"
                            ? "Tu período de gracia terminó. Renueva tu plan para recuperar el acceso completo a tu inventario, ventas y reportes."
                            : "Your grace period has ended. Renew your plan to restore full access to your inventory, sales, and reports.")
                        : (lang === "es"
                            ? "Tu período de prueba de 14 días ha concluido. Contrata un plan para seguir gestionando tu inventario, ventas y reportes sin interrupciones."
                            : "Your 14-day trial has ended. Subscribe to a plan to keep managing your inventory, sales, and reports without interruption.")}
            </p>
        </div>
        {canActOnBilling ? (
            <Button
                type="primary"
                size="large"
                onClick={onGoToBilling}
                className="bg-[#29D8D5] border-[#29D8D5] text-[#021314] font-semibold hover:bg-[#44F3F0] hover:border-[#44F3F0] px-8"
            >
                {hasNeverHadPlan
                    ? (lang === "es" ? "Completar pago" : "Complete payment")
                    : isRenewal
                        ? (lang === "es" ? "Renovar mi plan" : "Renew my plan")
                        : (lang === "es" ? "Ver planes y contratar" : "See plans and subscribe")}
            </Button>
        ) : (
            <div className="max-w-md rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-5 py-4">
                <p className="m-0 text-sm text-[var(--ohnix-text-primary)]">
                    {ownerName
                        ? (lang === "es"
                            ? <>Solo tu administrador puede gestionar el plan. Habla con <strong>{ownerName}</strong>{ownerEmail ? <> ({ownerEmail})</> : null}.</>
                            : <>Only your admin can manage the plan. Reach out to <strong>{ownerName}</strong>{ownerEmail ? <> ({ownerEmail})</> : null}.</>)
                        : (lang === "es"
                            ? "Solo el administrador de tu equipo puede gestionar el plan."
                            : "Only your team's admin can manage the plan.")}
                </p>
            </div>
        )}
    </div>
);

/**
 * Floating contextual banner — covers all subscription states:
 *   trial active, trial urgent, trial expired, renewal soon, renewal expired
 */
const TrialBanner = ({ mode, daysLeft, onUpgrade, onDismiss, lang, isRenewal = false, planLabel = "", loading = false, daysOverdue = 0 }) => {
    const { isLite } = useTheme();
    const isExpired = mode === "expired";
    const isUrgent  = !isExpired && daysLeft <= 3;

    // Colors
    const borderGradient = isExpired
        ? "linear-gradient(135deg, #ef4444 0%, #7C6AF7 50%, #f59e0b 100%)"
        : isUrgent
            ? "linear-gradient(135deg, #f59e0b 0%, #ef4444 60%, #7C6AF7 100%)"
            : "linear-gradient(135deg, #29D8D5 0%, #7C6AF7 60%, #f59e0b 100%)";

    const bgGradient = isLite
        ? (isExpired
            ? "linear-gradient(135deg, rgba(255,247,247,0.98) 0%, rgba(253,246,255,0.98) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(250,248,255,0.97) 100%)")
        : (isExpired
            ? "linear-gradient(135deg, rgba(15,5,5,0.98) 0%, rgba(12,5,15,0.98) 100%)"
            : "linear-gradient(135deg, rgba(9,10,12,0.97) 0%, rgba(12,10,20,0.97) 100%)");

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
            if (daysOverdue >= 5) return lang === "es"
                ? `🚫 ${plan} lleva ${daysOverdue} días vencido · Acceso bloqueado`
                : `🚫 ${plan} expired ${daysOverdue} days ago · Access blocked`;
            if (isExpired) return lang === "es" ? `🔒 ${plan} venció · Acceso limitado` : `🔒 ${plan} expired · Limited access`;
            if (daysLeft === 1) return lang === "es" ? `🚨 ${plan} vence mañana` : `🚨 ${plan} expires tomorrow`;
            if (isUrgent) return lang === "es" ? `🔥 ${plan} vence en ${daysLeft} días` : `🔥 ${plan} expires in ${daysLeft} days`;
            return lang === "es" ? `⏳ ${plan} vence en ${daysLeft} días` : `⏳ ${plan} expires in ${daysLeft} days`;
        }
        if (isExpired) return lang === "es" ? "🔒 Tu prueba venció · Acceso limitado" : "🔒 Your trial ended · Limited access";
        if (daysLeft === 1) return lang === "es" ? "🔥 Tu prueba termina mañana" : "🔥 Your trial ends tomorrow";
        if (isUrgent) return lang === "es" ? `🔥 Solo quedan ${daysLeft} días de prueba` : `🔥 Only ${daysLeft} trial days left`;
        return lang === "es" ? `⏳ Prueba activa · ${daysLeft} días restantes` : `⏳ Trial active · ${daysLeft} days left`;
    })();

    const subtext = (() => {
        if (isRenewal) {
            if (daysOverdue >= 5) return lang === "es"
                ? "Tu período de gracia terminó. Renueva ahora para recuperar el acceso completo a tus datos y reportes."
                : "Your grace period ended. Renew now to restore full access to your data and reports.";
            if (isExpired) return lang === "es" ? "Tienes pocos días antes del bloqueo total. Renueva para no perder el acceso." : "You have a few days before full block. Renew to keep access.";
            if (isUrgent) return lang === "es" ? "Renueva hoy para no perder tus datos ni el acceso." : "Renew today to keep your data and access.";
            return lang === "es" ? "Renueva antes de que venza para continuar sin interrupciones." : "Renew before it expires to continue without interruption.";
        }
        if (isExpired) return lang === "es" ? "Los 14 días de prueba terminaron. Contrata un plan antes de que se bloquee tu acceso." : "The 14-day trial ended. Subscribe before your access gets blocked.";
        if (isUrgent) return lang === "es" ? "Contrata ahora y no pierdas tus datos ni acceso." : "Subscribe now and keep all your data and access.";
        return lang === "es" ? "Estás en el plan Emprendedor sin costo." : "You're on the Starter plan at no cost.";
    })();

    const ctaLabel = isRenewal
        ? (lang === "es" ? "Renovar" : "Renew")
        : (lang === "es" ? "Contratar" : "Subscribe");

    return (
        <div
            className="no-print fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] w-[calc(100%-2rem)] max-w-2xl"
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
                        <p className="text-sm font-bold m-0 leading-snug" style={{ color: isLite ? "#1c1017" : "#ffffff" }}>{headline}</p>
                        <p className="text-xs m-0 mt-0.5 truncate" style={{ color: isExpired ? "#f87171aa" : (isLite ? "#6b5f70" : "#8B95A1") }}>{subtext}</p>
                    </div>

                    {/* CTA */}
                    <Button
                        size="small"
                        onClick={onUpgrade}
                        icon={loading ? null : <RocketOutlined />}
                        loading={loading}
                        disabled={loading}
                        className="shrink-0 h-9 px-4 rounded-xl font-semibold border-0"
                        style={{ background: ctaBg, boxShadow: ctaGlow, color: ctaColor, minWidth: 100 }}
                    >
                        {loading ? (lang === "es" ? "Procesando..." : "Processing...") : ctaLabel}
                    </Button>

                    {/* Dismiss */}
                    {!isExpired && onDismiss && (
                        <button
                            onClick={onDismiss}
                            className="shrink-0 text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)] transition-colors p-1"
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
    const [renewalLoading, setRenewalLoading] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    const { isOwner, hasPermission, team } = useTeam();
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";
    // Promotional "upgrade/renew now" nudges only make sense for whoever can
    // actually act on them - a member with no billing access can't do
    // anything about them and the CTA is a dead end (see subscription.routes.js).
    // The hard block screen below (isBlocked) is NOT gated by this - losing
    // access because the account lapsed is real for everyone, not a nudge.
    const canActOnBilling = isOwner || hasPermission("billing", "edit");

    // Mobile browsers fire a `resize` event on things that have nothing to do
    // with actually becoming "desktop-sized" - the address bar hiding/showing
    // as the page scrolls, the on-screen keyboard opening, etc. `collapsed`
    // doubles as "is the mobile menu open" (MobileMenu renders when
    // `!collapsed`), so unconditionally forcing collapsed=true on every
    // resize while width stayed under 768 meant: open the hamburger menu,
    // then scroll (or rotate, or focus a field) - the very next resize event
    // snapped it shut, even though the viewport never actually left mobile.
    // Only force it closed on the actual desktop->mobile transition.
    useEffect(() => {
        let wasMobile = window.innerWidth < 768;
        setIsMobile(wasMobile);
        if (wasMobile) setCollapsed(true);

        const checkScreenSize = () => {
            const nowMobile = window.innerWidth < 768;
            setIsMobile(nowMobile);
            if (nowMobile && !wasMobile) {
                setCollapsed(true);
            }
            wasMobile = nowMobile;
        };

        window.addEventListener("resize", checkScreenSize);

        return () => {
            window.removeEventListener("resize", checkScreenSize);
        };
    }, []);

    // Fetch subscription to know trial/block status globally. Also re-fetches
    // when PaymentSuccess.jsx navigates here with fromPayment - otherwise a
    // user who just paid while blocked (subscription.status === "paused")
    // would still see the block screen with the stale pre-payment status
    // until a hard page refresh remounted this component.
    useEffect(() => {
        if (!user || user.role === "admin") return;
        subscriptionService
            .getMySubscription()
            .then((res) => setSubscription(res?.data ?? null))
            .catch(() => {});
    }, [user?.id, location.state?.fromPayment]);

    const currentPath = location.pathname;
    const pathSegments = currentPath.split("/").filter(Boolean);
    // /admin/* has several distinct sub-pages (management, subscriptions, ...)
    // sharing the same first segment - collapsing them all to "admin" meant
    // the sidebar's selectedKeys (data/index.jsx uses "admin-management",
    // "admin-subscriptions", etc. as keys) could never actually match, so
    // the highlighted item silently never changed between them. Every
    // other top-level route is still just its bare first segment.
    const currentPage =
        pathSegments[0] === "admin" && pathSegments[1]
            ? `admin-${pathSegments[1]}`
            : pathSegments.length > 0
              ? pathSegments[0]
              : "dashboard";

    useEffect(() => {
        const titleKey = PAGE_TITLE_KEYS[currentPage];
        document.title = titleKey ? `${t(titleKey)} | Ohnix` : "Ohnix";
    }, [currentPage, currentLanguage, t]);

    // Offline infrastructure only runs inside the authenticated app shell -
    // the marketing site never needs it. Confined here (not main.jsx) keeps
    // it out of every public/anonymous page entirely.
    useEffect(() => {
        initConnectivityWatcher();
        startSyncEngine();

        // The service worker only exists in a built (not dev-server) app -
        // registering it in dev would 404 against a /sw.js that was never
        // generated. Dynamic import so this virtual module (and the SW
        // registration bundle) never ships in the dev build at all.
        if (import.meta.env.PROD) {
            import("virtual:pwa-register").then(({ registerSW }) => {
                registerSW({ immediate: true });
            });
        }
    }, []);

    // A different account logging in on the same browser must never see a
    // previous account's cached offline rows or queued mutations.
    useEffect(() => {
        if (user?.id) resetOfflineDataIfAccountChanged(user.id);
    }, [user?.id]);

    const trialEndsAt = subscription?.trialEndsAt ?? null;
    const planEndsAt = typeof subscription?.endsAt === "string" ? subscription.endsAt : null;
    const isStarterPlan = (subscription?.plan ?? "starter") === "starter";
    const isActive = subscription?.status === "active";

    // Pages that must stay reachable even while the account is blocked - the
    // DIAN electronic invoices/support documents listed there are the
    // customer's own tax records (Estatuto Tributario / Codigo de Comercio
    // retention requirements), not Ohnix's, so a lapsed subscription can
    // never cut off the customer's ability to view or download them. This
    // is read-only in effect: the backend's requireActiveSubscription
    // (pricing.middleware.js) still blocks issuing/retrying/syncing any new
    // DIAN document from these pages while paused (see order.routes.js /
    // purchase.routes.js), only viewing already-issued ones stays open.
    // fiscal-setup is exempt for the same reason plus a stronger one: it's
    // also where the standalone-certificate guest checkout
    // (CertificadosDigitales.jsx -> guestCertificateCheckout.service.js)
    // lands its freshly auto-logged-in account, which never had - and was
    // never meant to need - an Ohnix subscription of any kind. A DIAN
    // certificate is the customer's own, paid-for-once asset; it must never
    // be gated behind an inventory-SaaS plan lapsing (or never having
    // existed at all).
    const COMPLIANCE_PAGES_EXEMPT_FROM_BLOCK = new Set(["billing", "electronic-invoices", "purchase-support-documents", "fiscal-setup"]);

    // The ONLY thing allowed to actually block access. Mirrors the backend's
    // ensureActiveSubscription (pricing.middleware.js) exactly - every
    // create/report/API route gates on subscription.status === "active", and
    // subscriptionRenewalScheduler.js's blockLapsedSubscriptions is what
    // flips it to "paused" after a 5-day grace period (trial or paid plan
    // alike). This used to be computed from trialEndsAt/endsAt date math
    // directly, which had zero grace period for trials and hard-locked
    // legitimate users out of the whole app up to 5 days before the backend
    // would have actually blocked them.
    const isBlocked = subscription?.status === "paused" && user?.role !== "admin" && !COMPLIANCE_PAGES_EXEMPT_FROM_BLOCK.has(currentPage);
    // A real paid period lapsing vs. a trial lapsing is distinguished by
    // endsAt being set, not by plan tier - Starter is a paid plan too (see
    // PLAN_PRICES_USD in pricing.middleware.js) and blockLapsedSubscriptions
    // groups a lapsed paid Starter subscription with every other paid plan,
    // not with expired trials (see its expiredPaid vs expiredTrials query).
    // Gating this on !isStarterPlan instead used to show a paying Starter
    // subscriber whose plan expired the wrong copy ("your free trial has
    // ended") when they'd actually paid for and lost a real subscription.
    const isRenewalBlock = isBlocked && Boolean(planEndsAt);
    // A Negocio/Escala signup whose payment never completed - the account
    // was never on a trial and never paid for anything (see registerUser),
    // so the usual "trial ended"/"plan expired" copy is wrong for it.
    const hasNeverHadPlan = isBlocked && !planEndsAt && !trialEndsAt;

    // Trial ended but still inside the backend's grace period - informational
    // banner only, access isn't actually blocked yet (isBlocked above).
    const trialGraceActive = isStarterPlan && isActive && trialEndsAt && new Date() > new Date(trialEndsAt);
    const trialDaysLeft = trialEndsAt && !trialGraceActive
        ? Math.max(1, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;
    const trialUrgent = trialDaysLeft > 0 && trialDaysLeft <= 3;

    // Renewal banner for paid plans expiring soon or in their grace period.
    // planEndsAt alone (not !isStarterPlan) is the right guard here too - see
    // isRenewalBlock above - otherwise a paying Starter subscriber never gets
    // this nudge anywhere before their real paid period lapses.
    const renewalDaysLeft = planEndsAt
        ? Math.ceil((new Date(planEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
    // The billing page (SubscriptionPlanCard) renders its own equivalent
    // renewal/urgency/expired banners inline, computed independently from
    // this same subscription data - so all three floating banners must also
    // exclude currentPage === "billing" (like isBlocked/showExpiredBanner
    // below already did) or they stack a redundant, and sometimes
    // contradictory, floating copy on top of the page's own message. This
    // is what happened here: on the billing page isBlocked is forced false,
    // so a paused+trial-expired account fell through to the "urgent, ends
    // tomorrow" branch (see trialDaysLeft's Math.max(1, ...) clamp) instead
    // of "expired", directly contradicting the card's "prueba ha terminado"
    // banner rendered right underneath it.
    const showRenewalBanner =
        isActive &&
        renewalDaysLeft !== null &&
        renewalDaysLeft <= 7 &&
        !renewalBannerDismissed &&
        user?.role !== "admin" &&
        currentPage !== "billing" &&
        canActOnBilling;

    // Never show trial banners on the payment-success page (user just paid)
    const isOnPaymentSuccess = location.pathname.includes("payment-success");

    // Show expired banner on every page except billing (no dismiss — must act)
    const showExpiredBanner = trialGraceActive && !isOnPaymentSuccess && user?.role !== "admin" && currentPage !== "billing" && canActOnBilling;

    // Show urgency banner when ≤3 days left AND still on starter (dismissable for the session)
    // trialDaysLeft is clamped to a minimum of 1 (see above) so it still reads
    // "1 day left" for a trial ending within hours - but that clamp also
    // kicks in once the account is fully blocked (isBlocked), where the
    // trial ended days ago. Without excluding isBlocked here, a blocked user
    // would see this "ends soon, subscribe now" nudge floating on top of the
    // hard block screen, which contradicts it (implies time is left when
    // access is already cut off).
    const showUrgencyBanner =
        trialUrgent &&
        !trialGraceActive &&
        !isBlocked &&
        !bannerDismissed &&
        !isOnPaymentSuccess &&
        isStarterPlan &&
        user?.role !== "admin" &&
        currentPage !== "billing" &&
        canActOnBilling;

    const handleDismissBanner = () => {
        sessionStorage.setItem("trial_banner_dismissed", "1");
        setBannerDismissed(true);
    };

    const handleDismissRenewalBanner = () => {
        setRenewalBannerDismissed(true);
    };

    const handleRenew = async () => {
        try {
            setRenewalLoading(true);
            const res = await subscriptionService.createRenewalCheckout({
                country: "CO",
                paymentMethod: "epayco",
            });
            const checkoutUrl = res?.data?.checkoutUrl;
            if (checkoutUrl) {
                window.location.assign(checkoutUrl);
            } else {
                navigate("/billing");
            }
        } catch (err) {
            const msg = err?.response?.data?.message;
            if (msg) toast.error(msg);
            navigate("/billing");
        } finally {
            setRenewalLoading(false);
        }
    };

    return (
        <Layout className={`dashboard-app min-h-screen relative overflow-x-hidden ${user?.impersonatedBy ? "pt-9" : ""}`}>
            <ImpersonationBanner />
            <InventoryTour />
            <InventoryTourFab />
            <AssistantWidget />
            <DiscoveryWidget />
            <DiscoveryRevealOverlay />
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
                    isMobile={isMobile}
                />

                <Content className="mx-3 my-3 sm:mx-5 sm:my-5 lg:mx-7 lg:my-7">
                    <div
                        className="overflow-hidden rounded-2xl border border-[var(--ohnix-line-4)] min-h-[calc(100vh-8rem)] transition-shadow duration-300 reveal-card"
                        style={{
                            background: "linear-gradient(180deg, var(--ohnix-surface-card-soft), var(--ohnix-surface-4))",
                            boxShadow: "var(--ohnix-shadow-elevated)",
                        }}
                    >
                        {isBlocked
                            ? <TrialExpiredScreen
                                  lang={lang}
                                  onGoToBilling={() => navigate("/billing")}
                                  isRenewal={isRenewalBlock}
                                  hasNeverHadPlan={hasNeverHadPlan}
                                  canActOnBilling={canActOnBilling}
                                  ownerName={team?.ownerName}
                                  ownerEmail={team?.ownerEmail}
                              />
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
                    daysOverdue={renewalDaysLeft < 0 ? Math.abs(renewalDaysLeft) : 0}
                    isRenewal
                    planLabel={lang === "es"
                        ? { starter: "Plan Emprendedor", growth: "Plan Negocio", scale: "Plan Escala", enterprise: "Plan Enterprise" }[subscription?.plan] || "tu plan"
                        : { starter: "Starter plan", growth: "Business plan", scale: "Scale plan", enterprise: "Enterprise plan" }[subscription?.plan] || "your plan"
                    }
                    lang={lang}
                    onUpgrade={handleRenew}
                    loading={renewalLoading}
                    onDismiss={renewalDaysLeft > 0 ? handleDismissRenewalBanner : undefined}
                />
            )}
        </Layout>
    );
};

export default DashboardLayout;
