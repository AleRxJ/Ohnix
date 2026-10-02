import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { normalizeProductImage } from "../utils/productImage.js";
import { emitPosEvent } from "../live/dataEvents.js";

// Customer side of the restaurant QR (public /m/:token, no auth - the table's
// random publicToken is the only credential, see DiningTable.publicToken).
// Customers only ever create TableRequests; a waiter accepts an order before
// anything reaches the tab or the kitchen (tableTab.service.js#acceptRequest),
// so a photographed QR can't put food on someone's bill. Never exposes costs,
// stock or anything outside this one table's menu.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_LINES = 30;
const MAX_QTY = 20;
const MAX_PENDING_PER_TABLE = 3;
const REQUEST_TYPES = new Set(["order", "call_waiter", "bill"]);

const notFound = () => new ApiError(404, "Este código QR no está activo. Pide ayuda al personal.", [], "", "menu_not_found");

// Resolves the token to a table whose location has QR ordering on. Any
// failure is the same 404 - no hint whether the token exists.
const resolveTable = async (token) => {
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) throw notFound();
    const table = await prisma.diningTable.findUnique({
        where: { publicToken: token },
        include: { pointOfSale: { select: { id: true, name: true, isActive: true, qrOrderingEnabled: true, accountId: true } } },
    });
    if (!table || !table.isActive || !table.pointOfSale?.isActive || !table.pointOfSale.qrOrderingEnabled) throw notFound();
    return table;
};

const loadMenuProducts = (accountId, ids) =>
    prisma.product.findMany({
        where: {
            createdById: accountId,
            status: "active",
            isTutorialData: false,
            category: { menuVisible: true },
            ...(ids ? { id: { in: ids } } : {}),
        },
        select: {
            id: true,
            productName: true,
            sellingPrice: true,
            productImage: true,
            menuDescription: true,
            categoryId: true,
        },
        orderBy: { productName: "asc" },
    });

export const getPublicMenu = async (token) => {
    const table = await resolveTable(token);
    const accountId = table.pointOfSale.accountId;
    const [account, categories, products] = await Promise.all([
        prisma.user.findUnique({ where: { id: accountId }, select: { company: { select: { name: true, logoUrl: true } } } }),
        prisma.category.findMany({
            where: { createdById: accountId, menuVisible: true, isTutorialData: false },
            select: { id: true, categoryName: true, menuSortOrder: true },
            orderBy: [{ menuSortOrder: "asc" }, { categoryName: "asc" }],
        }),
        loadMenuProducts(accountId),
    ]);
    const used = new Set(products.map((p) => p.categoryId));
    return {
        restaurant: {
            name: account?.company?.name || table.pointOfSale.name,
            logo_url: account?.company?.logoUrl || null,
            location_name: table.pointOfSale.name,
        },
        table: { name: table.name, zone: table.zone },
        categories: categories.filter((c) => used.has(c.id)).map((c) => ({ _id: c.id, name: c.categoryName })),
        products: products.map((p) => ({
            _id: p.id,
            name: p.productName,
            price: Number(p.sellingPrice),
            image: normalizeProductImage(p.productImage),
            description: p.menuDescription || null,
            category_id: p.categoryId,
        })),
    };
};

const cleanText = (value, max) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    return text || null;
};

export const createPublicRequest = async (token, body = {}) => {
    const table = await resolveTable(token);
    const accountId = table.pointOfSale.accountId;
    const type = REQUEST_TYPES.has(body.type) ? body.type : "order";

    // "Llamar al mesero"/"Pedir la cuenta" pressed twice is one request.
    if (type !== "order") {
        const existing = await prisma.tableRequest.findFirst({ where: { tableId: table.id, type, status: "pending" } });
        if (existing) return { _id: existing.id, type, status: existing.status };
    }
    const pending = await prisma.tableRequest.count({ where: { tableId: table.id, status: "pending", type: "order" } });
    if (type === "order" && pending >= MAX_PENDING_PER_TABLE) {
        throw new ApiError(429, "Ya hay pedidos esperando confirmación en esta mesa. El mesero los revisará en un momento.", [], "", "menu_too_many_pending");
    }

    let items = [];
    if (type === "order") {
        const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_LINES) : [];
        const wanted = raw
            .map((i) => ({
                product_id: String(i?.product_id || ""),
                quantity: Math.min(Math.max(Number.parseInt(i?.quantity, 10) || 0, 0), MAX_QTY),
                note: cleanText(i?.note, 120),
            }))
            .filter((i) => i.product_id && i.quantity > 0);
        if (!wanted.length) throw new ApiError(400, "Agrega al menos un producto.", [], "", "menu_empty_order");
        // Prices always from the server, and only products on the menu.
        const products = await loadMenuProducts(accountId, [...new Set(wanted.map((i) => i.product_id))]);
        const byId = new Map(products.map((p) => [p.id, p]));
        items = wanted
            .filter((i) => byId.has(i.product_id))
            .map((i) => ({
                product_id: i.product_id,
                product_name: byId.get(i.product_id).productName,
                quantity: i.quantity,
                unit_price: Number(byId.get(i.product_id).sellingPrice),
                note: i.note,
            }));
        if (!items.length) throw new ApiError(400, "Los productos elegidos ya no están disponibles.", [], "", "menu_products_unavailable");
    }

    const openTab = await prisma.tableTab.findFirst({ where: { tableId: table.id, status: "open" }, select: { id: true } });
    const request = await prisma.tableRequest.create({
        data: {
            accountId,
            pointOfSaleId: table.pointOfSaleId,
            tableId: table.id,
            tabId: openTab?.id || null,
            type,
            items,
            note: cleanText(body.note, 200),
            customerName: cleanText(body.customer_name, 40),
        },
    });
    emitPosEvent(accountId, table.pointOfSaleId, "table", "request");
    return { _id: request.id, type, status: request.status };
};

// The customer's status screen polls this. Only the request's own state,
// and only for requests of this table.
export const getPublicRequest = async (token, requestId) => {
    const table = await resolveTable(token);
    const request = await prisma.tableRequest.findFirst({
        where: { id: String(requestId || ""), tableId: table.id },
        select: { id: true, type: true, status: true, tabId: true, createdAt: true, handledAt: true },
    });
    if (!request) throw new ApiError(404, "Solicitud no encontrada.", [], "", "menu_request_not_found");

    // Once accepted into the tab, report kitchen progress of its lines.
    let kitchen = null;
    if (request.status === "accepted" && request.tabId) {
        const lines = await prisma.tableTabItem.findMany({
            where: { tabId: request.tabId, id: { startsWith: `${request.id}-` } },
            select: { sentAt: true, kitchenStatus: true },
        });
        if (lines.length) {
            const order = ["pending", "preparing", "ready", "served"];
            const sent = lines.filter((l) => l.sentAt);
            kitchen = !sent.length ? "confirmed" : order[Math.min(...sent.map((l) => order.indexOf(l.kitchenStatus)))];
        }
    }
    return { _id: request.id, type: request.type, status: request.status, kitchen, created_at: request.createdAt, handled_at: request.handledAt };
};
