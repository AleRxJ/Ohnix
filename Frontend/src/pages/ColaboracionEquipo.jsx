import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

const ColaboracionEquipo = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Invita a tu equipo a Ohnix con roles y permisos por modulo, mira en tiempo real quien esta viendo o editando cada registro, y evita que dos personas se pisen sobre el mismo dato.";

    const benefits = [
        {
            title: "Invitaciones por correo",
            detail: "Invita a cualquier persona por email desde el plan Negocio en adelante. Acepta su invitacion, crea su propia cuenta y queda vinculada a tu equipo, sin compartir contrasenas.",
        },
        {
            title: "Roles y permisos por modulo",
            detail: "Define exactamente que puede ver o editar cada persona: productos, pedidos, clientes, compras, reportes. Crea tantos roles como necesites, cada uno con su propia combinacion de permisos.",
        },
        {
            title: "Presencia en tiempo real",
            detail: "Ve quien mas esta mirando un producto, pedido o cliente en este momento, con avatares en vivo — sin recargar la pagina.",
        },
        {
            title: "Bloqueo de edicion simultanea",
            detail: "Cuando alguien de tu equipo ya esta editando un registro, el sistema lo avisa y evita que otra persona lo edite al mismo tiempo y se pierdan cambios.",
        },
        {
            title: "Control total del owner",
            detail: "Tu, como dueno de la cuenta, siempre tienes acceso completo: cambias roles, remueves miembros, transfieres la propiedad del equipo y ves el historial de toda la actividad.",
        },
        {
            title: "Todo queda en tu cuenta",
            detail: "Lo que tu equipo crea (productos, pedidos, clientes) se queda siempre en la cuenta principal, aunque remuevas a alguien del equipo despues.",
        },
    ];

    const faq = [
        {
            q: "Desde que plan puedo invitar a mi equipo?",
            a: "Desde el plan Negocio ($49/mes), con hasta 3 usuarios. El plan Escala ($99/mes) permite hasta 10, y Enterprise no tiene limite. El plan Emprendedor no incluye equipos colaborativos.",
        },
        {
            q: "Puedo controlar que ve cada persona de mi equipo?",
            a: "Si. Cada miembro tiene un rol con permisos independientes por modulo (productos, pedidos, clientes, proveedores, compras, reportes) en 4 niveles: sin acceso, ver, editar o administrar.",
        },
        {
            q: "Que pasa si remuevo a alguien de mi equipo?",
            a: "Pierde acceso de inmediato. Todo lo que creo mientras estuvo en el equipo (productos, pedidos, clientes) se queda en tu cuenta — nada se borra ni se va con la persona removida.",
        },
        {
            q: "Como evita Ohnix que dos personas editen lo mismo a la vez?",
            a: "Cuando alguien abre un registro para editarlo, los demas ven en tiempo real quien lo tiene abierto y no pueden editarlo hasta que esa persona termine, evitando que se sobreescriban cambios entre si.",
        },
        {
            q: "Puedo cambiar quien es el dueno de la cuenta despues?",
            a: "Si. El owner puede transferir la propiedad del equipo a otro miembro cuando quiera, desde la configuracion del equipo.",
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
                    name: "Colaboracion en equipo",
                    item: "https://ohnix.co/colaboracion-en-equipo",
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
                title="Colaboracion en equipo con roles y permisos | Ohnix"
                description={description}
                canonicalPath="/colaboracion-en-equipo"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-20">
                <ContentSection id="colaboracion-en-equipo" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow="COLABORACION EN EQUIPO"
                        title="Trabaja en equipo sin perder el control"
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

                    <div className="mt-12 rounded-[28px] border border-[#22C55E]/25 bg-[#22C55E]/8 p-7">
                        <h2 className="text-2xl font-semibold text-white">Disponible desde el plan Negocio</h2>
                        <p className="mt-3 text-sm leading-7 text-[#CFE8E8]">
                            Equipos colaborativos esta incluido a partir del plan Negocio ($49/mes, hasta 3 usuarios), con mas asientos en Escala (hasta 10) y sin limite en Enterprise. El plan Emprendedor y el periodo de prueba gratuita no lo incluyen.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?plan=growth&source=seo-colaboracion-equipo")}
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

export default ColaboracionEquipo;
