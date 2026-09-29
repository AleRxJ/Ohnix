import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPosAccess, resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";
import { emitPosEvent } from "../live/dataEvents.js";

// Restaurant mode of the Caja (see DiningTable/TableTab in schema.prisma).
// Everything is scoped to the company (accountId) and, for restricted team
// members, to their own points of sale. Tab and item ids come from the
// client so the whole flow - open, add, send to kitchen, charge - also works
// while offline, replayed later through the outbox.

const MAX_TABLES_PER_LOCATION = 300;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const assertClientId = (id, label) => {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        throw new ApiError(400, `${label} must be a client-generated id (8-64 chars, letters/digits/-/_).`, [], "", "table_tab_invalid_id");
    }
};

const scopeFilter = (user) =>
    user.role !== "admin" && !user.posScopeAll ? { pointOfSaleId: { in: user.posScopeIds || [] } } : {};

export const mapTable = (table) => ({
    _id: table.id,
    point_of_sale_id: table.pointOfSaleId,
    name: table.name,
    zone: table.zone,
    seats: table.seats,
    sort_order: table.sortOrder,
    is_active: table.isActive,
    updatedAt: table.updatedAt,
});

export const mapTab = (tab) => {
    const items = (tab.items || [])
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map((item) => ({
            _id: item.id,
            product_id: item.productId,
            product_name: item.productName,
            quantity: item.quantity,
            unit_price: Number(item.unitPrice),
            note: item.note,
            sent_at: item.sentAt,
            created_at: item.createdAt,
        }));
    return {
        _id: tab.id,
        table_id: tab.tableId,
        table_name: tab.table?.name || null,
        point_of_sale_id: tab.pointOfSaleId,
        status: tab.status,
        guests: tab.guests,
        note: tab.note,
        order_id: tab.orderId,
        opened_at: tab.openedAt,
        updatedAt: tab.updatedAt,
        items,
        subtotal: items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        unsent_count: items.filter((i) => !i.sent_at).reduce((sum, i) => sum + i.quantity, 0),
    };
};

const TAB_INCLUDE = { items: true, table: { select: { name: true } } };

// --- Tables (configuration) -------------------------------------------------

