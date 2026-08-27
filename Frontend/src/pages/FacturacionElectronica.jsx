import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const FacturacionElectronica = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Facturacion electronica DIAN para pymes en Colombia, con tecnologia propia integrada directamente con la DIAN y conectada a tu inventario y pedidos. Emite, valida y da seguimiento a tus facturas desde un solo lugar con Ohnix.";

    const benefits = [
        {
            title: "Emision valida ante la DIAN",
            detail: "Ohnix genera y valida tus facturas electronicas con tecnologia propia, habilitada directamente ante la DIAN, sin depender de un proveedor externo de facturacion.",
        },
        {
            title: "Directo desde tus pedidos",
            detail: "Factura electronicamente a partir de los pedidos que ya registras en Ohnix, sin doble digitacion entre inventario y facturacion.",
        },
        {
            title: "Seguimiento de cada documento",
            detail: "Consulta el CUFE, el estado ante la DIAN (emitiendo, enviado, aceptado o rechazado) y reintenta la emision cuando sea necesario.",
        },
        {
            title: "Centro de documentos centralizado",
            detail: "Sincroniza el estado de tus facturas y visualiza tasa de aceptacion y total facturado desde un solo panel.",
        },
    ];

    const faq = [
        {
            q: "Ohnix genera facturas electronicas validas ante la DIAN?",
            a: "Si. Ohnix factura con tecnologia propia, habilitada directamente ante la DIAN, para emitir y validar facturas electronicas conforme a la normativa colombiana.",
        },
        {
            q: "En que plan esta incluida la facturacion electronica?",
            a: "Esta disponible desde el plan Negocio ($49/mes) en adelante. No esta incluida en el plan Emprendedor ni durante el periodo de prueba gratuita.",
        },
        {
            q: "Que pasa si la DIAN rechaza una factura?",
            a: "Puedes ver el motivo del rechazo y reintentar la emision directamente desde el centro de documentos, sin perder la informacion del pedido original.",
        },
        {
            q: "La facturacion esta conectada con mi inventario?",
            a: "Si. Como Ohnix centraliza pedidos e inventario, cada factura electronica parte de un pedido real y queda asociada a los movimientos de stock correspondientes.",
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
                    name: "Facturacion electronica DIAN",
                    item: "https://ohnix.co/facturacion-electronica-dian",
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
                title="Facturacion electronica DIAN para pymes | Ohnix"
                description={description}
                canonicalPath="/facturacion-electronica-dian"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-20">
                <ContentSection id="facturacion-electronica-dian" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="FACTURACION ELECTRONICA"
                        title="Facturacion electronica DIAN, conectada a tu inventario"
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
                        <h2 className="text-2xl font-semibold text-white">Disponible desde el plan Negocio</h2>
                        <p className="mt-3 text-sm leading-7 text-[#CFE8E8]">
                            La facturacion electronica DIAN esta incluida a partir del plan Negocio ($49/mes), junto con reportes completos y alertas automaticas. El plan Emprendedor y el periodo de prueba gratuita no la incluyen.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?plan=growth&source=seo-facturacion-electronica")}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Empezar con plan Negocio
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/precios")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver todos los planes
                            </button>
                            <Link
                                to="/comparativa/ohnix-vs-alegra"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-[#29D8D5]/35"
                            >
                                Comparar con Alegra
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

export default FacturacionElectronica;
