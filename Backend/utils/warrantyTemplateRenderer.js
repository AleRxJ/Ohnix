// Replaces {{var}} placeholders in a warranty notification template with
// plain values - intentionally not a full templating engine (no loops/
// conditionals): the spec's own examples (section 7) are flat
// "{{cliente_nombre}}" substitutions, and a merchant editing a WhatsApp
// template stays limited to Meta's own positional-parameter model anyway
// (see notificationProviders/whatsappProvider.js).
const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export const renderTemplate = (template, variables = {}) =>
    String(template || "").replace(PLACEHOLDER_PATTERN, (match, key) =>
        Object.prototype.hasOwnProperty.call(variables, key) && variables[key] != null ? String(variables[key]) : ""
    );

// Variable keys pulled from the resolved Warranty/Customer/account state -
// see warranty.service.js#buildTemplateVariables. Kept here so both the
// backend renderer and the frontend preview (WarrantySettings.jsx) can
// import the same catalog if needed.
export const WARRANTY_TEMPLATE_VARIABLES = [
    "cliente_nombre",
    "empresa_nombre",
    "producto_nombre",
    "garantia_id",
    "fecha_compra",
    "fecha_vencimiento",
    "numero_factura",
    "estado_garantia",
    "empresa_telefono",
    "empresa_direccion",
];
