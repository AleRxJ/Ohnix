// Hardcoded fallback templates (Spanish, per the warranties spec's own
// section 7 examples) used whenever an account has no
// WarrantyNotificationTemplate row for a given (event, channel) - so a
// brand-new account gets working notifications without a seed migration,
// same "missing row = default behavior" idiom used elsewhere (e.g. a role
// with no TeamRolePermission row reading as "none").
//
// Only WarrantyStatus values that make sense to notify a customer about are
// listed here (mirrors the checklist in section 6) - "in_review" and
// "waiting_part" are internal-facing steps a merchant tracks but doesn't
// necessarily need to message the customer about by default.
export const NOTIFIABLE_EVENTS = ["registered", "received", "approved", "rejected", "in_repair", "ready", "closed"];

const email = (subject, body) => ({ subject, body });

export const DEFAULT_EMAIL_TEMPLATES = {
    registered: email(
        "Hemos recibido tu solicitud de garantía - {{garantia_id}}",
        "Hola {{cliente_nombre}}, hemos recibido tu solicitud de garantía para {{producto_nombre}}.\n\nNúmero de garantía: {{garantia_id}}\n\nTe mantendremos informado sobre el proceso.\n\n{{empresa_nombre}}"
    ),
    received: email(
        "Producto recibido - Garantía {{garantia_id}}",
        "Hola {{cliente_nombre}}, confirmamos que recibimos el producto {{producto_nombre}} asociado a tu garantía {{garantia_id}}.\n\nTe avisaremos cuando tengamos una actualización.\n\n{{empresa_nombre}}"
    ),
    approved: email(
        "Tu garantía {{garantia_id}} fue aprobada",
        "Hola {{cliente_nombre}}, tu garantía {{garantia_id}} ha sido aprobada.\n\nProducto: {{producto_nombre}}\n\nNuestro equipo continuará con el proceso correspondiente.\n\n{{empresa_nombre}}"
    ),
    rejected: email(
        "Actualización sobre tu garantía {{garantia_id}}",
        "Hola {{cliente_nombre}}, luego de revisar tu garantía {{garantia_id}} para {{producto_nombre}}, no fue posible aprobarla.\n\nSi tienes preguntas, contáctanos.\n\n{{empresa_nombre}}"
    ),
    in_repair: email(
        "Tu producto está en reparación - Garantía {{garantia_id}}",
        "Hola {{cliente_nombre}}, el producto {{producto_nombre}} de tu garantía {{garantia_id}} ya está en reparación.\n\nTe avisaremos cuando esté listo.\n\n{{empresa_nombre}}"
    ),
    ready: email(
        "Tu producto está listo para entrega - Garantía {{garantia_id}}",
        "Hola {{cliente_nombre}}, tenemos buenas noticias 🎉\n\nEl producto {{producto_nombre}} asociado a la garantía {{garantia_id}} ya está listo para entrega.\n\nPuedes acercarte a {{empresa_nombre}} para reclamarlo.\n\n{{empresa_direccion}}"
    ),
    closed: email(
        "Tu garantía {{garantia_id}} fue cerrada",
        "Hola {{cliente_nombre}}, tu garantía {{garantia_id}} para {{producto_nombre}} ha sido cerrada.\n\nGracias por tu confianza.\n\n{{empresa_nombre}}"
    ),
};

// Used for a manual send (section 9) whose current status has no entry
// above (e.g. "in_review"/"waiting_part", which aren't in NOTIFIABLE_EVENTS)
// - a merchant explicitly asking to notify the customer should always get a
// message, not a silent no-op just because that particular status has no
// dedicated default copy.
export const GENERIC_UPDATE_TEMPLATE = email(
    "Actualización sobre tu garantía {{garantia_id}}",
    "Hola {{cliente_nombre}}, tenemos una actualización sobre tu garantía {{garantia_id}} para {{producto_nombre}}.\n\nEstado actual: {{estado_garantia}}\n\n{{empresa_nombre}}"
);

// Phase 1: no real Meta-approved template exists for any account yet, so
// this is preview-only text shown in the WhatsApp tab of the "vista previa"
// (section 9) - see notificationProviders/whatsappProvider.js's comment for
// why the ACTUAL send needs a pre-approved template name, not this text.
export const DEFAULT_WHATSAPP_TEMPLATES = Object.fromEntries(
    Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([event, { body }]) => [event, body])
);
