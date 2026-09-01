import { useNavigate } from "react-router-dom";
import { useState } from "react";
import useI18n from "../hooks/useI18n";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import { useMarketPricing } from "../hooks/useMarketPricing";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";
import BillingCycleToggle from "../components/common/BillingCycleToggle";
import {
    OrbitalHero,
    CardGrid,
    PricingSection,
    CycleTimelineSection,
    ImpactMetricsSection,
    UseCasesSection,
    ComparisonTeaserSection,
    FaqSection,
    ContactSection,
    MobileStickyCta,
    SectionHeading,
    ContentSection,
    brandIcons,
    MarqueeStrip,
    OhnixCommandCanvas,
    PageOrbitalLayer,
    FeatureHubSection,
    WhatsAppSupportButton,
    ContactFormSection,
} from "../components/landing/LandingPageSections";

const LandingPage = () => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();
    // Shared with Precios.jsx so the landing pricing teaser and the full
    // pricing page never disagree (previously this section always showed
    // the static USD-labeled locale strings regardless of visitor country).
    const { priceByPlanKey } = useMarketPricing();
    const [billingCycle, setBillingCycle] = useState("MONTHLY");

    // "$" alone is ambiguous between USD and COP - PricingSection renders
    // planPrice() as a currencyBadge pill next to the amount when set.
    // `fallback` is itself now a COP reference price (see locales/*/common.json)
    // shown while market pricing resolves or if it fails, so it gets the same
    // "COP" badge as a resolved COP price - not `null`, which used to read as
    // an unqualified (and easily misread as USD) dollar amount.
    // While ANNUAL is selected, shows the per-month equivalent of the lump
    // annual charge ("paga 10, lleva 12") - same logic as Precios.jsx.
    const planPrice = (planKey, fallback) => {
        const priceInfo = priceByPlanKey[planKey];
        if (billingCycle === "ANNUAL" && priceInfo?.annualEquivalentMonthlyLabel) {
            return {
                price: priceInfo.annualEquivalentMonthlyLabel,
                currencyBadge: priceInfo.currency === "COP" ? "COP" : null,
                billingSuffix: t("landing.pricing.annual_suffix"),
                savings: priceInfo.annualSavingsLabel
                    ? t("landing.pricing.annual_savings", { amount: priceInfo.annualSavingsLabel })
                    : null,
            };
        }
        if (!priceInfo) return { price: fallback, currencyBadge: "COP" };
        return { price: priceInfo.label, currencyBadge: priceInfo.currency === "COP" ? "COP" : null };
    };

    const handleGetStarted = () => {
        navigate("/signup");
    };

    const marqueeItems = [
        t("landing.hero.orbit.nodeOne"),
        t("landing.hero.orbit.nodeTwo"),
        t("landing.hero.orbit.nodeThree"),
        t("landing.solutions.items.products.title"),
        t("landing.solutions.items.purchases.title"),
        t("landing.solutions.items.sales.title"),
        t("landing.solutions.items.reports.title"),
        t("landing.impact.metrics.uptime.label"),
        t("landing.impact.metrics.unifiedOps.label"),
        t("landing.impact.metrics.manualWork.label"),
    ];

    const handlePlanCta = (planKey) => {
        const normalizedPlan = ["starter", "growth", "scale", "enterprise"].includes(planKey)
            ? planKey
            : "starter";

        navigate(`/signup?plan=${normalizedPlan}&billingCycle=${billingCycle}&source=landing-pricing`);
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
            value: t("landing.impact.metrics.unifiedOps.value"),
            label: t("landing.impact.metrics.unifiedOps.label"),
            description: t("landing.impact.metrics.unifiedOps.description"),
        },
        {
            value: t("landing.impact.metrics.manualWork.value"),
            label: t("landing.impact.metrics.manualWork.label"),
            description: t("landing.impact.metrics.manualWork.description"),
        },
        {
            value: t("landing.impact.metrics.accessControl.value"),
            label: t("landing.impact.metrics.accessControl.label"),
            description: t("landing.impact.metrics.accessControl.description"),
        },
    ];

    const featureCards = [
        {
            title: t("landing.solutions.items.products.title"),
            description: t("landing.solutions.items.products.description"),
            icon: brandIcons.assets,
        },
        {
            title: t("landing.solutions.items.purchases.title"),
            description: t("landing.solutions.items.purchases.description"),
            icon: brandIcons.connect,
        },
        {
            title: t("landing.solutions.items.sales.title"),
            description: t("landing.solutions.items.sales.description"),
            icon: brandIcons.lifecycle,
        },
        {
            title: t("landing.solutions.items.reports.title"),
            description: t("landing.solutions.items.reports.description"),
            icon: brandIcons.observability,
        },
        {
            title: t("landing.solutions.items.finance.title"),
            description: t("landing.solutions.items.finance.description"),
            icon: brandIcons.accounting,
        },
        {
            title: t("landing.solutions.items.compliance.title"),
            description: t("landing.solutions.items.compliance.description"),
            icon: brandIcons.compliance,
        },
    ];

    const differentiatorCards = [
        {
            title: t("landing.differentiators.items.dian.title"),
            description: t("landing.differentiators.items.dian.description"),
            icon: brandIcons.trust,
        },
        {
            title: t("landing.differentiators.items.assistant.title"),
            description: t("landing.differentiators.items.assistant.description"),
            icon: brandIcons.assistant,
        },
        {
            title: t("landing.differentiators.items.integrations.title"),
            description: t("landing.differentiators.items.integrations.description"),
            icon: brandIcons.api,
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
        {
            question: t("landing.faq.items.fifth.question"),
            answer: t("landing.faq.items.fifth.answer"),
        },
        {
            question: t("landing.faq.items.sixth.question"),
            answer: t("landing.faq.items.sixth.answer"),
        },
    ];

    const useCases = [
        {
            context: t("landing.useCases.items.first.context"),
            title: t("landing.useCases.items.first.title"),
            description: t("landing.useCases.items.first.description"),
        },
        {
            context: t("landing.useCases.items.second.context"),
            title: t("landing.useCases.items.second.title"),
            description: t("landing.useCases.items.second.description"),
        },
        {
            context: t("landing.useCases.items.third.context"),
            title: t("landing.useCases.items.third.title"),
            description: t("landing.useCases.items.third.description"),
        },
        {
            context: t("landing.useCases.items.fourth.context"),
            title: t("landing.useCases.items.fourth.title"),
            description: t("landing.useCases.items.fourth.description"),
        },
    ];

    const starterPrice = planPrice("starter", t("landing.pricing.plans.starter.price"));
    const growthPrice = planPrice("growth", t("landing.pricing.plans.growth.price"));
    const scalePrice = planPrice("scale", t("landing.pricing.plans.scale.price"));

    const pricingPlans = [
        {
            key: "starter",
            name: t("landing.pricing.plans.starter.name"),
            subtitle: t("landing.pricing.plans.starter.subtitle"),
            ...starterPrice,
            billing: starterPrice.billingSuffix || t("landing.pricing.plans.starter.billing"),
            description: t("landing.pricing.plans.starter.description"),
            features: [
                t("landing.pricing.plans.starter.features.limits"),
                t("landing.pricing.plans.starter.features.core"),
                t("landing.pricing.plans.starter.features.reports"),
                t("landing.pricing.plans.starter.features.pdf"),
                t("landing.pricing.plans.starter.features.alerts"),
            ].filter(Boolean),
            cta: t("landing.pricing.plans.starter.cta"),
            note: t("landing.pricing.trial_note"),
            icon: brandIcons.action,
        },
        {
            key: "growth",
            name: t("landing.pricing.plans.growth.name"),
            subtitle: t("landing.pricing.plans.growth.subtitle"),
            ...growthPrice,
            billing: growthPrice.billingSuffix || t("landing.pricing.plans.growth.billing"),
            description: t("landing.pricing.plans.growth.description"),
            features: [
                t("landing.pricing.plans.growth.features.unlimited"),
                t("landing.pricing.plans.growth.features.team"),
                t("landing.pricing.plans.growth.features.presence"),
                t("landing.pricing.plans.growth.features.limits"),
                t("landing.pricing.plans.growth.features.reports"),
                t("landing.pricing.plans.growth.features.export"),
                t("landing.pricing.plans.growth.features.pdf"),
                t("landing.pricing.plans.growth.features.alerts"),
                { text: t("landing.pricing.plans.growth.features.sales_quotations"), highlight: true },
                ELECTRONIC_INVOICING_ENABLED && { text: t("landing.pricing.plans.growth.features.invoicing"), highlight: true },
            ].filter(Boolean),
            cta: t("landing.pricing.plans.growth.cta"),
            icon: brandIcons.observability,
            featured: true,
        },
        {
            key: "scale",
            name: t("landing.pricing.plans.scale.name"),
            subtitle: t("landing.pricing.plans.scale.subtitle"),
            ...scalePrice,
            billing: scalePrice.billingSuffix || t("landing.pricing.plans.scale.billing"),
            description: t("landing.pricing.plans.scale.description"),
            features: [
                t("landing.pricing.plans.scale.features.unlimited"),
                t("landing.pricing.plans.scale.features.team"),
                t("landing.pricing.plans.scale.features.presence"),
                t("landing.pricing.plans.scale.features.locations"),
                t("landing.pricing.plans.scale.features.limits"),
                t("landing.pricing.plans.scale.features.reports"),
                t("landing.pricing.plans.scale.features.pdf"),
                { text: t("landing.pricing.plans.scale.features.api"), highlight: true },
                t("landing.pricing.plans.scale.features.sales_quotations"),
                ELECTRONIC_INVOICING_ENABLED && t("landing.pricing.plans.scale.features.invoicing"),
                { text: t("landing.pricing.plans.scale.features.accounting"), highlight: true },
                t("landing.pricing.plans.scale.features.alerts"),
            ].filter(Boolean),
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
                t("landing.pricing.plans.enterprise.features.team"),
                t("landing.pricing.plans.enterprise.features.locations"),
                t("landing.pricing.plans.enterprise.features.api"),
                { text: t("landing.pricing.plans.enterprise.features.integrations"), highlight: true },
                t("landing.pricing.plans.enterprise.features.manager"),
                t("landing.pricing.plans.enterprise.features.sla"),
            ],
            cta: t("landing.pricing.plans.enterprise.cta"),
            icon: brandIcons.trust,
        },
    ];

    const landingDescription = t("landing.seo.description");

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
        url: "https://ohnix.co",
        logo: "https://ohnix.co/Ohnix_FullLogo_Transparent.png",
        contactPoint: {
            "@type": "ContactPoint",
            contactType: "sales",
            email: "info@itcycle.com",
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
        url: "https://ohnix.co",
    };

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title={t("landing.seo.title")}
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
            <Navbar />
            <main className="marketing-main bg-[#050505] pb-24 md:pb-0">
                <OrbitalHero
                    eyebrow={t("landing.hero.eyebrow")}
                    title={t("landing.hero.title")}
                    subtitle={t("landing.hero.subtitle")}
                    primaryCta={t("landing.hero.primary_cta")}
                    onPrimary={handleGetStarted}
                    stats={heroStats}
                    orbitLabels={orbitLabels}
                    footerNote={t("landing.hero.footer_note")}
                    productImageAlt={t("landing.hero.product_image_alt")}
                    heroVisual={<OhnixCommandCanvas />}
                    cyclingWords={[
                        t("landing.hero.cycling_words.one"),
                        t("landing.hero.cycling_words.two"),
                        t("landing.hero.cycling_words.three"),
                        t("landing.hero.cycling_words.four"),
                    ]}
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
                        eyebrow: t("landing.hub.eyebrow"),
                        title: t("landing.hub.title"),
                        description: t("landing.hub.description"),
                    }}
                />

                <ContentSection id="features">
                    <SectionHeading
                        eyebrow={t("landing.solutions.eyebrow")}
                        title={t("landing.solutions.title")}
                        description={t("landing.solutions.description")}
                    />
                    <div className="mt-14">
                        <CardGrid items={featureCards} columns={3} />
                    </div>
                </ContentSection>

                <ContentSection id="differentiators">
                    <SectionHeading
                        eyebrow={t("landing.differentiators.eyebrow")}
                        title={t("landing.differentiators.title")}
                        description={t("landing.differentiators.description")}
                    />
                    <div className="mt-14">
                        <CardGrid items={differentiatorCards} columns={3} />
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
                    billingToggle={<BillingCycleToggle value={billingCycle} onChange={setBillingCycle} savingsLabel="-17%" />}
                />

                <FaqSection
                    heading={{
                        eyebrow: t("landing.faq.eyebrow"),
                        title: t("landing.faq.title"),
                        description: t("landing.faq.description"),
                    }}
                    items={faqItems}
                />

                <UseCasesSection
                    heading={{
                        eyebrow: t("landing.useCases.eyebrow"),
                        title: t("landing.useCases.title"),
                        description: t("landing.useCases.description"),
                    }}
                    useCases={useCases}
                />

                <ContactFormSection
                    heading={{
                        eyebrow: t("landing.contact.eyebrow"),
                        title: t("landing.contact.title"),
                        description: t("landing.contact.description"),
                    }}
                    contact={{
                        email: "info@itcycle.com",
                    }}
                />

                <section className="px-6 pb-16 md:px-10">
                    <div className="mx-auto max-w-[1440px] rounded-[24px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
                        <h2 className="text-2xl font-semibold text-white">{t("landing.explore.title")}</h2>
                        <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                            {t("landing.explore.description")}
                        </p>
                        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            <button
                                type="button"
                                onClick={() => navigate("/software-inventario-pymes")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">{t("landing.explore.pymes.title")}</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">{t("landing.explore.pymes.description")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/precios")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">{t("landing.explore.pricing.title")}</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">{t("landing.explore.pricing.description")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/comparativa/ohnix-vs-alegra")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">{t("landing.explore.comparison.title")}</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">{t("landing.explore.comparison.description")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/integraciones")}
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-4 text-left text-white hover:border-[#29D8D5]/35"
                            >
                                <span className="block text-sm font-semibold">{t("landing.explore.integrations.title")}</span>
                                <span className="mt-1 block text-xs text-[#A9B3B8]">{t("landing.explore.integrations.description")}</span>
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
                onPrimary={handleGetStarted}
            />
            <Footer />
        </div>
    );
};

export default LandingPage;
