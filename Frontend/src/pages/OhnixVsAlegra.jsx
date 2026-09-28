import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";

const OhnixVsAlegra = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    // Accounting is live regardless of ELECTRONIC_INVOICING_ENABLED (it's a
    // separate, already-shipped feature) - only the invoicing mentions below
    // need to disappear when that flag is off, same rule applied across
    // Precios.jsx/LandingPage.jsx.
    const comparisonRows = [
        {
            criteria: "Enfoque operativo",
            ohnix: ELECTRONIC_INVOICING_ENABLED
                ? "Inventario, compras, pedidos, facturacion electronica DIAN y contabilidad automatica en un solo flujo"
                : "Inventario, compras, pedidos y contabilidad automatica en un solo flujo",
            alegra: "Suite de facturacion y contabilidad con modulo de inventario adicional",
        },
        {
            criteria: ELECTRONIC_INVOICING_ENABLED ? "Facturacion electronica y contabilidad" : "Contabilidad",
            ohnix: ELECTRONIC_INVOICING_ENABLED
                ? "Facturacion electronica DIAN con tecnologia propia, y contabilidad automatica (asientos, plan de cuentas, cierres) desde el plan Escala"
                : "Contabilidad automatica (asientos, plan de cuentas, cierres) desde el plan Escala",
            alegra: "Facturacion y contabilidad incluidas desde el plan base, con mayor profundidad contable especializada",
        },
        {
            criteria: "Implementacion inicial",
            ohnix: "Orientada a adopcion rapida de equipos operativos",
            alegra: "Depende del alcance de modulos habilitados",
        },
        {
            criteria: "Visibilidad de movimientos",
            ohnix: ELECTRONIC_INVOICING_ENABLED
                ? "Trazabilidad operativa para control de stock y reposicion, conectada directamente con cada factura y asiento contable"
                : "Trazabilidad operativa para control de stock y reposicion, conectada directamente con cada asiento contable",
            alegra: "Cobertura robusta con prioridad en procesos administrativos",
        },
        {
            criteria: "Ruta recomendada para pymes",
            ohnix: ELECTRONIC_INVOICING_ENABLED
                ? "Equipos que quieren inventario, facturacion DIAN y contabilidad en una sola herramienta, sin duplicar informacion entre sistemas"
                : "Equipos que quieren inventario y contabilidad en una sola herramienta, sin duplicar informacion entre sistemas",
            alegra: "Equipos que ya resolvieron su operacion aparte y buscan solo el modulo contable/fiscal especializado",
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
            <main className="bg-[#050505] pt-24">
                <ContentSection id="comparativa-ohnix-alegra" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="COMPARATIVA"
                        title="Ohnix vs Alegra"
                        description={description}
                    />

                    <div className="mt-10 overflow-hidden rounded-[24px] border border-white/10">
                        {/* Three columns only from sm up: at phone width each column
                            was ~90px, so long words collided with the next column
                            and the Alegra text ran past the card edge. On mobile
                            each row stacks, labelling Ohnix/Alegra inline. */}
                        <div className="hidden grid-cols-3 bg-white/[0.06] px-5 py-4 text-sm font-semibold text-white sm:grid">
                            <div>Criterio</div>
                            <div>Ohnix</div>
                            <div>Alegra</div>
                        </div>
                        {comparisonRows.map((row, index) => (
                            <div
                                key={row.criteria}
                                className={`grid gap-2 px-5 py-4 text-sm sm:grid-cols-3 sm:gap-4 ${index > 0 ? "border-t border-white/10" : "sm:border-t sm:border-white/10"}`}
                            >
                                <div className="font-semibold text-white sm:font-normal">{row.criteria}</div>
                                <div className="text-[#CFE8E8]">
                                    <span className="mb-0.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#29D8D5] sm:hidden">Ohnix</span>
                                    {row.ohnix}
                                </div>
                                <div className="text-[#A9B3B8]">
                                    <span className="mb-0.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8B969C] sm:hidden">Alegra</span>
                                    {row.alegra}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10 rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                        <h2 className="text-xl font-semibold text-white">Cuando elegir Ohnix</h2>
                        <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                            {ELECTRONIC_INVOICING_ENABLED
                                ? "Si tu prioridad es tener control operativo diario sobre inventario, compras y pedidos, y ademas quieres facturar electronicamente ante la DIAN y llevar tu contabilidad sin salir de la misma herramienta ni duplicar informacion entre sistemas."
                                : "Si tu prioridad es tener control operativo diario sobre inventario, compras y pedidos, y ademas quieres llevar tu contabilidad sin salir de la misma herramienta ni duplicar informacion entre sistemas."}
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
