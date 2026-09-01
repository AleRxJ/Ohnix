// Seeds/updates the assistant's knowledge base (AssistantKnowledgeChunk).
//
// IMPORTANT - read before running:
// Every entry below ships with isPublished: false on purpose. The assistant
// (services/assistant.service.js) refuses to cite or answer from anything
// that isn't published - that's the actual control that stops it from
// improvising on Ohnix's behalf. This first draft was written from the
// codebase (routes, permissions, services) by an agent that has not used
// Ohnix's UI and does NOT have DIAN/tax/accounting domain expertise -
// review and correct the wording (especially every "dian" sourceType entry:
// electronic invoicing availability differs by plan/company and must not be
// overstated) before flipping isPublished to true, module by module.
//
// Usage:
//   node --env-file=.env scripts/seedAssistantKnowledge.js
// Safe to re-run: upserts on the (module, locale, title) unique key, so
// editing the text below and re-running updates existing rows instead of
// duplicating them. Manually flip isPublished in the database (or edit it
// here and re-run) once a module's content has been reviewed.
import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config({ path: "./.env" });

const ENTRIES = [
    {
        module: "general",
        title: "Qué es Ohnix",
        sourceType: "concept",
        tags: ["onboarding", "general"],
        body: "Ohnix es una plataforma de gestión empresarial (ERP) pensada para pequeñas y medianas empresas en Colombia. Cubre inventario, ventas, compras, clientes, proveedores, puntos de venta, finanzas, contabilidad y facturación electrónica DIAN, todo dentro de una sola cuenta. El acceso a cada módulo depende del plan contratado (Starter, Growth, Scale o Enterprise) y, si la cuenta tiene un equipo, del rol y los permisos que el dueño de la cuenta le haya asignado a cada persona.",
    },
    {
        module: "general",
        title: "Equipos, roles y permisos",
        sourceType: "concept",
        tags: ["equipo", "permisos", "roles"],
        body: "El dueño de una cuenta Ohnix siempre tiene acceso total. Puede invitar personas a un equipo y crear roles personalizados en la sección Equipo, otorgando a cada rol un nivel de acceso por módulo: sin acceso, ver, editar o administrar. Algunas acciones (como llaves de API o la configuración DIAN de la empresa) quedan reservadas exclusivamente al dueño de la cuenta, sin importar el rol del equipo.",
    },
    {
        module: "products",
        title: "Cómo crear un producto",
        sourceType: "guide",
        tags: ["inventario", "productos", "crear"],
        body: "En la sección Productos puedes crear nuevos productos para tu inventario. Cada producto puede organizarse por categoría y unidad de medida, tener variantes (por ejemplo, talla o color) e imágenes, y llevar su propio stock por punto de venta si tu plan incluye múltiples ubicaciones. Antes de crear productos suele ser útil tener ya creadas las categorías y unidades que vas a usar, desde sus propias secciones.",
    },
    {
        module: "products",
        title: "Categorías y unidades de medida",
        sourceType: "concept",
        tags: ["inventario", "categorias", "unidades"],
        body: "Las categorías te permiten agrupar productos (por ejemplo, 'Bebidas' o 'Ferretería') y las unidades de medida definen cómo se cuenta o se vende cada producto (unidad, kilogramo, caja, etc.). Ambas se administran en sus propias secciones y luego se asignan al crear o editar un producto.",
    },
    {
        module: "orders",
        title: "Cómo registrar una venta",
        sourceType: "guide",
        tags: ["ventas", "pedidos"],
        body: "La sección Pedidos/Ventas (Orders) es donde se registran las ventas a tus clientes. Al crear una venta seleccionas el cliente, los productos y cantidades, y el sistema descuenta el stock correspondiente. Las ventas pueden generar movimientos de caja y, si tu cuenta tiene la facturación electrónica DIAN activa, un comprobante electrónico asociado.",
    },
    {
        module: "orders",
        title: "Cotizaciones de venta",
        sourceType: "concept",
        tags: ["ventas", "cotizaciones"],
        body: "Antes de confirmar una venta puedes crear una cotización desde la sección Cotizaciones. Una cotización no afecta el inventario ni la caja; solo se convierte en una venta real cuando decides confirmarla.",
    },
    {
        module: "purchases",
        title: "Cómo registrar una compra",
        sourceType: "guide",
        tags: ["compras", "proveedores", "inventario"],
        body: "La sección Compras se usa para registrar lo que le compras a tus proveedores. Al crear una compra seleccionas el proveedor, los productos y cantidades, y el sistema aumenta el stock disponible de esos productos. Las compras también pueden generar movimientos de caja y, cuando aplica, un documento soporte para efectos de la DIAN.",
    },
    {
        module: "purchases",
        title: "Cotizaciones de compra",
        sourceType: "concept",
        tags: ["compras", "cotizaciones"],
        body: "Igual que en ventas, puedes registrar cotizaciones de compra antes de confirmarlas como una compra real. La cotización te sirve para comparar precios o condiciones con distintos proveedores sin afectar todavía tu inventario.",
    },
    {
        module: "customers",
        title: "Gestión de clientes",
        sourceType: "guide",
        tags: ["clientes"],
        body: "En la sección Clientes registras la información de las personas o empresas a las que les vendes: datos básicos, información fiscal cuando aplica, y su historial de compras dentro de Ohnix. Un cliente debe existir en esta sección antes de poder seleccionarlo al registrar una venta.",
    },
    {
        module: "suppliers",
        title: "Gestión de proveedores",
        sourceType: "guide",
        tags: ["proveedores"],
        body: "En la sección Proveedores registras a las empresas o personas que te venden productos o servicios. Un proveedor debe existir en esta sección antes de poder seleccionarlo al registrar una compra.",
    },
    {
        module: "finance",
        title: "Qué es el módulo de Finanzas",
        sourceType: "concept",
        tags: ["finanzas", "caja", "cartera"],
        body: "El módulo de Finanzas maneja el movimiento de dinero de tu negocio: cuentas de caja, pagos recibidos y realizados, y conciliación con extractos bancarios. Las ventas y compras pueden generar movimientos automáticamente aquí, según cómo las registres.",
    },
    {
        module: "accounting",
        title: "Qué es el módulo de Contabilidad",
        sourceType: "concept",
        tags: ["contabilidad", "libros contables"],
        body: "El módulo de Contabilidad muestra el plan de cuentas (chart of accounts) y los asientos contables (journal entries) que Ohnix genera automáticamente a partir de tus ventas, compras y movimientos de finanzas. También permite el cierre de periodos contables. El acceso de solo lectura o edición aquí depende del permiso de 'contabilidad' que tenga cada persona del equipo.",
    },
    {
        module: "accounting",
        title: "Diferencia entre Inventario y Contabilidad",
        sourceType: "faq",
        tags: ["contabilidad", "inventario", "diferencia"],
        body: "Inventario/Productos controla las existencias físicas de lo que vendes: cuántas unidades tienes, dónde y de qué producto. Contabilidad refleja el efecto financiero de esas operaciones (ventas, compras, pagos) en el plan de cuentas y los asientos contables. Son dos vistas del mismo negocio: una en unidades de producto, otra en valor monetario según el plan de cuentas.",
    },
    {
        module: "billing",
        title: "Planes y facturación de la suscripción de Ohnix",
        sourceType: "concept",
        tags: ["planes", "suscripcion", "facturacion"],
        body: "La sección Facturación (Billing) es donde administras la suscripción de tu cuenta a Ohnix: el plan contratado (Starter, Growth, Scale o Enterprise), el método de pago y el historial de cobros. Esto es distinto de la facturación electrónica DIAN que le emites a tus propios clientes, que se gestiona en Configuración DIAN y en Ventas.",
    },
    {
        module: "fiscal-setup",
        title: "Configuración DIAN de la empresa",
        sourceType: "dian",
        tags: ["dian", "configuracion", "facturacion electronica"],
        body: "En Configuración DIAN el dueño de la cuenta configura los datos fiscales de su empresa para poder emitir facturación electrónica. Esta habilitación es por empresa: activar la facturación electrónica en una cuenta no la activa automáticamente para otras empresas que administres. La disponibilidad de esta función depende del plan contratado. Para dudas específicas sobre requisitos legales o tributarios de la DIAN, consulta con tu contador o asesor tributario - este asistente no reemplaza esa asesoría.",
    },
    {
        module: "electronic-invoices",
        title: "Qué son los documentos electrónicos en Ohnix",
        sourceType: "dian",
        tags: ["dian", "facturacion electronica", "documentos"],
        body: "La sección Documentos Electrónicos muestra las facturas y notas crédito electrónicas emitidas ante la DIAN desde tus ventas, junto con su estado de validación. Para que esta sección tenga documentos, la empresa debe tener la facturación electrónica configurada y activa en Configuración DIAN. Si no ves esta opción o aparece deshabilitada, puede ser que tu plan no la incluya o que la configuración DIAN de tu empresa todavía no esté completa - no asumas que la facturación electrónica está activa sin confirmarlo en Configuración DIAN.",
    },
    {
        module: "purchase-support-documents",
        title: "Documento soporte de compras",
        sourceType: "dian",
        tags: ["dian", "documento soporte", "compras"],
        body: "El documento soporte es el equivalente, para tus compras, a la factura electrónica de tus ventas: se genera cuando le compras a un proveedor que no está obligado a facturar electrónicamente. Se gestiona desde la sección Documentos Soporte de Compras y depende de que la facturación electrónica de la empresa esté configurada.",
    },
    {
        module: "reports",
        title: "Qué encuentras en Reportes",
        sourceType: "concept",
        tags: ["reportes", "dashboard"],
        body: "La sección Reportes reúne los indicadores y reportes exportables del negocio: ventas, compras, inventario y finanzas, según los módulos a los que tengas acceso. El panel principal (Dashboard) muestra un resumen general y comparte el mismo permiso que Reportes.",
    },
    {
        module: "team",
        title: "Cómo invitar a alguien al equipo",
        sourceType: "guide",
        tags: ["equipo", "invitar", "roles"],
        body: "Desde la sección Equipo el dueño de la cuenta puede invitar a nuevas personas por correo electrónico y asignarles un rol. Cada rol define qué módulos puede ver, editar o administrar esa persona. Por defecto, un rol nuevo no tiene acceso a ningún módulo hasta que se le otorgue explícitamente.",
    },
    {
        module: "general",
        title: "Dónde encuentro soporte si el asistente no puede ayudarme",
        sourceType: "faq",
        tags: ["soporte", "ayuda", "escalamiento"],
        body: "Si tu pregunta trata sobre un problema específico de tu cuenta (por ejemplo, un saldo, un dato o un error puntual) o sobre algo que este asistente no tiene documentado todavía, lo mejor es contactar directamente al equipo de soporte de Ohnix, quienes pueden revisar el caso concreto de tu cuenta.",
    },
];

