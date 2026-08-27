// Hand-maintained OpenAPI 3.0 document for the public API (/api/v1/public/*
// and the API-key-scoped inventory/webhook routes) - see
// routes/publicApi.routes.js, which is the actual source of truth this
// must stay in sync with. Only documents endpoints that exist and work;
// nothing here is aspirational (see the e-commerce integration design's
// "NO documentes endpoints que no existen" rule).
const errorResponse = {
    type: "object",
    properties: {
        statusCode: { type: "integer", example: 400 },
        success: { type: "boolean", example: false },
        message: { type: "string", example: "A human-readable description of what went wrong" },
        errors: { type: "array", items: {} },
    },
};

const apiResponse = (dataSchema) => ({
    type: "object",
    properties: {
        statusCode: { type: "integer" },
        data: dataSchema,
        message: { type: "string" },
        success: { type: "boolean", example: true },
    },
});

const product = {
    type: "object",
    properties: {
        _id: { type: "string" },
        product_name: { type: "string" },
        product_code: { type: "string" },
        sku: { type: "string", nullable: true },
        barcode: { type: "string", nullable: true },
        brand: { type: "string", nullable: true },
        status: { type: "string", enum: ["draft", "active", "archived"] },
        category_id: { type: "object", nullable: true },
        unit_id: { type: "object", nullable: true },
        buying_price: { type: "number" },
        selling_price: { type: "number" },
        stock: { type: "integer" },
        product_image: { type: "string", nullable: true },
        images: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    _id: { type: "string" },
                    url: { type: "string" },
                    position: { type: "integer" },
                    is_primary: { type: "boolean" },
                },
            },
        },
        is_physical: { type: "boolean" },
        weight_value: { type: "number", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
    },
};

const variant = {
    type: "object",
    properties: {
        _id: { type: "string" },
        product_id: { type: "string" },
        sku: { type: "string", nullable: true },
        barcode: { type: "string", nullable: true },
        options_label: { type: "string", example: "Negra / M" },
        options: { type: "object", example: { Color: "Negra", Talla: "M" } },
        selling_price: { type: "number", nullable: true },
        stock: { type: "integer" },
        status: { type: "string", enum: ["draft", "active", "archived"] },
    },
};

const order = {
    type: "object",
    properties: {
        _id: { type: "string" },
        customer_id: { type: "object" },
        order_status: { type: "string", enum: ["pending", "processing", "completed", "cancelled", "returned"] },
        total_products: { type: "integer" },
        sub_total: { type: "number" },
        gst: { type: "number" },
        total: { type: "number" },
        invoice_no: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
    },
};

const customer = {
    type: "object",
    properties: {
        _id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string", nullable: true },
    },
};

const apiKeyAuth = [{ ApiKeyAuth: [] }, { ApiKeyBearer: [] }];

const jsonBody = (schema) => ({ "application/json": { schema } });

const withScope = (scope, summary) => `${summary}\n\nRequires scope: \`${scope}\``;

