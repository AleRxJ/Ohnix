import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

// This is a sales-assisted product today, not self-serve: itcycle-api-dian
// (Ohnix's own DIAN engine) only provisions companies/API keys through an
// internal admin flow (see Backend/routes/companySelf.routes.js and
// itcycle-api-dian's admin.route.ts) - there is no public signup for it yet.
// The CTA below reflects that honestly (talk to the team) instead of
// pointing at Ohnix's own /signup, which would still funnel the visitor
// into the inventory-oriented SaaS this page exists to NOT require.
const CONTACT_EMAIL = "info@itcycle.co";
const CONTACT_SUBJECT = "Quiero integrar la API de facturacion electronica DIAN";
const WHATSAPP_NUMBER = "573142193936";
const WHATSAPP_MESSAGE = "Hola, quiero integrar la API de facturacion electronica DIAN de Ohnix en mi sistema.";
// Real OpenAPI 3.0.3 spec for the customer-facing document endpoints (see
// itcycle-api-dian's src/openapi/spec.ts) - hand-authored from the actual
// TypeScript types, not a marketing mockup. Public, no auth required to view.
const OPENAPI_DOCS_URL = "https://itcycle-api-dian.onrender.com/api/v1/openapi.json";

const formatCOP = (amount) => `$${amount.toLocaleString("es-CO")}`;