const run = async () => {
    try {
        await prisma.$connect();
        let created = 0;
        let updated = 0;

        for (const entry of ENTRIES) {
            const locale = entry.locale || "es";
            const existing = await prisma.assistantKnowledgeChunk.findUnique({
                where: {
                    module_locale_title: {
                        module: entry.module,
                        locale,
                        title: entry.title,
                    },
                },
                select: { id: true },
            });

            await prisma.assistantKnowledgeChunk.upsert({
                where: {
                    module_locale_title: {
                        module: entry.module,
                        locale,
                        title: entry.title,
                    },
                },
                create: {
                    module: entry.module,
                    locale,
                    title: entry.title,
                    body: entry.body,
                    tags: entry.tags || [],
                    sourceType: entry.sourceType || "guide",
                    isPublished: entry.isPublished === true,
                },
                update: {
                    body: entry.body,
                    tags: entry.tags || [],
                    sourceType: entry.sourceType || "guide",
                    // isPublished is intentionally NOT overwritten on update -
                    // once a human has reviewed and published an entry in the
                    // database, re-running this script to tweak wording
                    // elsewhere must not silently unpublish it again.
                },
            });

            if (existing) updated += 1;
            else created += 1;
        }

        console.log(`Assistant knowledge base seeded: ${created} created, ${updated} updated.`);
        console.log("All entries default to isPublished = false on first creation - review and publish in the database before the assistant can use them.");
    } catch (err) {
        console.error("Error seeding assistant knowledge base:", err);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
};

run();