export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "Ohnix Public API",
        version: "1.0.0",
        description:
            "API pública de Ohnix para integrar tiendas y sistemas externos (e-commerce, ERPs, sistemas propios) con los productos, variantes, inventario, pedidos y clientes de una cuenta Ohnix. Ver /api/v1/docs para la guía completa para desarrolladores.",
        contact: { name: "Ohnix" },
    },
    servers: [{ url: "/api/v1/public", description: "Public API v1" }],
    security: apiKeyAuth,
    components: {
        securitySchemes: {
            ApiKeyBearer: { type: "http", scheme: "bearer", bearerFormat: "ohx_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", description: "Authorization: Bearer <api key>" },
            ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "Alternative header form of the same API key" },
        },
        schemas: { Product: product, ProductVariant: variant, Order: order, Customer: customer, Error: errorResponse },
        responses: {
            Unauthorized: { description: "Missing or invalid API key", content: jsonBody(errorResponse) },
            Forbidden: { description: "The API key lacks the required scope, or the plan doesn't include API access", content: jsonBody(errorResponse) },
            NotFound: { description: "Resource not found", content: jsonBody(errorResponse) },
            RateLimited: { description: "Daily request limit reached", content: jsonBody(errorResponse) },
        },
    },
    paths: {
        "/products": {
            get: {
                summary: withScope("products:read", "List products"),
                tags: ["Products"],
                responses: { 200: { description: "OK", content: jsonBody(apiResponse({ type: "array", items: product })) }, 401: { $ref: "#/components/responses/Unauthorized" }, 403: { $ref: "#/components/responses/Forbidden" } },
            },
            post: {
                summary: withScope("products:write", "Create a product"),
                tags: ["Products"],
                requestBody: { content: jsonBody({ type: "object", required: ["product_name", "product_code", "category_id", "unit_id", "buying_price", "selling_price"], properties: { product_name: { type: "string" }, product_code: { type: "string" }, sku: { type: "string" }, barcode: { type: "string" }, brand: { type: "string" }, category_id: { type: "string" }, unit_id: { type: "string" }, buying_price: { type: "number" }, selling_price: { type: "number" } } }) },
                responses: { 201: { description: "Created", content: jsonBody(apiResponse(product)) }, 400: { description: "Validation error", content: jsonBody(errorResponse) } },
            },
        },
        "/products/{id}": {
            get: { summary: withScope("products:read", "Get one product"), tags: ["Products"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: jsonBody(apiResponse(product)) }, 404: { $ref: "#/components/responses/NotFound" } } },
            patch: { summary: withScope("products:write", "Update a product"), tags: ["Products"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: jsonBody({ type: "object" }) }, responses: { 200: { description: "OK", content: jsonBody(apiResponse(product)) } } },
        },
        "/products/{id}/variants": {
            get: { summary: withScope("variants:read", "List a product's variants"), tags: ["Variants"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: jsonBody(apiResponse({ type: "array", items: variant })) } } },
            post: {
                summary: withScope("variants:write", "Create a variant"),
                tags: ["Variants"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: { content: jsonBody({ type: "object", required: ["options"], properties: { sku: { type: "string" }, barcode: { type: "string" }, options: { type: "object", example: { Color: "Negra", Talla: "M" } }, selling_price: { type: "number" }, stock: { type: "integer" } } }) },
                responses: { 201: { description: "Created", content: jsonBody(apiResponse(variant)) } },
            },
        },
        "/variants/{variantId}": {
            patch: { summary: withScope("variants:write", "Update a variant"), tags: ["Variants"], parameters: [{ name: "variantId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: jsonBody(apiResponse(variant)) } } },
            delete: { summary: withScope("variants:write", "Delete a variant"), tags: ["Variants"], parameters: [{ name: "variantId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
        },
        "/variants/{variantId}/adjust-stock": {
            post: {
                summary: withScope("inventory:write", "Adjust a variant's stock"),
                tags: ["Inventory"],
                parameters: [{ name: "variantId", in: "path", required: true, schema: { type: "string" } }],
                requestBody: { content: jsonBody({ type: "object", required: ["delta", "reason"], properties: { delta: { type: "integer", example: -1 }, reason: { type: "string" } } }) },
                responses: { 200: { description: "OK", content: jsonBody(apiResponse(variant)) }, 409: { description: "Not enough stock", content: jsonBody(errorResponse) } },
            },
        },
        "/inventory/{id}": {
            get: { summary: withScope("inventory:read", "Get a product's stock by location"), tags: ["Inventory"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
        },
        "/inventory/{id}/movements": {
            get: { summary: withScope("inventory:read", "List a product's stock movement ledger"), tags: ["Inventory"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
        },
        "/inventory/{id}/adjust": {
            post: {
                summary: withScope("inventory:write", "Adjust a product's stock"),
                tags: ["Inventory"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: { content: jsonBody({ type: "object", required: ["delta", "reason"], properties: { delta: { type: "integer" }, reason: { type: "string" } } }) },
                responses: { 200: { description: "OK" }, 409: { description: "Not enough stock", content: jsonBody(errorResponse) } },
            },
        },
        "/customers": {
            get: { summary: withScope("customers:read", "List customers"), tags: ["Customers"], responses: { 200: { description: "OK", content: jsonBody(apiResponse({ type: "array", items: customer })) } } },
            post: { summary: withScope("customers:write", "Create a customer"), tags: ["Customers"], requestBody: { content: jsonBody({ type: "object", required: ["name", "email", "phone"], properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address: { type: "string" } } }) }, responses: { 201: { description: "Created", content: jsonBody(apiResponse(customer)) } } },
        },
        "/orders": {
            get: { summary: withScope("orders:read", "List orders"), tags: ["Orders"], responses: { 200: { description: "OK", content: jsonBody(apiResponse({ type: "array", items: order })) } } },
            post: {
                summary: withScope("orders:write", "Create an order"),
                tags: ["Orders"],
                parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" }, description: "Safe to retry: the same key replays the first response instead of creating a second order." }],
                requestBody: { content: jsonBody({ type: "object", required: ["customer_id", "orderItems"], properties: { customer_id: { type: "string" }, order_status: { type: "string", enum: ["pending", "processing", "completed"] }, orderItems: { type: "array", items: { type: "object", properties: { product_id: { type: "string" }, variant_id: { type: "string" }, quantity: { type: "integer" }, unitcost: { type: "number" } } } } } }) },
                responses: { 201: { description: "Created", content: jsonBody(apiResponse(order)) }, 422: { description: "Insufficient stock", content: jsonBody(errorResponse) } },
            },
        },
        "/orders/{id}/details": { get: { summary: withScope("orders:read", "Get an order's line items"), tags: ["Orders"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } } },
        "/orders/{id}/status": {
            patch: {
                summary: withScope("orders:write", "Update an order's status"),
                tags: ["Orders"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: { content: jsonBody({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["processing", "completed", "cancelled"] } } }) },
                responses: { 200: { description: "OK" }, 400: { description: "Invalid status transition", content: jsonBody(errorResponse) } },
            },
        },
        "/webhooks": {
            get: { summary: withScope("webhooks:write", "List registered webhook endpoints"), tags: ["Webhooks"], responses: { 200: { description: "OK" } } },
            post: {
                summary: withScope("webhooks:write", "Register a webhook endpoint"),
                tags: ["Webhooks"],
                requestBody: { content: jsonBody({ type: "object", required: ["url", "events"], properties: { url: { type: "string", format: "uri", example: "https://example.com/ohnix/webhook" }, events: { type: "array", items: { type: "string" }, example: ["order.created", "inventory.updated"] } } }) },
                responses: { 201: { description: "Created - the signing secret is only ever shown in this response" } },
            },
        },
        "/webhooks/{id}": {
            patch: { summary: withScope("webhooks:write", "Update a webhook endpoint"), tags: ["Webhooks"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
            delete: { summary: withScope("webhooks:write", "Delete a webhook endpoint"), tags: ["Webhooks"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
        },
        "/webhooks/events": { get: { summary: "List available webhook event types", tags: ["Webhooks"], security: [], responses: { 200: { description: "OK" } } } },
    },
};
