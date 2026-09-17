import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const Integraciones = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Conecta Ohnix con tu tienda Shopify o WooCommerce, o intégralo a tus propios sistemas con la API REST y los webhooks de Ohnix. Sincroniza productos, pedidos e inventario sin doble digitación.";

    const benefits = [
        {
            title: "Shopify y WooCommerce",
            detail: "Sincroniza tu catálogo y tus pedidos entre tu tienda online y Ohnix, para que el inventario refleje lo que realmente tienes disponible en ambos canales.",
        },
        {
            title: "API REST documentada",
            detail: "Integra Ohnix con tus propios sistemas usando una API REST con llaves por cuenta, para leer y escribir productos, pedidos e inventario desde donde lo necesites.",
        },
        {
            title: "Webhooks salientes",
            detail: "Recibe notificaciones en tiempo real hacia tus propios sistemas cuando cambian pedidos, stock u otros eventos, sin tener que consultar la API constantemente.",
        },
        {
            title: "Una sola fuente de stock",
            detail: "Vendas por tu tienda online, en mostrador o por WhatsApp, el inventario de Ohnix queda como referencia única—sin sobreventas por descoordinación entre canales.",
        },
    ];

    const faq = [
        {
            q: "¿Con qué plataformas de e-commerce se integra Ohnix?",
            a: "Ohnix tiene conectores propios para Shopify y WooCommerce, que sincronizan productos y pedidos entre tu tienda y tu inventario.",
        },
        {
            q: "¿En qué plan están disponibles las integraciones?",
            a: "Los conectores de Shopify/WooCommerce y la API REST están disponibles desde el plan Escala. El plan Enterprise suma webhooks salientes e integraciones a medida con otros sistemas (ERP, contabilidad).",
        },
        {
            q: "¿Puedo usar la API para construir mi propia integración?",
            a: "Sí. La API REST de Ohnix está documentada y usa llaves de acceso por cuenta, para que puedas leer y escribir información de productos, pedidos e inventario desde tus propios sistemas.",
        },
        {
            q: "¿Qué pasa si vendo en varios canales a la vez?",
            a: "Ohnix mantiene el inventario como una sola fuente de verdad: una venta en tu tienda online o en un punto de venta físico descuenta el mismo stock, evitando que vendas algo que ya no tienes.",
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
                    name: "Integraciones",
                    item: "https://ohnix.co/integraciones",
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
                title="Integraciones: Shopify, WooCommerce y API REST | Ohnix"
                description={description}
                canonicalPath="/integraciones"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="integraciones" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="INTEGRACIONES"
                        title="Conecta Ohnix con tu tienda y tus propios sistemas"
                        description={description}
                    />

                    <div className="mt-10 grid gap-5 md:grid-cols-2">
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

                    <div className="mt-12 rounded-[28px] border border-[#29D8D5]/25 bg-[#29D8D5]/8 p-7">
                        <h2 className="text-2xl font-semibold text-white">Disponible desde el plan Escala</h2>
                        <p className="mt-3 text-sm leading-7 text-[#CFE8E8]">
                            Los conectores de Shopify/WooCommerce y la API REST están incluidos desde el plan Escala. El plan Enterprise suma webhooks salientes e integraciones a medida con otros sistemas (ERP, contabilidad) y sin límite de peticiones.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?plan=scale&source=seo-integraciones")}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Empezar con plan Escala
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/precios")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver todos los planes
                            </button>
                            <Link
                                to="/software-inventario-pymes"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-[#29D8D5]/35"
                            >
                                Ver inventario para pymes
                            </Link>
                        </div>
                    </div>

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

export default Integraciones;
