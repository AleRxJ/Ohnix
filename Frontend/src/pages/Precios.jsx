import { useNavigate } from "react-router-dom";
import { CheckOutlined } from "@ant-design/icons";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";
import { useMarketPricing } from "../hooks/useMarketPricing";

const Precios = () => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();

    // Market-aware pricing: marketPricing is null until resolved, so the
    // page falls back to the static (USD-reference) locale strings below
    // rather than showing blank prices while detection/fetch is in flight
    // or if either fails - this also matches what the build-time
    // prerenderer (scripts/prerender.js) captures for crawlers if the geo
    // lookup doesn't finish in time. Shared with LandingPage.jsx's pricing
    // teaser so both pages always agree.
    const { marketPricing, priceByPlanKey } = useMarketPricing();

    // "$" alone is ambiguous between USD and COP - rendered as a separate
    // small pill next to the amount (same treatment as the landing page's
    // pricing teaser) instead of concatenated into the same giant string,
    // which used to force "$ 38.000 COP" to wrap mid-price inside the card.
    const planPrice = (planKey, fallback) => {
        const priceInfo = priceByPlanKey[planKey];
        if (!priceInfo) return { price: fallback, currencyBadge: null };
        return { price: priceInfo.label, currencyBadge: priceInfo.currency === "COP" ? "COP" : null };
    };

    const plans = [
        {
            key: "starter",
            name: t("landing.pricing.plans.starter.name"),
            ...planPrice("starter", t("landing.pricing.plans.starter.price")),
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
            cta: "Empezar gratis",
        },
        {
            key: "growth",
            name: t("landing.pricing.plans.growth.name"),
            ...planPrice("growth", t("landing.pricing.plans.growth.price")),
            billing: t("landing.pricing.plans.growth.billing"),
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
                t("landing.pricing.plans.growth.features.invoicing"),
                t("landing.pricing.plans.growth.features.support"),
            ],
            cta: "Escalar operacion",
            featured: true,
        },
        {
            key: "scale",
            name: t("landing.pricing.plans.scale.name"),
            ...planPrice("scale", t("landing.pricing.plans.scale.price")),
            billing: t("landing.pricing.plans.scale.billing"),
            description: t("landing.pricing.plans.scale.description"),
            features: [
                t("landing.pricing.plans.scale.features.unlimited"),
                t("landing.pricing.plans.scale.features.team"),
                t("landing.pricing.plans.scale.features.presence"),
                t("landing.pricing.plans.scale.features.locations"),
                t("landing.pricing.plans.scale.features.limits"),
                t("landing.pricing.plans.scale.features.reports"),
                t("landing.pricing.plans.scale.features.pdf"),
                t("landing.pricing.plans.scale.features.api"),
                t("landing.pricing.plans.scale.features.alerts"),
                t("landing.pricing.plans.scale.features.support"),
            ],
            cta: "Escalar operacion",
        },
        {
            key: "enterprise",
            name: t("landing.pricing.plans.enterprise.name"),
            // Custom/consultative pricing in every market - never a fixed number.
            price: t("landing.pricing.plans.enterprise.price"),
            billing: t("landing.pricing.plans.enterprise.billing"),
            description: t("landing.pricing.plans.enterprise.description"),
            features: [
                t("landing.pricing.plans.enterprise.features.unlimited"),
                t("landing.pricing.plans.enterprise.features.team"),
                t("landing.pricing.plans.enterprise.features.locations"),
                t("landing.pricing.plans.enterprise.features.api"),
                t("landing.pricing.plans.enterprise.features.integrations"),
                t("landing.pricing.plans.enterprise.features.manager"),
                t("landing.pricing.plans.enterprise.features.sla"),
                t("landing.pricing.plans.enterprise.features.onboarding"),
            ],
            cta: "Hablar con ventas",
        },
    ];

    const description =
        "Conoce los planes de Ohnix para controlar inventario, compras y ventas en pymes con claridad operativa y escalabilidad.";

    // Schema.org Offer.price needs a bare number in the market's real
    // currency, not the display string ("$19", "$59.900 COP"). Sourced from
    // the same resolved market pricing as the on-page cards (falls back to
    // the existing USD reference numbers if detection/fetch hasn't
    // resolved yet) so structured data never disagrees with what's shown.
    const offerCurrency = marketPricing?.currency?.toUpperCase() || "USD";
    const offerAmountByPlanKey = marketPricing?.plans
        ? marketPricing.plans.reduce((acc, plan) => {
              if (plan.amount !== null && plan.amount !== undefined) {
                  acc[plan.key] = plan.amount;
              }
              return acc;
          }, {})
        : { starter: 19, growth: 49, scale: 99 };

    const structuredData = [
        {
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
        },
        ...plans
            .filter((plan) => offerAmountByPlanKey[plan.key] !== undefined)
            .map((plan) => ({
                "@context": "https://schema.org",
                "@type": "Product",
                name: `Ohnix ${plan.name}`,
                description: plan.description,
                brand: { "@type": "Brand", name: "Ohnix" },
                offers: {
                    "@type": "Offer",
                    url: "https://www.ohnix.co/precios",
                    priceCurrency: offerCurrency,
                    price: String(offerAmountByPlanKey[plan.key]),
                    priceValidUntil: "2026-12-31",
                    availability: "https://schema.org/InStock",
                },
            })),
    ];

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Precios de Ohnix | Planes para inventario y ventas"
                description={description}
                canonicalPath="/precios"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-20">
                <ContentSection id="precios" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="PLANES OHNIX"
                        title="Precios claros para cada etapa operativa"
                        description={description}
                    />

                    <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
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
                                {/* Price, billing and currency badge always on one
                                    row (flex-nowrap) - the badge is deliberately
                                    compact (tight padding, no letter-spacing) so
                                    even the longest amount ("$200.000 /mes COP")
                                    fits without wrapping, keeping every card's
                                    row identical instead of depending on digit count. */}
                                <div className="mt-3 flex flex-nowrap items-baseline gap-1.5 whitespace-nowrap">
                                    <span className="text-4xl font-semibold text-white">{plan.price}</span>
                                    {plan.billing && (
                                        <span className="text-sm text-[#A9B3B8]">{plan.billing}</span>
                                    )}
                                    {plan.currencyBadge && (
                                        <span className="inline-flex items-center rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[#44F3F0]">
                                            {plan.currencyBadge}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-4 text-sm leading-7 text-[#D4DBDF]">{plan.description}</p>
                                <div className="mt-5 border-t border-white/[0.06]" />
                                <ul className="mt-4 space-y-2">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-[13px] text-[#C4CDD2]">
                                            <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#29D8D5]/15 text-[#44F3F0]">
                                                <CheckOutlined className="text-[7px]" />
                                            </span>
                                            <span className="leading-snug">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
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
            </main>
            <Footer />
        </div>
    );
};

export default Precios;