const FacturacionSinInventario = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Integra la facturacion electronica DIAN directamente en tu propio software (POS, ERP o plataforma SaaS) a traves de la API de Ohnix, con tecnologia propia habilitada ante la DIAN. Sin usar el dashboard ni el modulo de inventario de Ohnix.";

    const audiences = [
        {
            title: "POS y sistemas de punto de venta",
            detail: "Añade facturacion electronica DIAN a tu propio POS sin construir un motor de facturacion desde cero.",
        },
        {
            title: "ERP y software de gestion",
            detail: "Conecta tu ERP directamente a la API para emitir y validar documentos electronicos como una funcion mas de tu producto.",
        },
        {
            title: "Plataformas SaaS verticales",
            detail: "Ofrece facturacion electronica DIAN a tus propios clientes dentro de tu plataforma, sin depender de otro proveedor visible para ellos.",
        },
    ];

    const documents = [
        "Factura electronica de venta",
        "Nota credito",
        "Nota debito",
        "Documento soporte",
        "Acuse de recibo",
    ];

    const steps = [
        {
            title: "Cuentanos de tu operacion",
            detail: "Volumen estimado de documentos, tipo de negocio y como se integra tu sistema.",
        },
        {
            title: "Aprovisionamos tu empresa",
            detail: "Configuramos tu empresa, certificado digital y numeracion habilitada ante la DIAN.",
        },
        {
            title: "Te entregamos tu API key",
            detail: "Recibes tus credenciales y la documentacion tecnica para integrar los endpoints.",
        },
        {
            title: "Tu sistema empieza a facturar",
            detail: "Tu propio software emite y da seguimiento a los documentos electronicos directamente contra la DIAN.",
        },
    ];

    // Real, published rate - no "hablanos y cotizamos" for the base price.
    // Structure mirrors a real public precedent (Facturama, Mexico: flat
    // base package + a per-document ladder that decreases with volume) since
    // no Colombian competitor (Factus, Alanube) publishes pricing at all -
    // see project_standalone_dian_services memory for the research behind this.
    const BASE_PACKAGE_PRICE = 310000;
    const BASE_PACKAGE_DOCS = 100;
    const priceTiers = [
        { range: "1 - 10.000 documentos", price: "$95 COP", detail: "por documento adicional" },
        { range: "10.001 - 50.000 documentos", price: "$85 COP", detail: "por documento adicional" },
        { range: "Mas de 50.000 documentos", price: "$75 COP", detail: "por documento adicional" },
    ];

    const faq = [
        {
            q: "Necesito usar el dashboard o el inventario de Ohnix?",
            a: "No. Tu propio sistema se conecta directamente a la API de facturacion electronica; no necesitas usar el dashboard ni el modulo de inventario de Ohnix.",
        },
        {
            q: "Que documentos puedo emitir con la API?",
            a: `Factura electronica de venta, notas credito y debito, documento soporte y acuse de recibo, con tecnologia propia habilitada directamente ante la DIAN.`,
        },
        {
            q: "Como empiezo a integrar la API?",
            a: "Escribenos y nos cuentas tu volumen y tipo de operacion. Aprovisionamos tu empresa, certificado digital y numeracion DIAN, y te entregamos tu API key y documentacion tecnica.",
        },
        {
            q: "Cuanto cuesta?",
            a: `${formatCOP(BASE_PACKAGE_PRICE)} COP al año, con ${BASE_PACKAGE_DOCS} documentos incluidos. Cada documento adicional se cobra segun tu volumen mensual: desde $95 COP hasta $75 COP por documento entre mas factures. Sin cotizacion oculta.`,
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
                    name: "API de facturacion electronica DIAN",
                    item: "https://ohnix.co/facturacion-electronica-sin-inventario",
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

    const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}`;
    const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="API de facturacion electronica DIAN para tu software | Ohnix"
                description={description}
                canonicalPath="/facturacion-electronica-sin-inventario"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="facturacion-electronica-sin-inventario" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="API DE FACTURACION ELECTRONICA"
                        title="Factura ante la DIAN desde tu propio software"
                        description={description}
                    />

                    <div className="mt-10 grid gap-5 md:grid-cols-3">
                        {audiences.map((item) => (
                            <article
                                key={item.title}
                                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6"
                            >
                                <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                                <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{item.detail}</p>
                            </article>
                        ))}
                    </div>

                    <div className="mt-8 rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <h2 className="text-xl font-semibold text-white">Documentos que puedes emitir</h2>
                            <a
                                href={OPENAPI_DOCS_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver documentacion tecnica (OpenAPI)
                            </a>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {documents.map((doc) => (
                                <span
                                    key={doc}
                                    className="rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-4 py-2 text-xs font-medium text-[#44F3F0]"
                                >
                                    {doc}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="mt-12">
                        <h2 className="text-2xl font-semibold text-white">Como funciona la integracion</h2>
                        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {steps.map((step, index) => (
                                <article
                                    key={step.title}
                                    className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                                >
                                    <span className="font-mono text-xs text-[#29D8D5]">0{index + 1}</span>
                                    <h3 className="mt-2 text-base font-semibold text-white">{step.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-[#A9B3B8]">{step.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>

                    <div className="mt-12 rounded-[28px] border border-[#29D8D5]/25 bg-[#29D8D5]/8 p-7">
                        <h2 className="text-2xl font-semibold text-white">Precio publico, sin cotizacion oculta</h2>
                        <p className="mt-3 text-sm leading-7 text-[#CFE8E8]">
                            No es un plan de Ohnix ni requiere usar nuestro inventario. Pagas un paquete base anual con documentos incluidos, y cada documento adicional se cobra segun tu volumen mensual: entre mas factures, menos pagas por documento.
                        </p>

                        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
                            <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-3xl font-semibold text-white">{formatCOP(BASE_PACKAGE_PRICE)}</span>
                                <span className="text-sm text-[#A9B3B8]">COP / año</span>
                                <span className="inline-flex items-center rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/8 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#44F3F0]">
                                    {BASE_PACKAGE_DOCS} documentos incluidos
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            {priceTiers.map((tier) => (
                                <div key={tier.range} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <div className="text-xs uppercase tracking-wide text-[#A9B3B8]">{tier.range}</div>
                                    <div className="mt-1 text-xl font-semibold text-white">{tier.price}</div>
                                    <div className="text-xs text-[#A9B3B8]">{tier.detail}</div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <a
                                href={mailtoHref}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Hablar con nuestro equipo
                            </a>
                            <a
                                href={whatsappHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Escribir por WhatsApp
                            </a>
                        </div>
                    </div>

                    <p className="mt-8 text-sm text-[#6B7880]">
                        Buscas facturar desde el dashboard de Ohnix, con o sin inventario?{" "}
                        <button
                            type="button"
                            onClick={() => navigate("/facturacion-electronica-dian")}
                            className="text-[#44F3F0] underline underline-offset-2 hover:text-white"
                        >
                            Conoce la facturacion electronica dentro de Ohnix
                        </button>
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

export default FacturacionSinInventario;