export const listTables = async ({ user, pointOfSaleId, includeInactive = false }) => {
    const tables = await prisma.diningTable.findMany({
        where: {
            accountId: user.prismaId,
            ...scopeFilter(user),
            ...(pointOfSaleId ? { pointOfSaleId } : {}),
            ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return tables.map(mapTable);
};

export const createTables = async ({ req, tables }) => {
    const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
    const rows = (Array.isArray(tables) ? tables : [tables])
        .map((t) => ({
            name: String(t?.name || "").trim().slice(0, 40),
            zone: String(t?.zone || "").trim().slice(0, 40) || null,
            seats: Math.min(Math.max(Number.parseInt(t?.seats, 10) || 4, 1), 50),
        }))
        .filter((t) => t.name);
    if (!rows.length) throw new ApiError(400, "Escribe el nombre de la mesa.", [], "", "table_name_required");

    const existing = await prisma.diningTable.count({ where: { pointOfSaleId } });
    if (existing + rows.length > MAX_TABLES_PER_LOCATION) {
        throw new ApiError(400, `Máximo ${MAX_TABLES_PER_LOCATION} mesas por punto de venta.`, [], "", "table_limit");
    }
    const taken = await prisma.diningTable.findMany({
        where: { pointOfSaleId, name: { in: rows.map((r) => r.name) } },
        select: { name: true, isActive: true, id: true },
    });
    // Re-creating a previously deactivated table just brings it back.
    const reactivate = taken.filter((t) => !t.isActive);
    const clash = taken.filter((t) => t.isActive).map((t) => t.name);
    if (clash.length) throw new ApiError(409, `Ya existe: ${clash.join(", ")}.`, [], "", "table_name_taken");

    await prisma.$transaction([
        ...reactivate.map((t) => prisma.diningTable.update({ where: { id: t.id }, data: { isActive: true } })),
        prisma.diningTable.createMany({
            data: rows
                .filter((r) => !reactivate.some((t) => t.name === r.name))
                .map((r, index) => ({ ...r, accountId: req.user.prismaId, pointOfSaleId, sortOrder: existing + index })),
        }),
    ]);
    emitPosEvent(req.user.prismaId, pointOfSaleId, "table", "created");
    return listTables({ user: req.user, pointOfSaleId });
};

const findTable = async (user, tableId) => {
    const table = await prisma.diningTable.findFirst({ where: { id: tableId, accountId: user.prismaId } });
    if (!table) throw new ApiError(404, "Mesa no encontrada.", [], "", "table_not_found");
    if (user.role !== "admin") assertPosAccess(user, table.pointOfSaleId);
    return table;
};

export const updateTable = async ({ user, tableId, name, zone, seats, sortOrder, isActive }) => {
    const table = await findTable(user, tableId);
    if (isActive === false) {
        const open = await prisma.tableTab.count({ where: { tableId, status: "open" } });
        if (open) throw new ApiError(409, "La mesa tiene una cuenta abierta; ciérrala antes de desactivarla.", [], "", "table_has_open_tab");
    }
    try {
        const updated = await prisma.diningTable.update({
            where: { id: table.id },
            data: {
                ...(name !== undefined ? { name: String(name).trim().slice(0, 40) } : {}),
                ...(zone !== undefined ? { zone: String(zone || "").trim().slice(0, 40) || null } : {}),
                ...(seats !== undefined ? { seats: Math.min(Math.max(Number.parseInt(seats, 10) || 4, 1), 50) } : {}),
                ...(sortOrder !== undefined ? { sortOrder: Number.parseInt(sortOrder, 10) || 0 } : {}),
                ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
            },
        });
        emitPosEvent(user.prismaId, table.pointOfSaleId, "table", "updated");
        return mapTable(updated);
    } catch (error) {
        if (error?.code === "P2002") throw new ApiError(409, "Ya existe una mesa con ese nombre.", [], "", "table_name_taken");
        throw error;
    }
};

// --- Tabs ---------------------------------------------------------------------

export const listOpenTabs = async ({ user, pointOfSaleId }) => {
    const tabs = await prisma.tableTab.findMany({
        where: { accountId: user.prismaId, status: "open", ...scopeFilter(user), ...(pointOfSaleId ? { pointOfSaleId } : {}) },
        include: TAB_INCLUDE,
        orderBy: { openedAt: "asc" },
    });
    return tabs.map(mapTab);
};

const findTab = async (user, tabId, { requireOpen = true } = {}) => {
    const tab = await prisma.tableTab.findFirst({ where: { id: tabId, accountId: user.prismaId }, include: TAB_INCLUDE });
    if (!tab) throw new ApiError(404, "Cuenta no encontrada.", [], "", "table_tab_not_found");
    if (user.role !== "admin") assertPosAccess(user, tab.pointOfSaleId);
    if (requireOpen && tab.status !== "open") {
        throw new ApiError(409, "Esta cuenta ya fue cerrada.", [], "", "table_tab_closed");
    }
    return tab;
};

// Idempotent by client id: replaying the same "open" (outbox retry) returns
// the same tab. A different device opening the same table meanwhile gets a
// 409 naming the tab that's already open there.
export const openTab = async ({ user, id, tableId, guests, note }) => {
    assertClientId(id, "id");
    const existing = await prisma.tableTab.findFirst({ where: { id, accountId: user.prismaId }, include: TAB_INCLUDE });
    if (existing) return mapTab(existing);

    const table = await findTable(user, tableId);
    if (!table.isActive) throw new ApiError(400, "La mesa está desactivada.", [], "", "table_inactive");
    try {
        const tab = await prisma.tableTab.create({
            data: {
                id,
                accountId: user.prismaId,
                pointOfSaleId: table.pointOfSaleId,
                tableId: table.id,
                guests: guests ? Math.min(Math.max(Number.parseInt(guests, 10) || 1, 1), 99) : null,
                note: note ? String(note).trim().slice(0, 200) : null,
                openedById: user.actorId,
            },
            include: TAB_INCLUDE,
        });
        emitPosEvent(user.prismaId, table.pointOfSaleId, "table", "tab-opened");
        return mapTab(tab);
    } catch (error) {
        if (error?.code === "P2002") {
            throw new ApiError(409, `La mesa ${table.name} ya tiene una cuenta abierta.`, [], "", "table_already_open");
        }
        throw error;
    }
};

export const updateTab = async ({ user, tabId, tableId, guests, note }) => {
    const tab = await findTab(user, tabId);
    let targetTableId;
    if (tableId && tableId !== tab.tableId) {
        const target = await findTable(user, tableId);
        if (target.pointOfSaleId !== tab.pointOfSaleId) throw new ApiError(400, "Solo puedes mover la cuenta a una mesa del mismo punto de venta.", [], "", "table_move_other_pos");
        targetTableId = target.id;
    }
    try {
        const updated = await prisma.tableTab.update({
            where: { id: tab.id },
            data: {
                ...(targetTableId ? { tableId: targetTableId } : {}),
                ...(guests !== undefined ? { guests: guests ? Math.min(Math.max(Number.parseInt(guests, 10) || 1, 1), 99) : null } : {}),
                ...(note !== undefined ? { note: note ? String(note).trim().slice(0, 200) : null } : {}),
            },
            include: TAB_INCLUDE,
        });
        emitPosEvent(user.prismaId, tab.pointOfSaleId, "table", "tab-updated");
        return mapTab(updated);
    } catch (error) {
        if (error?.code === "P2002") throw new ApiError(409, "Esa mesa ya tiene una cuenta abierta.", [], "", "table_already_open");
        throw error;
    }
};

// Add (positive delta) or remove (negative) units on one line. The line id
// is the client's, so "add 1 more coffee" from two devices becomes two
// increments on the same row instead of two conflicting absolute writes.
// Replays are de-duplicated by the route's idempotency key.
export const applyItemDelta = async ({ user, tabId, lineId, productId, delta, unitPrice, note }) => {
    assertClientId(lineId, "line_id");
    const change = Number.parseInt(delta, 10);
    if (!Number.isFinite(change) || change === 0) throw new ApiError(400, "quantity_delta must be a non-zero integer.", [], "", "table_tab_invalid_delta");
    const tab = await findTab(user, tabId);

    const result = await prisma.$transaction(async (tx) => {
        const line = await tx.tableTabItem.findFirst({ where: { id: lineId, tabId: tab.id } });
        if (!line) {
            if (change < 0) return null; // removing from a line that's already gone
            const product = await tx.product.findFirst({
                where: { OR: [{ id: productId }, { legacyMongoId: productId }], createdById: user.prismaId },
                select: { id: true, productName: true, sellingPrice: true },
            });
            if (!product) throw new ApiError(404, "Producto no encontrado.", [], "", "table_tab_product_not_found");
            return tx.tableTabItem.create({
                data: {
                    id: lineId,
                    tabId: tab.id,
                    productId: product.id,
                    productName: product.productName,
                    quantity: change,
                    unitPrice: unitPrice !== undefined && unitPrice !== null ? Math.max(0, Number(unitPrice) || 0) : Number(product.sellingPrice),
                    note: note ? String(note).trim().slice(0, 120) : null,
                    createdById: user.actorId,
                },
            });
        }
        const quantity = line.quantity + change;
        if (quantity <= 0) {
            await tx.tableTabItem.delete({ where: { id: line.id } });
            return null;
        }
        return tx.tableTabItem.update({ where: { id: line.id }, data: { quantity } });
    });
    await prisma.tableTab.update({ where: { id: tab.id }, data: { updatedAt: new Date() } });
    emitPosEvent(user.prismaId, tab.pointOfSaleId, "table", "tab-updated");
    return { line: result ? { _id: result.id, quantity: result.quantity } : null };
};

export const updateItem = async ({ user, tabId, lineId, unitPrice, note }) => {
    const tab = await findTab(user, tabId);
    const line = await prisma.tableTabItem.findFirst({ where: { id: lineId, tabId: tab.id } });
    if (!line) throw new ApiError(404, "Línea no encontrada.", [], "", "table_tab_line_not_found");
    await prisma.tableTabItem.update({
        where: { id: line.id },
        data: {
            ...(unitPrice !== undefined ? { unitPrice: Math.max(0, Number(unitPrice) || 0) } : {}),
            ...(note !== undefined ? { note: note ? String(note).trim().slice(0, 120) : null } : {}),
        },
    });
    emitPosEvent(user.prismaId, tab.pointOfSaleId, "table", "tab-updated");
    return mapTab(await findTab(user, tab.id));
};

// "Comanda": marks everything not yet sent as sent now and returns exactly
// those lines, so the kitchen ticket never repeats an item.
export const sendTabToKitchen = async ({ user, tabId }) => {
    const tab = await findTab(user, tabId);
    const pending = tab.items.filter((i) => !i.sentAt);
    if (!pending.length) return { tab: mapTab(tab), sent: [] };
    const now = new Date();
    await prisma.tableTabItem.updateMany({ where: { id: { in: pending.map((i) => i.id) }, sentAt: null }, data: { sentAt: now } });
    emitPosEvent(user.prismaId, tab.pointOfSaleId, "table", "tab-updated");
    return {
        tab: mapTab(await findTab(user, tab.id)),
        sent: pending.map((i) => ({ product_name: i.productName, quantity: i.quantity, note: i.note })),
        sent_at: now,
    };
};

export const cancelTab = async ({ user, tabId }) => {
    const tab = await findTab(user, tabId);
    await prisma.tableTab.update({
        where: { id: tab.id },
        data: { status: "cancelled", closedAt: new Date(), closedById: user.actorId },
    });
    emitPosEvent(user.prismaId, tab.pointOfSaleId, "table", "tab-closed");
    return { cancelled: true };
};

// Called by POST /orders after the sale commits (order.controller.js). The
// sale is authoritative: if the tab was meanwhile closed elsewhere, the sale
// still stands and this is a no-op.
export const closeTabWithOrder = async ({ user, tabId, orderId }) => {
    const claimed = await prisma.tableTab.updateMany({
        where: { id: tabId, accountId: user.prismaId, status: "open" },
        data: { status: "closed", orderId, closedAt: new Date(), closedById: user.actorId },
    });
    if (claimed.count) {
        const tab = await prisma.tableTab.findUnique({ where: { id: tabId }, select: { pointOfSaleId: true } });
        emitPosEvent(user.prismaId, tab.pointOfSaleId, "table", "tab-closed");
    }
    return claimed.count > 0;
};
