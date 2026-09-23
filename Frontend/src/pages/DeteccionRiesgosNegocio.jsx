import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const DeteccionRiesgosNegocio = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Ohnix revisa cada noche tus ventas, clientes, proveedores e inventario y te avisa de riesgos, oportunidades y patrones que nadie te pidió que buscaras - siempre con la evidencia real detrás, nunca un número inventado.";

    const benefits = [
        {
            title: "Clientes en riesgo de irse, antes de que se vayan",
            detail: "Compara el ritmo de compra actual de cada cliente contra su propio historial - no un umbral genérico de días de inactividad - y te avisa cuando varios entran en un patrón que históricamente terminó en pérdida del cliente.",
        },
        {
            title: "Combinaciones que nadie había cruzado",
            detail: "Busca automáticamente pares de condiciones (canal de venta, día, punto de venta, tipo de cliente) cuya combinación dispara una tasa de devolución fuera de lo normal - algo que ningún reporte tradicional revisa por separado.",
        },
        {
            title: "Contradicciones entre lo que factura y lo que cobra",
            detail: "Detecta cuando tu facturación crece pero el efectivo realmente cobrado no la sigue - la señal clásica de que la cartera está absorbiendo el crecimiento en silencio.",
        },
        {
            title: "Cambios de trayectoria en cualquier métrica",
            detail: "No se limita a ventas: cualquier módulo de Ohnix (incluida tu facturación electrónica DIAN) puede reportar una métrica propia, y el motor la vigila automáticamente contra su propio historial de hasta 36 meses.",
        },
        {
            title: "Aprende de sus propios aciertos",
            detail: "Cada hallazgo registra una predicción verificable. Cuando se cumple el plazo, Ohnix comprueba qué pasó de verdad y ajusta su propia confianza para la próxima vez - un ciclo de autocorrección, no una alerta que se repite igual siempre.",
        },
        {
            title: "Nunca una caja negra",
            detail: "Cada hallazgo muestra la evidencia real detrás: los números, los clientes involucrados, el cálculo exacto. Si algo no tiene suficiente evidencia, Ohnix prefiere no decir nada en vez de inventar una alerta.",
        },
    ];

    const faq = [
        {
            q: "¿Desde qué plan está incluido el Discovery Engine?",
            a: "Desde el plan Negocio ($129.000/mes) en adelante - también en Escala y Enterprise. El plan Emprendedor no lo incluye.",
        },
        {
            q: "¿El motor puede inventar un hallazgo si no hay suficiente información?",
            a: "No. Cada detección exige un mínimo de evidencia real (órdenes, clientes, historial) antes de decir algo - si tu cuenta todavía no tiene suficiente actividad, Ohnix simplemente no reporta nada esa noche, en vez de forzar una alerta.",
        },
        {
            q: "¿Con qué frecuencia corre el motor?",
            a: "Todas las noches a las 4:30am (hora Colombia), para cada cuenta con actividad real. También se puede correr manualmente desde el panel de administración.",
        },
        {
            q: "¿Qué tipo de patrones detecta?",
            a: "Riesgos (clientes que podrían dejar de comprar), oportunidades (clientes similares a tus mejores compradores que no han comprado cierto producto), contradicciones (facturación vs. efectivo cobrado), conexiones entre módulos (retrasos de un proveedor y pérdida de sus clientes), cambios de trayectoria en cualquier métrica, y combinaciones de condiciones que ningún reporte tradicional cruza.",
        },
        {
            q: "¿Puedo contarle a Ohnix si su hallazgo está equivocado?",
            a: "Sí. Puedes agregar tu propia explicación a cualquier hallazgo en cualquier momento, y cuando existe una forma de contrastarla contra la evidencia real, Ohnix te dice si tu explicación se sostiene o no - nunca asume que tienes razón ni que estás equivocado sin evidencia.",
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
                    name: "Detección de riesgos y oportunidades con IA",
                    item: "https://ohnix.co/deteccion-riesgos-oportunidades-negocio",
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
                title="Detección automática de riesgos y oportunidades con IA | Ohnix"
                description={description}
                canonicalPath="/deteccion-riesgos-oportunidades-negocio"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="deteccion-riesgos-negocio" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="DISCOVERY ENGINE"
                        title="Ohnix encuentra lo que tú no estás mirando"
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

                    <div className="mt-12 rounded-[28px] border border-[#FBBF24]/25 bg-[#FBBF24]/8 p-7">
                        <h2 className="text-2xl font-semibold text-white">Disponible desde el plan Negocio</h2>
                        <p className="mt-3 text-sm leading-7 text-[#F5E6BC]">
                            El Discovery Engine está incluido a partir del plan Negocio ($129.000/mes), también en Escala y Enterprise. El plan Emprendedor y el período de prueba gratuita no lo incluyen.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?plan=growth&source=seo-deteccion-riesgos")}
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
                                to="/software-inventario-pymes"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-[#29D8D5]/35"
                            >
                                Conoce Ohnix
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

export default DeteccionRiesgosNegocio;
