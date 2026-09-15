import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

// Prices mirror the fallback in Backend/services/certificateOrderPayment.service.js
// (EPAYCO_AMOUNT_CERTIFICATE_1_YEAR_COP / _2_YEARS_COP) - keep both in sync if
// those env vars ever change in Render.
const CERTIFICATE_PRICE_1_YEAR = 150000;
const CERTIFICATE_PRICE_2_YEARS = 220000;

const formatCOP = (amount) => `$${amount.toLocaleString("es-CO")}`;

const CertificadosDigitales = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Certificado digital para facturacion electronica DIAN en Colombia. Gestiona la firma de tus documentos electronicos desde Ohnix, con emision y renovacion a 1 o 2 años, sin necesidad de usar nuestro modulo de inventario.";

    const plans = [
        {
            key: "1-year",
            label: "1 año de vigencia",
            price: formatCOP(CERTIFICATE_PRICE_1_YEAR),
            detail: "Ideal si facturas de forma regular y prefieres renovar cada año.",
        },
        {
            key: "2-years",
            label: "2 años de vigencia",
            price: formatCOP(CERTIFICATE_PRICE_2_YEARS),
            detail: "La opcion mas usada: menos renovaciones y continuidad para tu operacion.",
            featured: true,
        },
    ];

    const benefits = [
        {
            title: "Habilitado para la DIAN",
            detail: "El certificado queda asociado a tu empresa dentro de Ohnix y respalda la firma de tus documentos electronicos ante la DIAN.",
        },
        {
            title: "Sin necesidad de usar el inventario",
            detail: "Puedes comprar y activar tu certificado aunque no uses el modulo de inventario de Ohnix: solo necesitas una cuenta y tu configuracion fiscal.",
        },
        {
            title: "Activacion desde un solo lugar",
            detail: "Compra, pago y activacion del certificado se hacen desde el panel de configuracion fiscal, sin tramites externos ni archivos que instalar por tu cuenta.",
        },
        {
            title: "Vigencia a tu medida",
            detail: "Elige 1 o 2 años segun tu volumen de facturacion y te avisamos antes de que tu certificado venza.",
        },
    ];

    const faq = [
        {
            q: "Necesito usar el inventario de Ohnix para comprar un certificado digital?",
            a: "No. El certificado digital esta ligado a tu empresa y a tu configuracion fiscal, no al modulo de inventario. Puedes usarlo aunque factures desde otro sistema o solo factures manualmente.",
        },
        {
            q: "Cual es la diferencia entre el certificado de 1 y de 2 años?",
            a: `El de 1 año cuesta ${formatCOP(CERTIFICATE_PRICE_1_YEAR)} y el de 2 años ${formatCOP(CERTIFICATE_PRICE_2_YEARS)}. Ambos cumplen el mismo proposito; el de 2 años simplemente reduce cuantas veces tienes que renovar.`,
        },
        {
            q: "Como se activa el certificado despues de comprarlo?",
            a: "Una vez confirmado el pago, el certificado queda activo en tu configuracion fiscal y disponible para respaldar la emision de tus documentos electronicos ante la DIAN.",
        },
        {
            q: "Puedo comprar el certificado si todavia no facturo electronicamente con Ohnix?",
            a: "Si. Puedes crear tu cuenta, completar tu configuracion fiscal y comprar el certificado como primer paso, incluso antes de emitir tu primera factura electronica.",
        },
    ];

    const structuredData = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                {
                    "@type": "ListItem",
                    position: 1,
                    name: "Inicio",
                    item: "https://ohnix.co/",
                },
                {
                    "@type": "ListItem",
                    position: 2,
                    name: "Certificado digital DIAN",
                    item: "https://ohnix.co/certificado-digital-dian",
                },
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Certificado digital Ohnix para facturacion electronica DIAN",
            description,
            brand: { "@type": "Brand", name: "Ohnix" },
            image: "https://ohnix.co/Ohnix_FullLogo_Transparent.png",
            offers: [
                {
                    "@type": "Offer",
                    name: "Certificado digital 1 año",
                    url: "https://ohnix.co/certificado-digital-dian",
                    priceCurrency: "COP",
                    price: String(CERTIFICATE_PRICE_1_YEAR),
                    availability: "https://schema.org/InStock",
                    seller: { "@type": "Organization", name: "Ohnix", url: "https://ohnix.co" },
                },
                {
                    "@type": "Offer",
                    name: "Certificado digital 2 años",
                    url: "https://ohnix.co/certificado-digital-dian",
                    priceCurrency: "COP",
                    price: String(CERTIFICATE_PRICE_2_YEARS),
                    availability: "https://schema.org/InStock",
                    seller: { "@type": "Organization", name: "Ohnix", url: "https://ohnix.co" },
                },
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: item.a,
                },
            })),
        },
    ];

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Certificado digital para facturacion electronica DIAN | Ohnix"
                description={description}
                canonicalPath="/certificado-digital-dian"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="certificado-digital-dian" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="CERTIFICADO DIGITAL"
                        title="Certificado digital para facturar ante la DIAN"
                        description={description}
                    />

                    <div className="mt-10 grid gap-5 md:grid-cols-2">
                        {plans.map((plan) => (
                            <article
                                key={plan.key}
                                className={`rounded-[28px] border p-7 ${
                                    plan.featured
                                        ? "border-[#29D8D5]/40 bg-[#29D8D5]/10"
                                        : "border-white/10 bg-white/[0.03]"
                                }`}
                            >
                                <h2 className="text-xl font-semibold text-white">{plan.label}</h2>
                                <div className="mt-3 flex items-baseline gap-1.5">
                                    <span className="text-4xl font-semibold text-white">{plan.price}</span>
                                    <span className="inline-flex items-center rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[#44F3F0]">
                                        COP
                                    </span>
                                </div>
                                <p className="mt-4 text-sm leading-7 text-[#D4DBDF]">{plan.detail}</p>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/signup?source=seo-certificado-digital-${plan.key}`)}
                                    className={`mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold ${
                                        plan.featured
                                            ? "bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                                            : "border border-white/15 bg-white/[0.03] text-white hover:border-[#29D8D5]/40"
                                    }`}
                                >
                                    Crear cuenta y comprar
                                </button>
                            </article>
                        ))}
                    </div>

                    <div className="mt-12 grid gap-5 md:grid-cols-2">
                        {benefits.map((item) => (
                            <article
                                key={item.title}
                                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6"
                            >
                                <h2 className="text-xl font-semibold text-white">{item.title}</h2>
                                <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{item.detail}</p>
                            </article>
                        ))}
                    </div>

                    <p className="mt-8 text-sm text-[#6B7880]">
                        Buscas facturar electronicamente ante la DIAN?{" "}
                        <Link
                            to="/facturacion-electronica-dian"
                            className="text-[#44F3F0] underline underline-offset-2 hover:text-white"
                        >
                            Conoce nuestras opciones de facturacion
                        </Link>
                        .
                    </p>

                    <div className="mt-12">
                        <h2 className="text-2xl font-semibold text-white">Preguntas frecuentes</h2>
                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            {faq.map((item) => (
                                <article
                                    key={item.q}
                                    className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                                >
                                    <h3 className="text-base font-semibold text-white">{item.q}</h3>
                                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{item.a}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </ContentSection>
            </main>
            <Footer />
        </div>
    );
};

export default CertificadosDigitales;
