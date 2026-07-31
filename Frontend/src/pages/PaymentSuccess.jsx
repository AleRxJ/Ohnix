import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Progress, Spin, Typography, Tag } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { subscriptionService } from "../services/subscriptionService";
import useI18n from "../hooks/useI18n";
import AuthContext from "../context/AuthContext";

const { Title, Text } = Typography;

const CHECKLIST_STEP_KEYS = [
    "setup_basics",
    "create_first_product",
    "run_first_operation",
    "review_first_report",
    "invite_first_member",
];

const ONBOARDING_PROGRESS_STORAGE_KEY = "ohnix:onboarding-checklist";

const readStoredChecklist = () => {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(ONBOARDING_PROGRESS_STORAGE_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [searchParams] = useSearchParams();
    const { user } = useContext(AuthContext);

    const requestId = searchParams.get("requestId") || "";
    const sessionId = searchParams.get("session_id") || "";

    const [loading, setLoading] = useState(true);
    const [statusData, setStatusData] = useState(null);
    const [usageData, setUsageData] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [manualChecklistDone, setManualChecklistDone] = useState(() => readStoredChecklist());

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.localStorage.setItem(
            ONBOARDING_PROGRESS_STORAGE_KEY,
            JSON.stringify(manualChecklistDone)
        );
    }, [manualChecklistDone]);

    useEffect(() => {
        let isMounted = true;
        let pollTimer;
        let pollCount = 0;

        const load = async () => {
            if (!requestId) {
                if (isMounted) {
                    setErrorMessage(t("profile.subscription.payment_success_missing_request"));
                    setLoading(false);
                }
                return;
            }

            try {
                const [statusResponse, usageResponse] = await Promise.all([
                    subscriptionService.getUpgradeCheckoutStatus(requestId),
                    subscriptionService.getMyUsage(),
                ]);

                if (!isMounted) {
                    return;
                }

                setStatusData(statusResponse?.data || null);
                setUsageData(usageResponse?.data || null);

                const requestStatus = statusResponse?.data?.request?.status;
                const targetPlanActive = statusResponse?.data?.targetPlanActive;

                // After 5 polls without activation, try fallback verification
                if (!(requestStatus === "closed" && targetPlanActive) && pollCount === 5) {
                    try {
                        // Stripe fallback: only if session_id is present in the URL
                        if (sessionId) {
                            await subscriptionService.verifyAndActivateBySession(requestId, sessionId);
                        } else {
                            // ePayco fallback: ask the backend to query ePayco directly
                            await subscriptionService.verifyEpaycoAndActivate(requestId);
                        }
                        // Re-check status after forced activation
                        const refreshed = await subscriptionService.getUpgradeCheckoutStatus(requestId);
                        if (refreshed?.data?.targetPlanActive) {
                            setStatusData(refreshed?.data || null);
                            setLoading(false);
                            return;
                        }
                    } catch {
                        // Fallback failed silently, keep polling
                    }
                }

                if (!(requestStatus === "closed" && targetPlanActive) && pollCount < 15) {
                    pollCount += 1;
                    pollTimer = setTimeout(load, 4000);
                } else {
                    setLoading(false);
                }
            } catch (error) {
                if (isMounted) {
                    setErrorMessage(
                        error?.response?.data?.message ||
                            t("profile.subscription.payment_success_load_failed")
                    );
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            isMounted = false;
            if (pollTimer) {
                clearTimeout(pollTimer);
            }
        };
    }, [requestId, sessionId, t]);

    // Declare request/subscription before the useMemo that depends on them
    const request = statusData?.request;
    const subscription = statusData?.subscription;

    const checklist = useMemo(() => {
        const usage = usageData?.usage || {};
        const targetPlan = request?.targetPlan || "growth";

        const isBasicsConfigured =
            (usage.customers?.used || 0) > 0 ||
            (usage.suppliers?.used || 0) > 0 ||
            (usage.categories?.used || 0) > 0 ||
            (usage.units?.used || 0) > 0;
        const hasProducts = (usage.products?.used || 0) > 0;
        const hasOperations = (usage.orders?.used || 0) > 0 || (usage.purchases?.used || 0) > 0;
        const inviteTeamRoute = user?.role === "admin" ? "/admin/management" : "/profile";

        // ── Plan-specific onboarding steps ──────────────────────────────
        const PLAN_STEPS = {
            growth: [
                {
                    key: "basics",
                    title: "Configura tu negocio",
                    description: "Agrega clientes, proveedores, categorías y unidades. La base de todo lo que mides.",
                    done: isBasicsConfigured,
                    route: "/profile",
                    actionLabel: "Ir a perfil",
                    isPlanKey: false,
                },
                {
                    key: "catalog",
                    title: "Carga tu catálogo completo",
                    description: "Hasta 500 productos. Usa carga masiva CSV para subir todo tu inventario en minutos.",
                    done: hasProducts,
                    route: "/products",
                    actionLabel: "Ir a productos",
                    isPlanKey: true,
                },
                {
                    key: "operation",
                    title: "Corre tu primer pedido y compra",
                    description: "Cada pedido genera una factura PDF lista para compartir con tu cliente.",
                    done: hasOperations,
                    route: "/orders",
                    secondaryRoute: "/purchases",
                    actionLabel: "Crear pedido",
                    secondaryActionLabel: "Crear compra",
                    isPlanKey: false,
                },
                {
                    key: "reports",
                    title: "Revisa tus reportes de ventas",
                    description: "Márgenes, tendencias y top productos. Esta vista vale lo que pagas por el plan.",
                    done: manualChecklistDone.reports || false,
                    route: "/reports",
                    actionLabel: "Ver reportes",
                    manualAllowed: true,
                    isPlanKey: true,
                },
                {
                    key: "alerts",
                    title: "Activa alertas automáticas de stock bajo",
                    description: "Recibe un email cuando un producto esté a punto de agotarse. Sin sorpresas.",
                    done: manualChecklistDone.alerts || false,
                    route: "/profile",
                    actionLabel: "Configurar alertas",
                    manualAllowed: true,
                    isPlanKey: true,
                },
            ],
            scale: [
                {
                    key: "catalog",
                    title: "Carga tu catálogo a escala",
                    description: "Hasta 2,000 productos. Usa carga masiva CSV — en Escala no hay límite que te detenga.",
                    done: hasProducts,
                    route: "/products",
                    actionLabel: "Ir a productos",
                    isPlanKey: true,
                },
                {
                    key: "operation",
                    title: "Arranca operaciones",
                    description: "Pedidos y compras ilimitados. Registra cada movimiento sin preocuparte por cuotas.",
                    done: hasOperations,
                    route: "/orders",
                    secondaryRoute: "/purchases",
                    actionLabel: "Crear pedido",
                    secondaryActionLabel: "Crear compra",
                    isPlanKey: false,
                },
                {
                    key: "thresholds",
                    title: "Configura umbrales personalizados por producto",
                    description: "Cada producto puede tener su propio nivel mínimo de stock. Alertas inteligentes.",
                    done: manualChecklistDone.thresholds || false,
                    route: "/products",
                    actionLabel: "Configurar productos",
                    manualAllowed: true,
                    isPlanKey: true,
                },
                {
                    key: "reports",
                    title: "Explora reportes avanzados",
                    description: "Ventas, compras, top productos y análisis de márgenes. Tu dashboard de decisiones.",
                    done: manualChecklistDone.reports || false,
                    route: "/reports",
                    actionLabel: "Abrir reportes",
                    manualAllowed: true,
                    isPlanKey: true,
                },
                {
                    key: "api",
                    title: "Conecta via API REST",
                    description: "Integra Ohnix con tu ERP, eCommerce o sistema propio. Documentación disponible.",
                    done: manualChecklistDone.api || false,
                    route: "/profile",
                    actionLabel: "Ver documentación API",
                    manualAllowed: true,
                    isPlanKey: true,
                },
            ],
            enterprise: [
                {
                    key: "onboarding",
                    title: "Agenda tu sesión de onboarding",
                    description: "Tu Account Manager te contactará en menos de 24h para arrancar con tu implementación.",
                    done: manualChecklistDone.onboarding || false,
                    route: "/profile",
                    actionLabel: "Contactar Account Manager",
                    manualAllowed: true,
                    isPlanKey: true,
                },
                {
                    key: "catalog",
                    title: "Importa tu catálogo completo",
                    description: "Productos ilimitados. Tu Account Manager puede asistirte en la migración de datos.",
                    done: hasProducts,
                    route: "/products",
                    actionLabel: "Ir a productos",
                    isPlanKey: false,
                },
                {
                    key: "operation",
                    title: "Configura tu operación",
                    description: "Flujos de pedidos y compras sin límites. Diseñado para tu volumen de negocio.",
                    done: hasOperations,
                    route: "/orders",
                    secondaryRoute: "/purchases",
                    actionLabel: "Crear pedido",
                    secondaryActionLabel: "Crear compra",
                    isPlanKey: false,
                },
                {
                    key: "api",
                    title: "Integra via API sin restricciones",
                    description: "Rate limits elevados, endpoints completos. Conéctate con cualquier sistema externo.",
                    done: manualChecklistDone.api || false,
                    route: "/profile",
                    actionLabel: "Ver documentación API",
                    manualAllowed: true,
                    isPlanKey: true,
                },
                {
                    key: "sla",
                    title: "Revisa tu SLA y canales de soporte",
                    description: "Respuesta garantizada y canal directo con el equipo técnico de Ohnix.",
                    done: manualChecklistDone.sla || false,
                    route: "/profile",
                    actionLabel: "Ver SLA",
                    manualAllowed: true,
                    isPlanKey: true,
                },
            ],
        };

        return PLAN_STEPS[targetPlan] || PLAN_STEPS.growth;
    }, [manualChecklistDone, usageData, user?.role, request?.targetPlan]);

    const markChecklistStepDone = (stepKey) => {
        setManualChecklistDone((prev) => ({
            ...prev,
            [stepKey]: true,
        }));
    };

    const completedSteps = checklist.filter((step) => step.done).length;
    const completionPercent = Math.round((completedSteps / checklist.length) * 100);

    const activated = request?.status === "closed" && statusData?.targetPlanActive;
    const fromPlanLabel = request?.currentPlan
        ? t(`profile.subscription.plan_${request.currentPlan}`)
        : t("profile.subscription.plan_starter");
    const toPlanLabel = request?.targetPlan
        ? t(`profile.subscription.plan_${request.targetPlan}`)
        : "-";
    // Once activated, show the NEW plan; before, show the current (old) plan
    const currentPlanLabel = activated
        ? toPlanLabel
        : subscription?.plan
            ? t(`profile.subscription.plan_${subscription.plan}`)
            : t("profile.subscription.plan_starter");

    // Key features per plan for the success card
    const PLAN_HIGHLIGHTS = {
        growth:     ["Productos ilimitados", "Reportes avanzados", "Exportación CSV", "Alertas automáticas por email"],
        scale:      ["Todo lo de Negocio incluido", "Acceso API REST", "Umbrales configurables", "Soporte prioritario"],
        enterprise: ["Solución personalizada", "Account Manager dedicado", "SLA garantizado", "Integración a medida"],
    };
    const planHighlights = PLAN_HIGHLIGHTS[request?.targetPlan] || [];

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#050608] px-4 py-8 text-white sm:py-12">
            <div className="pointer-events-none absolute inset-0 opacity-90">
                <div className="payment-success-glow payment-success-glow-left" />
                <div className="payment-success-glow payment-success-glow-right" />
                <div className="payment-success-grid" />
            </div>

            <div className="relative mx-auto w-full max-w-5xl space-y-6">
                <Card className="!rounded-3xl !border !border-[#29D8D5]/20 !bg-[linear-gradient(145deg,rgba(7,19,23,0.92)_0%,rgba(8,30,36,0.85)_55%,rgba(9,14,17,0.95)_100%)] !shadow-[0_35px_120px_rgba(8,20,24,0.65)] !overflow-hidden">
                    {loading || (!activated && !errorMessage) ? (
                        /* ── PENDIENTE / CARGANDO: diseño full dramático ── */
                        <div className="relative min-h-[420px] flex flex-col items-center justify-center gap-8 py-14 px-6 text-center overflow-hidden">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="h-[480px] w-[480px] rounded-full" style={{ background: "radial-gradient(circle, rgba(41,216,213,0.07) 0%, transparent 70%)", animation: "psGlowPulse 3s ease-in-out infinite" }} />
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(41,216,213,0.12) 0%, transparent 70%)", animation: "psGlowPulse 2s ease-in-out infinite 0.5s" }} />
                                </div>
                            </div>
                            <div className="relative flex items-center justify-center">
                                <div className="absolute h-48 w-48 rounded-full border border-[#29D8D5]/10" style={{ animation: "psRingSpin 12s linear infinite reverse" }} />
                                <div className="absolute h-36 w-36 rounded-full border border-dashed border-[#29D8D5]/20" style={{ animation: "psRingSpin 8s linear infinite" }} />
                                <div className="absolute h-24 w-24 rounded-full border border-[#29D8D5]/35" style={{ animation: "psRingPulse 2s ease-in-out infinite" }} />
                                <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-[#29D8D5]/40 bg-gradient-to-br from-[#0d2730] to-[#061418]"
                                    style={{ boxShadow: "0 0 40px rgba(41,216,213,0.2), inset 0 1px 0 rgba(41,216,213,0.15)" }}>
                                    <svg className="h-9 w-9 text-[#29D8D5]" style={{ animation: "psGlowPulse 2s ease-in-out infinite" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="relative z-10 flex flex-col items-center gap-3 max-w-md">
                                <div className="inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-4 py-1.5">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#29D8D5]" />
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#29D8D5]">Confirmando pago</span>
                                </div>
                                <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl" style={{ textShadow: "0 0 40px rgba(41,216,213,0.3)" }}>
                                    Pago recibido
                                </h2>
                                <p className="text-[#8AA4AB] text-sm">
                                    Verificando confirmación con ePayco
                                    <span className="inline-flex gap-0.5 ml-1">
                                        <span style={{ animation: "psDot 1.4s ease-in-out infinite 0s" }}>·</span>
                                        <span style={{ animation: "psDot 1.4s ease-in-out infinite 0.2s" }}>·</span>
                                        <span style={{ animation: "psDot 1.4s ease-in-out infinite 0.4s" }}>·</span>
                                    </span>
                                </p>
                                <p className="text-xs text-[#4a6a72]">Suele tardar menos de 30 segundos. No cierres esta pestaña.</p>
                            </div>
                            {request && (
                                <div className="relative z-10 flex items-center gap-4 rounded-2xl border border-[#29D8D5]/20 bg-gradient-to-r from-[#0a1f26]/80 to-[#071218]/80 px-6 py-3.5 backdrop-blur-sm">
                                    <span className="text-sm text-[#6A8F97]">{fromPlanLabel}</span>
                                    <div className="flex items-center gap-1">
                                        <div className="h-px w-4 bg-[#29D8D5]/40" />
                                        <div className="h-1.5 w-1.5 rotate-45 bg-[#29D8D5]" style={{ animation: "psGlowPulse 1.5s ease-in-out infinite" }} />
                                        <div className="h-px w-4 bg-[#29D8D5]/40" />
                                    </div>
                                    <span className="text-sm font-bold text-[#44F3F0]">{toPlanLabel}</span>
                                </div>
                            )}
                            <div className="relative z-10 w-full max-w-xs">
                                <div className="overflow-hidden rounded-full bg-white/[0.05] h-1.5" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)" }}>
                                    <div className="h-1.5 rounded-full bg-gradient-to-r from-[#29D8D5] via-[#44F3F0] to-[#29D8D5]"
                                        style={{ backgroundSize: "200% 100%", animation: "psProgressSlide 2s ease-in-out infinite" }} />
                                </div>
                            </div>
                            {!loading && (
                                <button onClick={() => navigate("/billing")} className="relative z-10 text-xs text-[#3a5560] underline hover:text-[#8AA4AB] transition-colors">
                                    Volver a facturación
                                </button>
                            )}
                        </div>
                    ) : errorMessage ? (
                        <Alert type="error" message={errorMessage} showIcon className="!rounded-xl !border !border-red-300/25 !bg-red-500/10 !text-white" />
                    ) : (
                        /* ── ACTIVADO: celebración ── */
                        <div className="relative overflow-hidden">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-500/8 blur-3xl" />
                                <div className="absolute -bottom-10 -left-16 h-56 w-56 rounded-full bg-[#29D8D5]/10 blur-3xl" />
                            </div>
                            <div className="relative flex flex-col gap-8 p-2">
                                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-5">
                                        <div className="relative shrink-0">
                                            <div className="absolute inset-0 rounded-2xl bg-emerald-400/20 blur-xl" />
                                            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10" style={{ animation: "psSuccessPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both" }}>
                                                <svg className="h-8 w-8 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-300">
                                                ✦ Plan activado
                                            </div>
                                            <h2 className="text-2xl font-bold text-white sm:text-3xl">
                                                ¡Bienvenido a{" "}
                                                <span className="bg-gradient-to-r from-[#29D8D5] to-emerald-300 bg-clip-text text-transparent">{toPlanLabel}</span>!
                                            </h2>
                                            <p className="mt-1 text-sm text-[#A9B3B8]">{t("profile.subscription.payment_success_subtitle")}</p>
                                        </div>
                                    </div>
                                    <div className="shrink-0 rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#081a1f] to-[#060f13] p-4 text-center">
                                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#5a8090] mb-1">Actualización</div>
                                        <div className="text-sm text-[#7FA4AA]">{fromPlanLabel}</div>
                                        <div className="my-1 text-[#29D8D5]">↓</div>
                                        <div className="text-base font-bold text-[#44F3F0]">{toPlanLabel}</div>
                                    </div>
                                </div>
                                {planHighlights.length > 0 && (
                                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.13em] text-[#7FA4AA]">Lo que tienes ahora</p>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {planHighlights.map((feature) => (
                                                <div key={feature} className="flex items-center gap-2.5 text-sm text-[#C8E0E4]">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">✓</span>
                                                    {feature}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-3">
                                    <Button type="primary" size="large" className="!rounded-xl !border-0 !bg-[#29D8D5] !px-7 !text-[#041316] !font-semibold hover:!bg-[#44F3F0] !h-11"
                                        onClick={() => navigate("/dashboard", { state: { fromPayment: true } })}>
                                        Ir al dashboard →
                                    </Button>
                                    <Button size="large" className="!rounded-xl !border-white/20 !bg-white/[0.03] !px-6 !text-white hover:!border-[#29D8D5]/45 hover:!text-[#9CFDFC] !h-11"
                                        onClick={() => navigate("/billing")}>
                                        {t("profile.subscription.back_to_billing")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Checklist only appears after plan is confirmed active */}
                {activated && (
                <Card className="!rounded-3xl !border !border-white/10 !bg-[linear-gradient(180deg,rgba(9,12,15,0.97)_0%,rgba(6,9,12,0.99)_100%)] !overflow-hidden">
                    {/* Header */}
                    <div className="relative flex items-start justify-between gap-4 mb-6">
                        <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-[#29D8D5]/6 blur-3xl" />
                        <div className="relative">
                            <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/5 px-3 py-1">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#29D8D5]">
                                    Primeros pasos · {toPlanLabel}
                                </span>
                            </div>
                            <Title level={3} className="!mb-1 !text-white">
                                Activa el poder de tu plan
                            </Title>
                            <Text className="text-[#7FA4AB] text-sm">
                                Estos pasos están diseñados para que empieces a ver resultados en tu operación hoy.
                            </Text>
                        </div>
                        <div className="relative shrink-0 flex flex-col items-center rounded-2xl border border-[#29D8D5]/20 bg-[#29D8D5]/5 px-4 py-3 text-center min-w-[64px]">
                            <span className="text-2xl font-black text-[#44F3F0]">{completionPercent}%</span>
                            <span className="text-[10px] text-[#5a8090] mt-0.5">listo</span>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-6">
                        <Progress
                            percent={completionPercent}
                            showInfo={false}
                            strokeColor={{ "0%": "#29D8D5", "100%": "#8CFFF8" }}
                            trailColor="rgba(255,255,255,0.06)"
                            strokeLinecap="round"
                        />
                        <div className="mt-1.5 text-xs text-[#4a6a72]">
                            {completedSteps} de {checklist.length} pasos completados
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                        {checklist.map((step, index) => (
                            <div
                                key={step.key}
                                className={`group relative rounded-2xl border transition-all duration-300 ${
                                    step.done
                                        ? "border-emerald-400/25 bg-gradient-to-r from-emerald-500/8 to-emerald-600/5"
                                        : step.isPlanKey
                                            ? "border-[#29D8D5]/25 bg-gradient-to-r from-[#29D8D5]/6 to-transparent hover:border-[#29D8D5]/40 hover:from-[#29D8D5]/10"
                                            : "border-white/8 bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.03]"
                                }`}
                                style={{ animation: `paymentSuccessSlideUp 400ms ease ${index * 60}ms both` }}
                            >
                                <div className="flex items-start gap-4 p-4">
                                    {/* Status indicator */}
                                    <div className={`mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border text-sm font-bold transition-all ${
                                        step.done
                                            ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                                            : step.isPlanKey
                                                ? "border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#29D8D5]"
                                                : "border-white/15 bg-white/5 text-[#6a8a94]"
                                    }`}>
                                        {step.done ? "✓" : index + 1}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-sm font-semibold ${step.done ? "text-emerald-200" : "text-white"}`}>
                                                {step.title}
                                            </span>
                                            {step.isPlanKey && !step.done && (
                                                <span className="rounded-full border border-[#29D8D5]/30 bg-[#29D8D5]/8 px-2 py-0.5 text-[10px] font-semibold text-[#29D8D5]">
                                                    {toPlanLabel}
                                                </span>
                                            )}
                                            {step.done && (
                                                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/8 px-2 py-0.5 text-[10px] text-emerald-300">
                                                    Completado
                                                </span>
                                            )}
                                        </div>
                                        <p className={`mt-0.5 text-xs leading-relaxed ${step.done ? "text-emerald-300/60" : "text-[#6a8a94]"}`}>
                                            {step.description}
                                        </p>

                                        {!step.done && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Button
                                                    size="small"
                                                    className={`!rounded-lg !text-xs !font-medium ${
                                                        step.isPlanKey
                                                            ? "!border-[#29D8D5]/40 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!border-[#29D8D5]/60 hover:!bg-[#29D8D5]/20"
                                                            : "!border-white/20 !bg-white/[0.04] !text-[#C8DDE2] hover:!border-white/30"
                                                    }`}
                                                    onClick={() => navigate(step.route)}
                                                >
                                                    {step.actionLabel}
                                                </Button>
                                                {step.secondaryRoute && (
                                                    <Button size="small"
                                                        className="!rounded-lg !text-xs !border-white/15 !bg-white/[0.02] !text-[#8AA4AB]"
                                                        onClick={() => navigate(step.secondaryRoute)}>
                                                        {step.secondaryActionLabel}
                                                    </Button>
                                                )}
                                                {step.manualAllowed && (
                                                    <Button size="small"
                                                        className="!rounded-lg !text-xs !border-emerald-400/25 !bg-emerald-500/8 !text-emerald-300 hover:!bg-emerald-500/15"
                                                        onClick={() => markChecklistStepDone(step.key)}>
                                                        Ya lo hice ✓
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ROI footer — shows unlocked capabilities */}
                    <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#4a6a72] mb-3">Lo que desbloqueaste con {toPlanLabel}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {(request?.targetPlan === "growth" ? [
                                {
                                    label: "Reportes completos",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
                                },
                                {
                                    label: "Exportación CSV",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
                                },
                                {
                                    label: "Alertas automáticas",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
                                },
                                {
                                    label: "Carga masiva",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>,
                                },
                            ] : request?.targetPlan === "scale" ? [
                                {
                                    label: "API REST",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>,
                                },
                                {
                                    label: "Umbrales custom",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>,
                                },
                                {
                                    label: "2,000 productos",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
                                },
                                {
                                    label: "Reportes avanzados",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
                                },
                            ] : [
                                {
                                    label: "Todo ilimitado",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>,
                                },
                                {
                                    label: "Account Manager",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
                                },
                                {
                                    label: "SLA garantizado",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
                                },
                                {
                                    label: "API sin límites",
                                    svg: <svg className="h-4 w-4 shrink-0 text-[#29D8D5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>,
                                },
                            ]).map((cap) => (
                                <div key={cap.label} className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                                    {cap.svg}
                                    <span className="text-xs text-[#8AA4AB] leading-tight">{cap.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
                )}
            </div>

            <style>{`
                /* Existing glows */
                .payment-success-glow {
                    position: absolute;
                    border-radius: 9999px;
                    filter: blur(90px);
                    opacity: 0.8;
                    animation: paymentSuccessFloat 8s ease-in-out infinite;
                }
                .payment-success-glow-left {
                    width: 26rem; height: 26rem;
                    left: -8rem; top: -6rem;
                    background: rgba(41, 216, 213, 0.2);
                }
                .payment-success-glow-right {
                    width: 28rem; height: 28rem;
                    right: -10rem; top: 32%;
                    background: rgba(68, 243, 240, 0.16);
                    animation-delay: 1.2s;
                }
                .payment-success-grid {
                    position: absolute; inset: 0;
                    background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
                    background-size: 48px 48px;
                    mask-image: radial-gradient(circle at center, black 48%, transparent 100%);
                }
                .payment-success-float { animation: paymentSuccessFloat 5.5s ease-in-out infinite; }
                .payment-success-float-delayed { animation: paymentSuccessFloat 6.4s ease-in-out infinite; animation-delay: 0.9s; }

                /* Pending state animations */
                @keyframes psRingSpin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes psRingPulse {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50%       { opacity: 1;   transform: scale(1.06); }
                }
                @keyframes psGlowPulse {
                    0%, 100% { opacity: 0.5; transform: scale(0.95); }
                    50%       { opacity: 1;   transform: scale(1.05); }
                }
                @keyframes psProgressSlide {
                    0%   { background-position: 200% center; }
                    100% { background-position: -200% center; }
                }
                @keyframes psDot {
                    0%, 80%, 100% { opacity: 0.2; transform: translateY(0); }
                    40%            { opacity: 1;   transform: translateY(-3px); }
                }

                /* Activated state animations */
                @keyframes psSuccessPop {
                    from { opacity: 0; transform: scale(0.5); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes psCheckDraw {
                    from { stroke-dashoffset: 100; opacity: 0; }
                    to   { stroke-dashoffset: 0;   opacity: 1; }
                }
                @keyframes paymentSuccessFloat {
                    0%, 100% { transform: translateY(0px); }
                    50%       { transform: translateY(-6px); }
                }
                @keyframes paymentSuccessSlideUp {
                    from { opacity: 0; transform: translateY(14px); }
                    to   { opacity: 1; transform: translateY(0px); }
                }
            `}</style>
        </div>
    );
};

export default PaymentSuccess;