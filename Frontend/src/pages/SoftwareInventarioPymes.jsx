import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const SoftwareInventarioPymes = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Software de inventario para pymes que centraliza productos, compras, pedidos y reportes en una sola plataforma con trazabilidad en tiempo real.";

    const benefits = [
        {
            title: "Control de stock en tiempo real",
            detail: "Visualiza existencias, entradas y salidas sin depender de hojas de calculo.",
        },
        {
            title: "Compras y pedidos conectados",
            detail: "Sincroniza movimientos operativos para reducir quiebres de inventario.",
        },
        {
            title: "Reportes para decidir mejor",
            detail: "Evalua rotacion, comportamiento de ventas y necesidades de reposicion.",
        },
        {
            title: "Escalable para equipos en crecimiento",
            detail: "Opera con mayor claridad a medida que agregas usuarios, productos y volumen.",
        },
    ];

    const faq = [
        {
            q: "Para que tipo de negocio aplica Ohnix?",
            a: "Ohnix esta orientado a pymes que necesitan controlar inventario, compras y pedidos sin complejidad de ERP sobredimensionados.",
        },
        {
            q: "Puedo empezar sin migraciones complejas?",
            a: "Si. Puedes iniciar con tus productos clave y expandir gradualmente a clientes, proveedores y reportes.",
        },
        {
            q: "Incluye seguimiento de compras y ventas?",
            a: "Si. Ohnix conecta compras, pedidos y stock para que cada movimiento impacte tu operacion y reportes.",
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
                    name: "Software de inventario para pymes",
                    item: "https://ohnix.co/software-inventario-pymes",
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
                title="Software de inventario para pymes | Ohnix"
                description={description}
                canonicalPath="/software-inventario-pymes"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-20">
                <ContentSection id="software-inventario-pymes" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="SOLUCION PARA PYMES"
                        title="Software de inventario para pymes"
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
                        <h2 className="text-2xl font-semibold text-white">Convierte el control operativo en ventaja competitiva</h2>
                        <p className="mt-3 text-sm leading-7 text-[#CFE8E8]">
                            Estandariza tu gestion de inventario, compras y pedidos en una sola plataforma y toma decisiones con datos en tiempo real.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?plan=starter&source=seo-software-inventario-pymes")}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Crear cuenta gratis
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/precios")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver planes y precios
                            </button>
                                <Link
                                    to="/blog"
                                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-[#29D8D5]/35"
                                >
                                    Leer recomendaciones practicas
                                </Link>
                        </div>
                    </div>

                    <div className="mt-12">
                        <h2 className="text-2xl font-semibold text-white">Preguntas frecuentes</h2>
                        <div className="mt-6 grid gap-4 lg:grid-cols-3">
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

export default SoftwareInventarioPymes;
