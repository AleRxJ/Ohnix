import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const OhnixVsAlegra = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const comparisonRows = [
        {
            criteria: "Enfoque operativo",
            ohnix: "Inventario, compras, pedidos y reportes en flujo unificado",
            alegra: "Suite amplia con foco fuerte en facturacion y contabilidad",
        },
        {
            criteria: "Implementacion inicial",
            ohnix: "Orientada a adopcion rapida de equipos operativos",
            alegra: "Depende del alcance de modulos habilitados",
        },
        {
            criteria: "Visibilidad de movimientos",
            ohnix: "Trazabilidad operativa para control de stock y reposicion",
            alegra: "Cobertura robusta con prioridad en procesos administrativos",
        },
        {
            criteria: "Ruta recomendada para pymes",
            ohnix: "Equipos que necesitan control operativo diario con foco en inventario",
            alegra: "Equipos que priorizan ecosistema contable y fiscal completo",
        },
    ];

    const description =
        "Comparativa entre Ohnix y Alegra para evaluar que plataforma se adapta mejor a pymes con foco en inventario, compras y ventas.";

    const structuredData = {
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
                name: "Comparativa Ohnix vs Alegra",
                item: "https://ohnix.co/comparativa/ohnix-vs-alegra",
            },
        ],
    };

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Ohnix vs Alegra | Comparativa para pymes"
                description={description}
                canonicalPath="/comparativa/ohnix-vs-alegra"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-20">
                <ContentSection id="comparativa-ohnix-alegra" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="COMPARATIVA"
                        title="Ohnix vs Alegra"
                        description={description}
                    />

                    <div className="mt-10 overflow-hidden rounded-[24px] border border-white/10">
                        <div className="grid grid-cols-3 bg-white/[0.06] px-5 py-4 text-sm font-semibold text-white">
                            <div>Criterio</div>
                            <div>Ohnix</div>
                            <div>Alegra</div>
                        </div>
                        {comparisonRows.map((row) => (
                            <div
                                key={row.criteria}
                                className="grid grid-cols-3 gap-4 border-t border-white/10 px-5 py-4 text-sm"
                            >
                                <div className="text-white">{row.criteria}</div>
                                <div className="text-[#CFE8E8]">{row.ohnix}</div>
                                <div className="text-[#A9B3B8]">{row.alegra}</div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10 rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                        <h2 className="text-xl font-semibold text-white">Cuando elegir Ohnix</h2>
                        <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                            Si tu prioridad es tener control operativo diario sobre inventario, compras y pedidos, con una experiencia enfocada en trazabilidad y ejecucion rapida.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?plan=growth&source=seo-comparativa-alegra")}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Probar Ohnix
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/demo")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Ver demo guiada
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/blog")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Explorar blog para pymes
                            </button>
                        </div>
                    </div>
                </ContentSection>
            </main>
            <Footer />
        </div>
    );
};

export default OhnixVsAlegra;
