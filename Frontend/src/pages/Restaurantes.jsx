import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import useI18n from "../hooks/useI18n";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";

// SEO landing for restaurants: the table -> kitchen -> register flow, QR
// ordering and payroll. Claims mirror what the product actually gates (see
// Backend pricing.middleware.js): the Caja, tables, kitchen screen and QR
// ordering are on every plan; separate waiter/kitchen/cashier logins need a
// team (Negocio+); DIAN e-invoicing starts at Negocio.

const Restaurantes = () => {
    const navigate = useNavigate();
    const { currentLanguage } = useI18n();

    const description =
        "Ohnix conecta la mesa, la cocina y la caja: el mesero toma el pedido desde su celular, la cocina lo ve al instante en su pantalla, y la caja cobra con factura electrónica DIAN. Tus clientes también pueden pedir desde el QR de su mesa. Y todo sigue funcionando sin internet.";

    const steps = [
        { title: "El mesero toma el pedido", detail: "Abre la mesa en su celular, agrega los platos con notas (\"sin cebolla\", \"término medio\") y la envía a cocina con un toque." },
        { title: "La cocina lo recibe al instante", detail: "La comanda aparece en la pantalla de cocina con sonido, la mesa y el tiempo que lleva esperando. Si prefieres papel, un equipo con impresora la imprime sola." },
        { title: "Listo para servir", detail: "La cocina marca la comanda como lista y al mesero de esa mesa le llega el aviso en su celular. Las rondas adicionales salen marcadas como ADICIONAL." },
        { title: "La caja cobra", detail: "La pre-cuenta se imprime para la mesa; la caja cobra en efectivo, tarjeta, transferencia o datáfono, y el inventario y la contabilidad se actualizan solos." },
    ];

    const benefits = [
        {
            title: "Pedido por QR, confirmado por el mesero",
            detail: "Cada mesa tiene su código. El cliente lo escanea, ve la carta con fotos y precios, y envía su pedido; el mesero lo revisa y lo confirma antes de que llegue a cocina, así un QR fotografiado no termina en un pedido falso. También puede llamar al mesero o pedir la cuenta.",
        },
        {
            title: "Pantalla de cocina con tiempos",
            detail: "Pendientes, en preparación y listos en una tablet. Cada comanda cambia de color cuando pasa de 10 y de 20 minutos, para que nada se quede olvidado en la fila.",
        },
        {
            title: "Comandas que nunca se repiten",
            detail: "Cada envío a cocina lleva solo lo nuevo. Si dos equipos imprimen comandas, cada una sale una sola vez, y los productos que el mesero agrega después llegan como ronda adicional.",
        },
        {
            title: "Mesero, cocina y caja con su propio acceso",
            detail: "Roles listos para Mesero, Cocina y Cajero: el mesero atiende mesas y envía a cocina, pero no cobra; la caja cobra. Cada venta queda a nombre del mesero que la atendió.",
        },
        {
            title: "Sin internet, el servicio no se detiene",
            detail: "Abrir mesas, agregar platos, enviar a cocina, cambiar estados y cobrar siguen funcionando si se cae la conexión. Todo se sincroniza solo cuando vuelve, sin duplicados.",
        },
        {
            title: "Inventario, factura DIAN y nómina en el mismo lugar",
            detail: "Cada venta descuenta inventario y genera su factura electrónica DIAN. Y tu equipo está en la misma herramienta: nómina con nómina electrónica, con cada empleado vinculado a su usuario.",
        },
    ];

    const faq = [
        {
            q: "¿En qué plan está el modo restaurante?",
            a: "La caja, las mesas, la pantalla de cocina y los pedidos por QR están en todos los planes, incluido Emprendedor. Para que mesero, cocina y caja tengan cada uno su propio usuario y rol necesitas equipo, que viene desde el plan Negocio (hasta 3 usuarios) y Escala (hasta 10).",
        },
        {
            q: "¿Necesito equipos o software especial?",
            a: "No. Funciona en el navegador de cualquier celular, tablet o computador. Para imprimir comandas y tickets sirve cualquier impresora térmica de 58 u 80 mm que reconozca el equipo; para imprimir sin la ventana de confirmación, el equipo de la impresora abre Chrome en modo kiosco.",
        },
        {
            q: "¿El cliente paga desde el QR?",
            a: "No por ahora. Desde el QR el cliente ve la carta, pide, llama al mesero y pide la cuenta; el pago se hace con el mesero o en caja, en efectivo, tarjeta, transferencia o datáfono.",
        },
        {
            q: "¿Qué pasa si se va el internet en pleno servicio?",
            a: "Los meseros siguen tomando pedidos, la cocina sigue cambiando estados y la caja sigue cobrando: todo se guarda en cada equipo y se sincroniza al volver la conexión. Los pedidos nuevos por QR sí necesitan internet, porque llegan desde el celular del cliente.",
        },
        {
            q: "¿Puedo tener varias sedes?",
            a: "Sí. Cada punto de venta tiene sus propias mesas, su cocina y sus QR, y cada miembro del equipo ve solo las sedes que le asignes. Varios puntos de venta vienen desde el plan Escala.",
        },
        {
            q: "¿Las ventas salen con factura electrónica DIAN?",
            a: "Sí, desde el plan Negocio. Cada cobro en caja puede emitir su factura electrónica DIAN automáticamente o preguntarte en cada venta, y el ticket impreso incluye el código QR de la factura.",
        },
    ];

    const structuredData = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Inicio", item: "https://ohnix.co/" },
                { "@type": "ListItem", position: 2, name: "Software para restaurantes", item: "https://ohnix.co/restaurantes" },
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
        },
    ];

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Software para restaurantes: mesas, comandas, cocina y pedidos por QR | Ohnix"
                description={description}
                canonicalPath="/restaurantes"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="restaurantes" shell={false}>
                    <SectionHeading as="h1" align="left" eyebrow="OHNIX PARA RESTAURANTES" title="De la mesa a la cocina y a la caja, sin papelitos" description={description} />

                    <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {steps.map((step, index) => (
                            <article key={step.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#29D8D5]/12 text-base font-bold text-[#29D8D5]">{index + 1}</span>
                                <h2 className="mt-4 text-lg font-semibold text-white">{step.title}</h2>
                                <p className="mt-2 text-sm leading-7 text-[#A9B3B8]">{step.detail}</p>
                            </article>
                        ))}
                    </div>

                    <div className="mt-12 grid gap-5 md:grid-cols-2">
                        {benefits.map((item) => (
                            <article key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
                                <h2 className="text-xl font-semibold text-white">{item.title}</h2>
                                <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{item.detail}</p>
                            </article>
                        ))}
                    </div>

                    <div className="mt-12 rounded-[28px] border border-[#29D8D5]/25 bg-[#29D8D5]/[0.06] p-7">
                        <h2 className="text-2xl font-semibold text-white">Disponible en todos los planes</h2>
                        <p className="mt-3 text-sm leading-7 text-[#C9EEEE]">
                            La caja, las mesas, la pantalla de cocina y los pedidos por QR vienen desde el plan Emprendedor. Desde el plan Negocio, tu equipo tiene usuarios propios con roles de mesero, cocina y caja, y tus ventas salen con factura electrónica DIAN.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => navigate("/signup?source=seo-restaurantes")}
                                className="inline-flex items-center justify-center rounded-full bg-[#29D8D5] px-6 py-3 text-sm font-semibold text-[#021314] hover:bg-[#44F3F0]"
                            >
                                Empezar gratis
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/agenda-demo")}
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white hover:border-[#29D8D5]/40"
                            >
                                Agendar una demo
                            </button>
                            <Link
                                to="/precios"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-[#29D8D5]/35"
                            >
                                Ver planes
                            </Link>
                        </div>
                    </div>

                    <div className="mt-12">
                        <h2 className="text-2xl font-semibold text-white">Preguntas frecuentes</h2>
                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            {faq.map((item) => (
                                <article key={item.q} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
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

export default Restaurantes;
