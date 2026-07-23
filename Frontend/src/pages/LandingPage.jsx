import { Layout } from "antd";
import { useNavigate } from "react-router-dom";
import useI18n from "../hooks/useI18n";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import {
    OrbitalHero,
    CardGrid,
    CycleTimelineSection,
    ImpactMetricsSection,
    TestimonialsSection,
    FaqSection,
    ContactSection,
    MobileStickyCta,
    SectionHeading,
    ContentSection,
    brandIcons,
} from "../components/landing/LandingPageSections";

const { Content } = Layout;

const LandingPage = () => {
    const navigate = useNavigate();
    const { t } = useI18n();

    const handleGetStarted = () => {
        navigate("/signup");
    };

    const handleWatchDemo = () => {
        navigate("/demo");
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

    return (
        <Layout className="min-h-screen bg-[#050505]">
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
                />

                <ImpactMetricsSection
                    heading={{
                        eyebrow: t("landing.impact.eyebrow"),
                        title: t("landing.impact.title"),
                        description: t("landing.impact.description"),
                    }}
                    metrics={impactMetrics}
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

                <ContactSection
                    heading={{
                        eyebrow: t("landing.contact.eyebrow"),
                        title: t("landing.contact.title"),
                        description: t("landing.contact.description"),
                    }}
                    primaryCta={t("landing.contact.primary_cta")}
                    secondaryCta={t("landing.contact.secondary_cta")}
                    onPrimary={handleGetStarted}
                    onSecondary={handleWatchDemo}
                    contact={{
                        emailLabel: t("landing.contact.email_label"),
                        email: t("landing.contact.email"),
                        signalLabel: t("landing.contact.signal_label"),
                        signalDescription: t("landing.contact.signal_description"),
                    }}
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
