import { Layout } from "antd";
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

const { Content } = Layout;

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
        const normalizedPlan = ["starter", "growth", "enterprise"].includes(planKey)
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
                t("landing.pricing.plans.starter.features.workspace"),
                t("landing.pricing.plans.starter.features.tracking"),
                t("landing.pricing.plans.starter.features.support"),
                t("landing.pricing.plans.starter.features.access"),
            ],
            cta: t("landing.pricing.plans.starter.cta"),
            icon: brandIcons.pricing,
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
                t("landing.pricing.plans.growth.features.reports"),
                t("landing.pricing.plans.growth.features.priority"),
                t("landing.pricing.plans.growth.features.mobile"),
            ],
            cta: t("landing.pricing.plans.growth.cta"),
            icon: brandIcons.growth,
            featured: true,
        },
        {
            key: "enterprise",
            name: t("landing.pricing.plans.enterprise.name"),
            subtitle: t("landing.pricing.plans.enterprise.subtitle"),
            price: t("landing.pricing.plans.enterprise.price"),
            billing: t("landing.pricing.plans.enterprise.billing"),
            description: t("landing.pricing.plans.enterprise.description"),
            features: [
                t("landing.pricing.plans.enterprise.features.onboarding"),
                t("landing.pricing.plans.enterprise.features.implementation"),
                t("landing.pricing.plans.enterprise.features.workflows"),
                t("landing.pricing.plans.enterprise.features.integrations"),
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
        <Layout className="min-h-screen bg-[#050505]">
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
            <Content className="bg-[#050505] pb-24 md:pb-0">
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

                <WhatsAppSupportButton
                    phoneNumber="+573142193936"
                    message="Hola, vi Ohnix y tengo preguntas 👋"
                />
            </Content>
            <MobileStickyCta
                primaryCta={t("landing.hero.primary_cta")}
                secondaryCta={t("landing.hero.secondary_cta")}
                onPrimary={handleGetStarted}
                onSecondary={handleWatchDemo}
            />
            <Footer />
        </Layout>
    );
};

export default LandingPage;
