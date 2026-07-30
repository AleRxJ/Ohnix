import { Layout } from "antd";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const { Content } = Layout;

const Precios = () => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();

    const plans = [
        {
            key: "starter",
            name: t("landing.pricing.plans.starter.name"),
            price: t("landing.pricing.plans.starter.price"),
            billing: t("landing.pricing.plans.starter.billing"),
            description: t("landing.pricing.plans.starter.description"),
            cta: "Empezar gratis",
        },
        {
            key: "growth",
            name: t("landing.pricing.plans.growth.name"),
            price: t("landing.pricing.plans.growth.price"),
            billing: t("landing.pricing.plans.growth.billing"),
            description: t("landing.pricing.plans.growth.description"),
            cta: "Escalar operacion",
            featured: true,
        },
        {
            key: "enterprise",
            name: t("landing.pricing.plans.enterprise.name"),
            price: t("landing.pricing.plans.enterprise.price"),
            billing: t("landing.pricing.plans.enterprise.billing"),
            description: t("landing.pricing.plans.enterprise.description"),
            cta: "Hablar con ventas",
        },
    ];

    const description =
        "Conoce los planes de Ohnix para controlar inventario, compras y ventas en pymes con claridad operativa y escalabilidad.";

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: "Inicio",
                item: "https://www.ohnix.co/",
            },
            {
                "@type": "ListItem",
                position: 2,
                name: "Precios",
                item: "https://www.ohnix.co/precios",
            },
        ],
    };

    return (
        <Layout className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Precios de Ohnix | Planes para inventario y ventas"
                description={description}
                canonicalPath="/precios"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <Content className="bg-[#050505] pt-20">
                <ContentSection id="precios" shell={false}>
                    <SectionHeading
                        align="left"
                        eyebrow="PLANES OHNIX"
                        title="Precios claros para cada etapa operativa"
                        description={description}
                    />

                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {plans.map((plan) => (
                            <article
                                key={plan.key}
                                className={`rounded-[28px] border p-7 ${
                                    plan.featured
                                        ? "border-[#29D8D5]/40 bg-[#29D8D5]/10"
                                        : "border-white/10 bg-white/[0.03]"
                                }`}
                            >
                                <h2 className="text-2xl font-semibold text-white">{plan.name}</h2>
                                <p className="mt-3 text-4xl font-semibold text-white">{plan.price}</p>
                                <p className="mt-1 text-sm text-[#A9B3B8]">{plan.billing}</p>
                                <p className="mt-4 text-sm leading-7 text-[#D4DBDF]">{plan.description}</p>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/signup?plan=${plan.key}&source=seo-precios`)}
                                    className={`mt-7 w-full rounded-full px-5 py-3 text-sm font-semibold ${
                                        plan.featured
                                            ? "bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                                            : "border border-white/15 bg-white/[0.03] text-white hover:border-[#29D8D5]/40"
                                    }`}
                                >
                                    {plan.cta}
                                </button>
                            </article>
                        ))}
                    </div>

                    <div className="mt-12 rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                        <h2 className="text-xl font-semibold text-white">Necesitas un plan personalizado?</h2>
                        <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                            Si manejas mayor volumen operativo, integraciones o soporte dedicado, nuestro equipo puede ayudarte con una configuracion a la medida.
                        </p>
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/demo")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver demo
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/software-inventario-pymes")}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Ver solucion para pymes
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/blog")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver guias de implementacion
                            </button>
                        </div>
                    </div>
                </ContentSection>
            </Content>
            <Footer />
        </Layout>
    );
};

export default Precios;
