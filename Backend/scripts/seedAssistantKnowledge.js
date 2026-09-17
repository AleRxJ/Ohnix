// Seeds/updates the assistant's knowledge base (AssistantKnowledgeChunk).
//
// Every entry below is published (isPublished: true) on creation by default,
// per an explicit decision to launch with this first draft as-is rather than
// hold it for review - including the "dian" sourceType entries. That draft
// was written from the codebase (routes, permissions, services) by an agent
// that has not used Ohnix's UI and does NOT have DIAN/tax/accounting domain
// expertise, so treat it as a starting point to correct in place (edit the
// text below and re-run) rather than as reviewed fact, especially anything
// about electronic invoicing availability, which differs by plan/company.
// To hold a specific entry back, add `isPublished: false` to its object.
//
// Usage:
//   node --env-file=.env scripts/seedAssistantKnowledge.js
// Safe to re-run: upserts on the (module, locale, title) unique key, so
// editing the text below and re-running updates existing rows instead of
// duplicating them.
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
    {
        module: "profile",
        title: "Sesiones activas y cierre de sesión remoto",
        sourceType: "guide",
        tags: ["sesiones", "seguridad", "dispositivos"],
        body: "Desde Perfil > Sesiones puedes ver los dispositivos donde tu cuenta tiene una sesión activa (por ejemplo, si iniciaste sesión desde el celular y desde el computador) y cerrar cualquiera de ellas de forma individual, sin necesidad de cambiar tu contraseña. Es útil si olvidaste cerrar sesión en un equipo compartido o no reconoces un inicio de sesión.",
    },
    {
        module: "team",
        title: "Visibilidad de sesiones para el dueño de la cuenta y para administradores",
        sourceType: "concept",
        tags: ["equipo", "sesiones", "seguridad", "permisos"],
        body: "El dueño de una cuenta puede ver las sesiones activas de su equipo y cerrar la sesión de un miembro específico (por ejemplo, si alguien dejó de trabajar contigo), pero solo dentro de su propio equipo. La visibilidad de todas las sesiones de todas las cuentas de la plataforma está reservada al equipo de administración de Ohnix, no a los dueños de cuentas individuales.",
    },
    {
        module: "general",
        title: "Tour guiado de introducción a Ohnix",
        sourceType: "guide",
        tags: ["tour", "onboarding", "ayuda", "tutorial"],
        body: "Ohnix ofrece un tour guiado (el botón flotante con la brújula) que te lleva paso a paso por lo esencial: crear una categoría, una unidad de medida, un producto, un proveedor y un cliente, y luego registrar una compra y una venta de práctica. El tour avanza automáticamente cuando completas cada paso real y puedes cerrarlo y retomarlo después desde donde lo dejaste. Los registros que creas durante el tour quedan marcados como datos de práctica, y puedes borrarlos o conservarlos al descartar el botón del tour. Si ya lo descartaste y quieres volver a verlo, puedes reactivarlo desde Perfil > Configuración de la cuenta.",
    },
    {
        module: "general",
        title: "Trabajar sin conexión a internet (modo offline)",
        sourceType: "concept",
        tags: ["offline", "sin conexion", "sincronizacion"],
        body: "En los módulos principales (Productos, Pedidos/Ventas, Compras, Clientes, Proveedores, Categorías) Ohnix sigue funcionando aunque se pierda la conexión a internet: puedes seguir creando y editando registros, y un indicador muestra que hay cambios pendientes por sincronizar. En cuanto vuelve la conexión, esos cambios se envían automáticamente al servidor; si un mismo registro cambió también desde otro lugar mientras estabas sin conexión, el sistema te avisa del conflicto para que decidas cómo resolverlo. Equipo, Facturación, Integraciones y Contabilidad no funcionan sin conexión, ya que dependen de datos que siempre deben estar sincronizados con el servidor; en esos módulos verás un aviso pidiendo restablecer la conexión en vez de un error.",
    },
    {
        module: "team",
        title: "Puntos de venta y traslados de stock entre ubicaciones",
        sourceType: "guide",
        tags: ["puntos de venta", "traslados", "inventario", "multi-ubicacion"],
        body: "Si tu plan incluye múltiples ubicaciones (multi-location), puedes crear varios puntos de venta desde Equipo > Puntos de Venta y llevar el stock de cada producto por separado en cada uno. Para mover inventario de un punto de venta a otro se usa un traslado de stock: se solicita el traslado, la ubicación de origen lo despacha y la de destino lo recibe (o se puede cancelar antes de despacharlo). El stock disponible de un producto solo se actualiza en cada extremo cuando el traslado pasa por esos pasos, no al momento de solicitarlo.",
    },
    {
        module: "products",
        title: "Variantes de producto",
        sourceType: "concept",
        tags: ["variantes", "inventario", "productos"],
        body: "Un producto puede tener variantes (por ejemplo, distintas tallas o colores), cada una con su propio stock que se ajusta de forma independiente al del producto base. Esto permite vender 'Camiseta talla M' y 'Camiseta talla L' como el mismo producto pero con inventarios separados, en lugar de crear un producto distinto por cada variante.",
    },
    {
        module: "products",
        title: "Galería de imágenes de producto",
        sourceType: "concept",
        tags: ["imagenes", "productos"],
        body: "Cada producto admite varias imágenes, no solo una: puedes agregarlas, reordenarlas, eliminarlas y elegir cuál se muestra como imagen principal en los listados.",
    },
    {
        module: "products",
        title: "Carga masiva de productos desde un archivo",
        sourceType: "guide",
        tags: ["carga masiva", "importar", "productos", "csv"],
        body: "Si tu plan incluye carga masiva (bulk upload), en Productos puedes importar muchos productos a la vez desde un archivo en lugar de crearlos uno por uno, útil cuando estás migrando un catálogo grande a Ohnix por primera vez.",
    },
    {
        module: "integrations",
        title: "Llaves API, webhooks e integraciones con Shopify/WooCommerce",
        sourceType: "guide",
        tags: ["api", "webhooks", "integraciones", "shopify", "woocommerce", "desarrolladores"],
        body: "La sección Integraciones (disponible según el plan y solo para el dueño de la cuenta, no para miembros del equipo) permite generar llaves de API para conectar Ohnix con sistemas externos, registrar webhooks que notifican a otro sistema cuando ocurre un evento (por ejemplo, una venta nueva) y ver el historial de esas notificaciones. También permite conectar una tienda de Shopify o WooCommerce para publicar productos desde Ohnix y mantener el inventario sincronizado en ambos sentidos. Ohnix también expone documentación técnica de su API pública (Swagger) para que un desarrollador externo pueda integrarse.",
    },
    {
        module: "general",
        title: "Ohnix también está disponible como app de escritorio y móvil",
        sourceType: "faq",
        tags: ["desktop", "movil", "app"],
        body: "Además de usarse desde el navegador, Ohnix tiene una versión de escritorio (Windows/Mac) y una app móvil que abren la misma plataforma web en una ventana o app dedicada, con actualizaciones automáticas. Por ahora ofrecen la misma experiencia que el navegador, sin funciones adicionales propias del dispositivo todavía.",
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
                    isPublished: entry.isPublished !== false,
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
        console.log("New entries default to isPublished = true on first creation (see ENTRIES comment above) - to hold one back for review, add isPublished: false to its object and re-run.");
    } catch (err) {
        console.error("Error seeding assistant knowledge base:", err);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
};

run();
