import { useNavigate } from "react-router-dom";
import { useState } from "react";
import useI18n from "../hooks/useI18n";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import {
    OrbitalHero,
    CardGrid,
    PricingSection,
    CycleTimelineSection,
    ImpactMetricsSection,
    TestimonialsSection,
    FaqSection,
    ContactSection,
    MobileStickyCta,
    SectionHeading,
    ContentSection,
    brandIcons,
    VideoModal,
    MarqueeStrip,
    HeroDashboard,
    PageOrbitalLayer,
    FeatureHubSection,
    WhatsAppSupportButton,
    ContactFormSection,
} from "../components/landing/LandingPageSections";

const LandingPage = () => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();
    const [showDemo, setShowDemo] = useState(false);

    const handleGetStarted = () => {
        navigate("/signup");
    };

    const handleWatchDemo = () => {
        setShowDemo(true);
    };

    const marqueeItems = [
        t("landing.hero.orbit.nodeOne"),
        t("landing.hero.orbit.nodeTwo"),
        t("landing.hero.orbit.nodeThree"),
        t("landing.solutions.items.lifecycle.title"),
        t("landing.solutions.items.assets.title"),
        t("landing.solutions.items.sustainability.title"),
        t("landing.solutions.items.circular.title"),
        t("landing.impact.metrics.uptime.label"),
        t("landing.impact.metrics.recovery.label"),
        t("landing.impact.metrics.optimization.label"),
    ];

    const handlePlanCta = (planKey) => {
        const normalizedPlan = ["starter", "growth", "scale", "enterprise"].includes(planKey)
            ? planKey
            : "starter";

        navigate(`/signup?plan=${normalizedPlan}&source=landing-pricing`);
    };

    const heroStats = [
        {
            value: t("landing.hero.stats.cycles.value"),
            label: t("landing.hero.stats.cycles.label"),
        },
        {
            value: t("landing.hero.stats.assets.value"),
            label: t("landing.hero.stats.assets.label"),
        },
        {
            value: t("landing.hero.stats.sustainability.value"),
            label: t("landing.hero.stats.sustainability.label"),
        },
    ];

    const orbitLabels = [
        t("landing.hero.orbit.nodeOne"),
        t("landing.hero.orbit.nodeTwo"),
        t("landing.hero.orbit.nodeThree"),
    ];

    const impactMetrics = [
        {
            value: t("landing.impact.metrics.uptime.value"),
            label: t("landing.impact.metrics.uptime.label"),
            description: t("landing.impact.metrics.uptime.description"),
        },
        {
            value: t("landing.impact.metrics.recovery.value"),
            label: t("landing.impact.metrics.recovery.label"),
            description: t("landing.impact.metrics.recovery.description"),
        },
        {
            value: t("landing.impact.metrics.optimization.value"),
            label: t("landing.impact.metrics.optimization.label"),
            description: t("landing.impact.metrics.optimization.description"),
        },
        {
            value: t("landing.impact.metrics.adoption.value"),
            label: t("landing.impact.metrics.adoption.label"),
            description: t("landing.impact.metrics.adoption.description"),
        },
    ];

    const featureCards = [
        {
            title: t("landing.solutions.items.lifecycle.title"),
            description: t("landing.solutions.items.lifecycle.description"),
            icon: brandIcons.assets,
        },
        {
            title: t("landing.solutions.items.assets.title"),
            description: t("landing.solutions.items.assets.description"),
            icon: brandIcons.connect,
        },
        {
            title: t("landing.solutions.items.sustainability.title"),
            description: t("landing.solutions.items.sustainability.description"),
            icon: brandIcons.lifecycle,
        },
        {
            title: t("landing.solutions.items.circular.title"),
            description: t("landing.solutions.items.circular.description"),
            icon: brandIcons.observability,
        },
    ];

    const timelineSteps = [
        {
            title: t("landing.timeline.steps.observe.title"),
            description: t("landing.timeline.steps.observe.description"),
            icon: brandIcons.facility,
        },
        {
            title: t("landing.timeline.steps.connect.title"),
            description: t("landing.timeline.steps.connect.description"),
            icon: brandIcons.connect,
        },
        {
            title: t("landing.timeline.steps.optimize.title"),
            description: t("landing.timeline.steps.optimize.description"),
            icon: brandIcons.action,
        },
        {
            title: t("landing.timeline.steps.regenerate.title"),
            description: t("landing.timeline.steps.regenerate.description"),
            icon: brandIcons.observability,
        },
    ];

    const faqItems = [
        {
            question: t("landing.faq.items.first.question"),
            answer: t("landing.faq.items.first.answer"),
        },
        {
            question: t("landing.faq.items.second.question"),
            answer: t("landing.faq.items.second.answer"),
        },
        {
            question: t("landing.faq.items.third.question"),
            answer: t("landing.faq.items.third.answer"),
        },
        {
            question: t("landing.faq.items.fourth.question"),
            answer: t("landing.faq.items.fourth.answer"),
        },
    ];

    const testimonials = [
        {
            name: t("landing.testimonials.items.first.name"),
            role: t("landing.testimonials.items.first.role"),
            content: t("landing.testimonials.items.first.content"),
        },
        {
            name: t("landing.testimonials.items.second.name"),
            role: t("landing.testimonials.items.second.role"),
            content: t("landing.testimonials.items.second.content"),
        },
        {
            name: t("landing.testimonials.items.third.name"),
            role: t("landing.testimonials.items.third.role"),
            content: t("landing.testimonials.items.third.content"),
        },
    ];

    const pricingPlans = [
        {
            key: "starter",
            name: t("landing.pricing.plans.starter.name"),
            subtitle: t("landing.pricing.plans.starter.subtitle"),
            price: t("landing.pricing.plans.starter.price"),
            billing: t("landing.pricing.plans.starter.billing"),
            description: t("landing.pricing.plans.starter.description"),
            features: [
                t("landing.pricing.plans.starter.features.limits"),
                t("landing.pricing.plans.starter.features.core"),
                t("landing.pricing.plans.starter.features.reports"),
                t("landing.pricing.plans.starter.features.pdf"),
                t("landing.pricing.plans.starter.features.alerts"),
                t("landing.pricing.plans.starter.features.support"),
            ],
            cta: t("landing.pricing.plans.starter.cta"),
            note: t("landing.pricing.trial_note"),
            icon: brandIcons.action,
        },
        {
            key: "growth",
            name: t("landing.pricing.plans.growth.name"),
            subtitle: t("landing.pricing.plans.growth.subtitle"),
            price: t("landing.pricing.plans.growth.price"),
            billing: t("landing.pricing.plans.growth.billing"),
            description: t("landing.pricing.plans.growth.description"),
            features: [
                t("landing.pricing.plans.growth.features.unlimited"),
                t("landing.pricing.plans.growth.features.limits"),
                t("landing.pricing.plans.growth.features.reports"),
                t("landing.pricing.plans.growth.features.export"),
                t("landing.pricing.plans.growth.features.pdf"),
                t("landing.pricing.plans.growth.features.alerts"),
                t("landing.pricing.plans.growth.features.invoicing"),
                t("landing.pricing.plans.growth.features.support"),
            ],
            cta: t("landing.pricing.plans.growth.cta"),
            icon: brandIcons.observability,
            featured: true,
        },
        {
            key: "scale",
            name: t("landing.pricing.plans.scale.name"),
            subtitle: t("landing.pricing.plans.scale.subtitle"),
            price: t("landing.pricing.plans.scale.price"),
            billing: t("landing.pricing.plans.scale.billing"),
            description: t("landing.pricing.plans.scale.description"),
            features: [
                t("landing.pricing.plans.scale.features.unlimited"),
                t("landing.pricing.plans.scale.features.limits"),
                t("landing.pricing.plans.scale.features.reports"),
                t("landing.pricing.plans.scale.features.pdf"),
                t("landing.pricing.plans.scale.features.api"),
                t("landing.pricing.plans.scale.features.alerts"),
                t("landing.pricing.plans.scale.features.invoicing"),
                t("landing.pricing.plans.scale.features.support"),
            ],
            cta: t("landing.pricing.plans.scale.cta"),
            icon: brandIcons.adaptive,
        },
        {
            key: "enterprise",
            name: t("landing.pricing.plans.enterprise.name"),
            subtitle: t("landing.pricing.plans.enterprise.subtitle"),
            price: t("landing.pricing.plans.enterprise.price"),
            billing: t("landing.pricing.plans.enterprise.billing"),
            description: t("landing.pricing.plans.enterprise.description"),
            features: [
                t("landing.pricing.plans.enterprise.features.unlimited"),
                t("landing.pricing.plans.enterprise.features.api"),
                t("landing.pricing.plans.enterprise.features.integrations"),
                t("landing.pricing.plans.enterprise.features.manager"),
                t("landing.pricing.plans.enterprise.features.sla"),
                t("landing.pricing.plans.enterprise.features.onboarding"),
            ],
            cta: t("landing.pricing.plans.enterprise.cta"),
            icon: brandIcons.trust,
        },
    ];

    const landingDescription =
        "Ohnix centraliza inventario, compras, pedidos y reportes para pymes en una sola plataforma con trazabilidad en tiempo real.";

    const faqStructuredData = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
            },
        })),
    };

    const organizationStructuredData = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Ohnix",
        url: "https://www.ohnix.co",
        logo: "https://www.ohnix.co/Ohnix_FullLogo.png",
        contactPoint: {
            "@type": "ContactPoint",
            contactType: "sales",
            email: "alejandrovallejo10@outlook.com",
            availableLanguage: ["es", "en"],
        },
    };

    const softwareStructuredData = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Ohnix",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
        description: landingDescription,
        url: "https://www.ohnix.co",
    };

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Software de inventario y ventas para pymes | Ohnix"
                description={landingDescription}
                canonicalPath="/"
                lang={currentLanguage || "es"}
                structuredData={[
                    organizationStructuredData,
                    softwareStructuredData,
                    faqStructuredData,
                ]}
            />
            <PageOrbitalLayer />
            <VideoModal
                isOpen={showDemo}
                onClose={() => setShowDemo(false)}
                /* Replace the src below with your real YouTube URL, e.g:
                   src="https://www.youtube.com/watch?v=YOUR_VIDEO_ID"
                   Leave src undefined to show the "coming soon" placeholder */
                src={undefined}
                title="Demo Ohnix"
            />
            <Navbar />
            <main className="bg-[#050505] pb-24 md:pb-0">
                <OrbitalHero
                    eyebrow={t("landing.hero.eyebrow")}
                    title={t("landing.hero.title")}
                    subtitle={t("landing.hero.subtitle")}
                    primaryCta={t("landing.hero.primary_cta")}
                    secondaryCta={t("landing.hero.secondary_cta")}
                    onPrimary={handleGetStarted}
                    onSecondary={handleWatchDemo}
                    stats={heroStats}
                    orbitLabels={orbitLabels}
                    footerNote={t("landing.hero.footer_note")}
                    productImageAlt={t("landing.hero.product_image_alt")}
                    heroVisual={<HeroDashboard />}
                    cyclingWords={["Inventario", "Activos", "Operaciones", "Almacén"]}
                />

                <MarqueeStrip items={marqueeItems} />

                <ImpactMetricsSection
                    heading={{
                        eyebrow: t("landing.impact.eyebrow"),
                        title: t("landing.impact.title"),
                        description: t("landing.impact.description"),
                    }}
                    metrics={impactMetrics}
                />

                <FeatureHubSection
                    heading={{
                        eyebrow: t("landing.hub.eyebrow", "CAPACIDADES AVANZADAS"),
                        title: t("landing.hub.title", "Hub de Funcionalidades"),
                        description: t("landing.hub.description", "Herramientas poderosas para potenciar tu negocio"),
                    }}
                />

                <ContentSection id="features">
                    <SectionHeading
                        eyebrow={t("landing.solutions.eyebrow")}
                        title={t("landing.solutions.title")}
                        description={t("landing.solutions.description")}
                    />
                    <div className="mt-14">
                        <CardGrid items={featureCards} columns={4} />
                    </div>
                </ContentSection>

                <CycleTimelineSection
                    heading={{
                        eyebrow: t("landing.timeline.eyebrow"),
                        title: t("landing.timeline.title"),
                        description: t("landing.timeline.description"),
                    }}
                    steps={timelineSteps}
                />

                <PricingSection
                    heading={{
                        eyebrow: t("landing.pricing.eyebrow"),
                        title: t("landing.pricing.title"),
                        description: t("landing.pricing.description"),
                    }}
                    plans={pricingPlans}
                    featuredLabel={t("landing.pricing.most_popular")}
                    onPlanSelect={handlePlanCta}
                />

                <FaqSection
                    heading={{
                        eyebrow: t("landing.faq.eyebrow"),
                        title: t("landing.faq.title"),
                        description: t("landing.faq.description"),
                    }}
                    items={faqItems}
                />

                <TestimonialsSection
                    heading={{
                        eyebrow: t("landing.testimonials.eyebrow"),
                        title: t("landing.testimonials.title"),
                        description: t("landing.testimonials.description"),
                    }}
                    testimonials={testimonials}
                />

                <ContactFormSection
                    heading={{
                        eyebrow: t("landing.contact.eyebrow", "COMIENZA HOY"),
                        title: t("landing.contact.title", "Únete a Ohnix"),
                        description: t("landing.contact.description", "Contacta con nuestro equipo para empezar tu transformación"),
                    }}
                    contact={{
                        email: "alejandrovallejo10@outlook.com",
                    }}
                />

                <section className="px-6 pb-16 md:px-10">
                    <div className="mx-auto max-w-7xl rounded-[24px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
                        <h2 className="text-2xl font-semibold text-white">Explora rutas clave de Ohnix</h2>
                        <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                            Compara planes, revisa la solucion para pymes y evalua nuestra comparativa para tomar una mejor decision.
                        </p>
                        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            <button
                                type="button"
                                onClick={() => navigate("/software-inventario-pymes")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">Software para pymes</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">Inventario, compras y pedidos en un flujo.</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/facturacion-electronica-dian")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">Facturación electrónica DIAN</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">Facturas válidas ante la DIAN desde tus pedidos.</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/precios")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">Planes y precios</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">Elige el plan que se ajusta a tu etapa.</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/comparativa/ohnix-vs-alegra")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">Comparativa Ohnix vs Alegra</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">Evalua diferencias por enfoque operativo.</span>
                            </button>
                        </div>
                    </div>
                </section>

                <WhatsAppSupportButton
                    phoneNumber="+573142193936"
                    message="Hola, vi Ohnix y tengo preguntas 👋"
                />
            </main>
            <MobileStickyCta
                primaryCta={t("landing.hero.primary_cta")}
                secondaryCta={t("landing.hero.secondary_cta")}
                onPrimary={handleGetStarted}
                onSecondary={handleWatchDemo}
            />
            <Footer />
        </div>
    );
};

export default LandingPage;
