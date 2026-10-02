import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { assertPosAccess, resolveOrAssertPointOfSaleId } from "../middleware/pos.permissions.js";
import { emitPosEvent } from "../live/dataEvents.js";
import { ensureDefaultPointOfSale } from "./pointOfSale.service.js";

// Restaurant mode of the Caja (see DiningTable/TableTab in schema.prisma).
// Everything is scoped to the company (accountId) and, for restricted team
// members, to their own points of sale. Tab and item ids come from the
// client so the whole flow - open, add, send to kitchen, charge - also works
// while offline, replayed later through the outbox.
//
// Flow: a waiter opens a tab on a table and adds items -> "Enviar a cocina"
// stamps the unsent lines with one sentAt (a "round"/comanda) -> the kitchen
// display moves each round pending -> preparing -> ready -> the waiter
// serves it -> the cashier (posCharge) charges, which closes the tab. A
// customer can also send an order from the table's QR (TableRequest, see
// publicMenu.service.js) that a waiter accepts into the tab.

const MAX_TABLES_PER_LOCATION = 300;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const KITCHEN_STATUSES = ["pending", "preparing", "ready", "served"];

const assertClientId = (id, label) => {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        throw new ApiError(400, `${label} must be a client-generated id (8-64 chars, letters/digits/-/_).`, [], "", "table_tab_invalid_id");
    }
};

// Location scope + only ACTIVE locations: a deactivated point of sale keeps
// its tables/history (FK RESTRICT) but they drop out of every screen until
// it's reactivated (pointOfSale.service.js#reactivatePointOfSale).
const scopeFilter = (user) => ({
    pointOfSale: { isActive: true },
    ...(user.role !== "admin" && !user.posScopeAll ? { pointOfSaleId: { in: user.posScopeIds || [] } } : {}),
});

// An account that never needed a location yet has zero PointOfSale rows
// (the default is created lazily) - make sure "Principal" exists before the
// restaurant screens list anything, so tables created next land somewhere
// and the live socket room exists.
const ensureLocation = async (user) => {
    const count = await prisma.pointOfSale.count({ where: { accountId: user.prismaId } });
    if (!count) await ensureDefaultPointOfSale(user.prismaId);
};

// User ids -> display names for waiter attribution. Tabs only store ids
// (team members are Users); one query per response.
const loadNames = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, username: true, employeeProfile: { select: { firstName: true, lastName: true } } },
    });
    // A waiter linked to their payroll record shows as "Juan Pérez", not "juanp".
    return new Map(users.map((u) => [u.id, u.employeeProfile ? `${u.employeeProfile.firstName} ${u.employeeProfile.lastName}`.trim() : u.username]));
};

const person = (names, id) => (id ? { id, name: names.get(id) || null } : null);

export const mapTable = (table) => ({
    _id: table.id,
    point_of_sale_id: table.pointOfSaleId,
    name: table.name,
    zone: table.zone,
    seats: table.seats,
    sort_order: table.sortOrder,
    is_active: table.isActive,
    public_token: table.publicToken || null,
    updatedAt: table.updatedAt,
});

export const mapTab = (tab, names = new Map()) => {
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
            kitchen_status: item.sentAt ? item.kitchenStatus : null,
            ready_at: item.readyAt || null,
            served_at: item.servedAt || null,
            created_by: person(names, item.createdById),
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
        opened_by: person(names, tab.openedById),
        waiter: person(names, tab.waiterId || tab.openedById),
        updatedAt: tab.updatedAt,
        items,
        subtotal: items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        unsent_count: items.filter((i) => !i.sent_at).reduce((sum, i) => sum + i.quantity, 0),
        ready_count: items.filter((i) => i.kitchen_status === "ready").reduce((sum, i) => sum + i.quantity, 0),
    };
};

const tabPeopleIds = (tab) => [tab.openedById, tab.waiterId, ...(tab.items || []).map((i) => i.createdById)];

const mapTabWithNames = async (tab) => mapTab(tab, await loadNames(tabPeopleIds(tab)));

const mapTabsWithNames = async (tabs) => {
    const names = await loadNames(tabs.flatMap(tabPeopleIds));
    return tabs.map((tab) => mapTab(tab, names));
};

const TAB_INCLUDE = { items: true, table: { select: { name: true } } };

const emitTable = (user, pointOfSaleId, action) => emitPosEvent(user.prismaId, pointOfSaleId, "table", action);
const emitKitchen = (user, pointOfSaleId, action) => emitPosEvent(user.prismaId, pointOfSaleId, "kitchen", action);

// --- Tables (configuration) -------------------------------------------------

export const listTables = async ({ user, pointOfSaleId, includeInactive = false }) => {
    await ensureLocation(user);
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

const newPublicToken = () => crypto.randomBytes(24).toString("base64url");

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
                .map((r, index) => ({ ...r, accountId: req.user.prismaId, pointOfSaleId, sortOrder: existing + index, publicToken: newPublicToken() })),
        }),
    ]);
    emitTable(req.user, pointOfSaleId, "created");
    return listTables({ user: req.user, pointOfSaleId });
};

const findTable = async (user, tableId) => {
    const table = await prisma.diningTable.findFirst({ where: { id: tableId, accountId: user.prismaId } });
    if (!table) throw new ApiError(404, "Mesa no encontrada.", [], "", "table_not_found");
    if (user.role !== "admin") assertPosAccess(user, table.pointOfSaleId);
    return table;
};

export const updateTable = async ({ user, tableId, name, zone, seats, sortOrder, isActive, regenerateToken }) => {
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
                // Tables created before QR ordering have no token yet; any
                // update (or an explicit "regenerar") gives them one.
                ...(regenerateToken || !table.publicToken ? { publicToken: newPublicToken() } : {}),
            },
        });
        emitTable(user, table.pointOfSaleId, "updated");
        return mapTable(updated);
    } catch (error) {
        if (error?.code === "P2002") throw new ApiError(409, "Ya existe una mesa con ese nombre.", [], "", "table_name_taken");
        throw error;
    }
};

// QR ordering switch + the tokens of tables that predate it, per location.
export const getQrSettings = async ({ req }) => {
    const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
    const pos = await prisma.pointOfSale.findUnique({ where: { id: pointOfSaleId }, select: { qrOrderingEnabled: true } });
    return { point_of_sale_id: pointOfSaleId, qr_ordering_enabled: Boolean(pos?.qrOrderingEnabled) };
};

export const updateQrSettings = async ({ req, enabled }) => {
    const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
    await prisma.pointOfSale.update({ where: { id: pointOfSaleId }, data: { qrOrderingEnabled: Boolean(enabled) } });
    if (enabled) {
        const missing = await prisma.diningTable.findMany({ where: { pointOfSaleId, publicToken: null }, select: { id: true } });
        for (const t of missing) {
            await prisma.diningTable.update({ where: { id: t.id }, data: { publicToken: newPublicToken() } });
        }
    }
    emitTable(req.user, pointOfSaleId, "updated");
    return { point_of_sale_id: pointOfSaleId, qr_ordering_enabled: Boolean(enabled) };
};

// --- Tabs ---------------------------------------------------------------------

export const listOpenTabs = async ({ user, pointOfSaleId }) => {
    await ensureLocation(user);
    const tabs = await prisma.tableTab.findMany({
        where: { accountId: user.prismaId, status: "open", ...scopeFilter(user), ...(pointOfSaleId ? { pointOfSaleId } : {}) },
        include: TAB_INCLUDE,
        orderBy: { openedAt: "asc" },
    });
    return mapTabsWithNames(tabs);
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
    if (existing) return mapTabWithNames(existing);

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
                waiterId: user.actorId,
            },
            include: TAB_INCLUDE,
        });
        emitTable(user, table.pointOfSaleId, "tab-opened");
        return mapTabWithNames(tab);
    } catch (error) {
        if (error?.code === "P2002") {
            throw new ApiError(409, `La mesa ${table.name} ya tiene una cuenta abierta.`, [], "", "table_already_open");
        }
        throw error;
    }
};

// takeOver: "Atender esta mesa" - the caller becomes the tab's waiter (shift
// change, covering for a colleague). Only ever self-assignment, so nobody
// can pin a table - and its sale - on someone else.
export const updateTab = async ({ user, tabId, tableId, guests, note, takeOver }) => {
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
                ...(takeOver ? { waiterId: user.actorId } : {}),
            },
            include: TAB_INCLUDE,
        });
        emitTable(user, tab.pointOfSaleId, "tab-updated");
        if (targetTableId) emitKitchen(user, tab.pointOfSaleId, "moved");
        return mapTabWithNames(updated);
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
            return { removed: true, sent: Boolean(line.sentAt) };
        }
        const updated = await tx.tableTabItem.update({ where: { id: line.id }, data: { quantity } });
        return { ...updated, sent: Boolean(line.sentAt) };
    });
    await prisma.tableTab.update({ where: { id: tab.id }, data: { updatedAt: new Date() } });
    emitTable(user, tab.pointOfSaleId, "tab-updated");
    // A sent line changing quantity changes what the kitchen must cook.
    if (result?.sent) emitKitchen(user, tab.pointOfSaleId, "changed");
    return { line: result && !result.removed ? { _id: result.id, quantity: result.quantity } : null };
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
    emitTable(user, tab.pointOfSaleId, "tab-updated");
    if (line.sentAt && note !== undefined) emitKitchen(user, tab.pointOfSaleId, "changed");
    return mapTabWithNames(await findTab(user, tab.id));
};

// "Comanda": marks everything not yet sent as sent now and returns exactly
// those lines, so the kitchen ticket never repeats an item. printed = the
// sending device already printed the ticket itself, so the print station
// (claimKitchenPrint) must not print it again.
export const sendTabToKitchen = async ({ user, tabId, printed = false }) => {
    const tab = await findTab(user, tabId);
    const pending = tab.items.filter((i) => !i.sentAt);
    if (!pending.length) return { tab: await mapTabWithNames(tab), sent: [] };
    const now = new Date();
    await prisma.tableTabItem.updateMany({
        where: { id: { in: pending.map((i) => i.id) }, sentAt: null },
        data: { sentAt: now, kitchenStatus: "pending", ...(printed ? { printedAt: now } : {}) },
    });
    emitTable(user, tab.pointOfSaleId, "tab-updated");
    emitKitchen(user, tab.pointOfSaleId, "sent");
    return {
        tab: await mapTabWithNames(await findTab(user, tab.id)),
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
    emitTable(user, tab.pointOfSaleId, "tab-closed");
    emitKitchen(user, tab.pointOfSaleId, "closed");
    return { cancelled: true };
};

// Called by POST /orders after the sale commits (order.controller.js). The
// sale is authoritative: if the tab was meanwhile closed elsewhere, the sale
// still stands and this is a no-op. The order must belong to the tab's own
// location - closing a tab from another point of sale's sale would leave
// the tab's table "free" while its sale sits in another location's books.
export const closeTabWithOrder = async ({ user, tabId, orderId }) => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { pointOfSaleId: true } });
    if (!order) return false;
    const tab = await prisma.tableTab.findFirst({
        where: { id: tabId, accountId: user.prismaId, status: "open", pointOfSaleId: order.pointOfSaleId },
        select: { id: true, waiterId: true, openedById: true, pointOfSaleId: true },
    });
    if (!tab) return false;
    const claimed = await prisma.tableTab.updateMany({
        where: { id: tab.id, status: "open" },
        data: { status: "closed", orderId, closedAt: new Date(), closedById: user.actorId },
    });
    if (!claimed.count) return false;
    await prisma.order.update({ where: { id: orderId }, data: { waiterId: tab.waiterId || tab.openedById } });
    emitTable(user, tab.pointOfSaleId, "tab-closed");
    emitKitchen(user, tab.pointOfSaleId, "closed");
    return true;
};

// --- Kitchen display ---------------------------------------------------------

const roundKey = (tabId, sentAt) => `${tabId}|${new Date(sentAt).toISOString()}`;

const statusOfRound = (items) => {
    const live = items.filter((i) => i.kitchenStatus !== "served");
    if (!live.length) return "served";
    // The round is as far along as its slowest line.
    return KITCHEN_STATUSES[Math.min(...live.map((i) => KITCHEN_STATUSES.indexOf(i.kitchenStatus)))];
};

// Every round (one "Enviar a cocina") of the location's open tabs that the
// kitchen hasn't finished serving. Round number = position of its sentAt
// among the tab's sends, so the 2nd one reads "ADICIONAL" like the ticket.
export const listKitchenRounds = async ({ user, pointOfSaleId }) => {
    await ensureLocation(user);
    const tabs = await prisma.tableTab.findMany({
        where: {
            accountId: user.prismaId,
            status: "open",
            ...scopeFilter(user),
            ...(pointOfSaleId ? { pointOfSaleId } : {}),
            items: { some: { sentAt: { not: null }, kitchenStatus: { not: "served" } } },
        },
        include: { items: { where: { sentAt: { not: null } } }, table: { select: { name: true, zone: true } } },
    });
    const names = await loadNames(tabs.flatMap((t) => [t.waiterId, t.openedById]));
    const rounds = [];
    for (const tab of tabs) {
        const groups = new Map();
        for (const item of tab.items) {
            const key = roundKey(tab.id, item.sentAt);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }
        const order = [...groups.keys()].sort();
        for (const [key, items] of groups) {
            const status = statusOfRound(items);
            if (status === "served") continue;
            items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            rounds.push({
                _id: key,
                key,
                tab_id: tab.id,
                point_of_sale_id: tab.pointOfSaleId,
                table_name: tab.table?.name || null,
                zone: tab.table?.zone || null,
                guests: tab.guests,
                waiter: person(names, tab.waiterId || tab.openedById),
                sent_at: items[0].sentAt,
                round: order.indexOf(key) + 1,
                status,
                printed: items.every((i) => i.printedAt),
                ready_at: status === "ready" ? items.reduce((max, i) => (i.readyAt && i.readyAt > max ? i.readyAt : max), items[0].readyAt) : null,
                items: items.map((i) => ({ _id: i.id, product_name: i.productName, quantity: i.quantity, note: i.note, kitchen_status: i.kitchenStatus })),
            });
        }
    }
    rounds.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
    return rounds;
};

// Moves lines of a tab to a kitchen status - one line (line_ids) or a whole
// round (sent_at). Absolute, so replaying it (outbox) is harmless.
export const setKitchenStatus = async ({ user, tabId, status, lineIds, sentAt }) => {
    if (!KITCHEN_STATUSES.includes(status)) throw new ApiError(400, "Estado de cocina no válido.", [], "", "kitchen_invalid_status");
    // Not requireOpen: the kitchen may finish a round of a tab that was just
    // charged; that's not an error worth surfacing on the kitchen screen.
    const tab = await findTab(user, tabId, { requireOpen: false });
    const where = { tabId: tab.id, sentAt: { not: null } };
    if (Array.isArray(lineIds) && lineIds.length) where.id = { in: lineIds.map(String).slice(0, 200) };
    else if (sentAt) {
        const at = new Date(sentAt);
        if (Number.isNaN(at.getTime())) throw new ApiError(400, "sent_at no válido.", [], "", "kitchen_invalid_round");
        where.sentAt = at;
    } else throw new ApiError(400, "Indica line_ids o sent_at.", [], "", "kitchen_target_required");

    const now = new Date();
    const { count } = await prisma.tableTabItem.updateMany({
        where,
        data: {
            kitchenStatus: status,
            readyAt: status === "ready" || status === "served" ? now : null,
            ...(status === "served" ? { servedAt: now } : { servedAt: null }),
        },
    });
    emitKitchen(user, tab.pointOfSaleId, status);
    emitTable(user, tab.pointOfSaleId, "tab-updated");
    return { updated: count, status };
};

// Auto-print station: atomically claims every sent-but-unprinted line of the
// location (UPDATE ... WHERE printed_at IS NULL RETURNING), so with two
// stations on, each round still prints exactly once - whoever's UPDATE
// touched the row owns it. Returns the claimed lines grouped as rounds, ready
// for printKitchenTicket.
export const claimKitchenPrint = async ({ req }) => {
    const pointOfSaleId = await resolveOrAssertPointOfSaleId(req);
    const user = req.user;
    const candidates = await prisma.tableTabItem.findMany({
        where: { printedAt: null, sentAt: { not: null }, tab: { accountId: user.prismaId, pointOfSaleId, status: "open" } },
        select: { id: true },
        take: 500,
    });
    if (!candidates.length) return [];
    const claimed = await prisma.$queryRaw`
        UPDATE "table_tab_items" SET "printed_at" = NOW()
        WHERE "id" IN (${Prisma.join(candidates.map((c) => c.id))}) AND "printed_at" IS NULL
        RETURNING "id"`;
    if (!claimed.length) return [];
    const ids = new Set(claimed.map((r) => r.id));
    const rounds = await listKitchenRounds({ user, pointOfSaleId });
    // Lines can't be filtered out of listKitchenRounds' result directly (it
    // also skips served rounds) - re-shape from the claimed ids instead.
    return rounds
        .map((r) => ({ ...r, items: r.items.filter((i) => ids.has(i._id)) }))
        .filter((r) => r.items.length);
};

// --- Customer requests from the table QR (staff side) ----------------------

export const mapRequest = (request) => ({
    _id: request.id,
    table_id: request.tableId,
    table_name: request.table?.name || null,
    tab_id: request.tabId,
    point_of_sale_id: request.pointOfSaleId,
    type: request.type,
    status: request.status,
    items: Array.isArray(request.items) ? request.items : [],
    note: request.note,
    customer_name: request.customerName,
    created_at: request.createdAt,
});

export const listPendingRequests = async ({ user, pointOfSaleId }) => {
    const requests = await prisma.tableRequest.findMany({
        where: { accountId: user.prismaId, status: "pending", ...scopeFilter(user), ...(pointOfSaleId ? { pointOfSaleId } : {}) },
        include: { table: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
    });
    return requests.map(mapRequest);
};

const findRequest = async (user, requestId) => {
    const request = await prisma.tableRequest.findFirst({ where: { id: requestId, accountId: user.prismaId }, include: { table: { select: { name: true } } } });
    if (!request) throw new ApiError(404, "Solicitud no encontrada.", [], "", "table_request_not_found");
    if (user.role !== "admin") assertPosAccess(user, request.pointOfSaleId);
    return request;
};

// Accepting a QR order puts its lines on the table's open tab (opening one -
// with the client-provided tab_id, so an offline accept replays onto the
// same tab - when the table is free). Line ids are derived from the request
// id, so a replayed accept can't add the lines twice. Idempotent: an
// already-accepted request just returns its tab.
export const acceptRequest = async ({ user, requestId, tabId, sendToKitchen = false, printed = false }) => {
    const request = await findRequest(user, requestId);
    if (request.status !== "pending") {
        return { request: mapRequest(request), tab: request.tabId ? await mapTabWithNames(await findTab(user, request.tabId, { requireOpen: false })) : null };
    }
    if (request.type !== "order") {
        const done = await prisma.tableRequest.update({
            where: { id: request.id },
            data: { status: "done", handledById: user.actorId, handledAt: new Date() },
            include: { table: { select: { name: true } } },
        });
        emitTable(user, request.pointOfSaleId, "request-handled");
        return { request: mapRequest(done), tab: null };
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
        const claim = await tx.tableRequest.updateMany({ where: { id: request.id, status: "pending" }, data: { status: "accepted", handledById: user.actorId, handledAt: now } });
        if (!claim.count) return null;

        let tab = await tx.tableTab.findFirst({ where: { tableId: request.tableId, status: "open" } });
        if (!tab) {
            const id = typeof tabId === "string" && ID_PATTERN.test(tabId) ? tabId : crypto.randomUUID();
            tab = await tx.tableTab.create({
                data: {
                    id,
                    accountId: user.prismaId,
                    pointOfSaleId: request.pointOfSaleId,
                    tableId: request.tableId,
                    openedById: user.actorId,
                    waiterId: user.actorId,
                    note: request.customerName ? `Cliente: ${request.customerName}`.slice(0, 200) : null,
                },
            });
        }
        const items = Array.isArray(request.items) ? request.items : [];
        const products = await tx.product.findMany({
            where: { id: { in: items.map((i) => i.product_id) }, createdById: user.prismaId },
            select: { id: true },
        });
        const valid = new Set(products.map((p) => p.id));
        const lines = items
            .filter((i) => valid.has(i.product_id))
            .map((i, index) => ({
                id: `${request.id}-${index}`,
                tabId: tab.id,
                productId: i.product_id,
                productName: String(i.product_name || "").slice(0, 200),
                quantity: Math.min(Math.max(Number.parseInt(i.quantity, 10) || 1, 1), 99),
                unitPrice: Math.max(0, Number(i.unit_price) || 0),
                note: i.note ? String(i.note).slice(0, 120) : null,
                createdById: user.actorId,
                ...(sendToKitchen ? { sentAt: now, kitchenStatus: "pending", ...(printed ? { printedAt: now } : {}) } : {}),
            }));
        if (lines.length) await tx.tableTabItem.createMany({ data: lines, skipDuplicates: true });
        await tx.tableRequest.update({ where: { id: request.id }, data: { tabId: tab.id } });
        await tx.tableTab.update({ where: { id: tab.id }, data: { updatedAt: now } });
        return tab.id;
    });

    emitTable(user, request.pointOfSaleId, "request-handled");
    if (sendToKitchen) emitKitchen(user, request.pointOfSaleId, "sent");
    const fresh = await findRequest(user, request.id);
    const resolvedTabId = result || fresh.tabId;
    return {
        request: mapRequest(fresh),
        tab: resolvedTabId ? await mapTabWithNames(await findTab(user, resolvedTabId, { requireOpen: false })) : null,
    };
};

export const rejectRequest = async ({ user, requestId }) => {
    const request = await findRequest(user, requestId);
    if (request.status !== "pending") return mapRequest(request);
    const updated = await prisma.tableRequest.update({
        where: { id: request.id },
        data: { status: request.type === "order" ? "rejected" : "done", handledById: user.actorId, handledAt: new Date() },
        include: { table: { select: { name: true } } },
    });
    emitTable(user, request.pointOfSaleId, "request-handled");
    return mapRequest(updated);
};

// --- QR menu configuration (staff) ------------------------------------------

// Which categories the customer menu shows, in which order, plus each
// product's short menu description. Products/categories are account-wide
// (createdById = account), so this is too.
export const getMenuSettings = async ({ user }) => {
    const [categories, products] = await Promise.all([
        prisma.category.findMany({
            where: { createdById: user.prismaId, isTutorialData: false },
            select: { id: true, categoryName: true, menuVisible: true, menuSortOrder: true, _count: { select: { products: { where: { status: "active" } } } } },
            orderBy: [{ menuSortOrder: "asc" }, { categoryName: "asc" }],
        }),
        prisma.product.findMany({
            where: { createdById: user.prismaId, status: "active", isTutorialData: false },
            select: { id: true, productName: true, categoryId: true, menuDescription: true, sellingPrice: true },
            orderBy: { productName: "asc" },
            take: 2000,
        }),
    ]);
    return {
        categories: categories.map((c) => ({ _id: c.id, name: c.categoryName, menu_visible: c.menuVisible, menu_sort_order: c.menuSortOrder, product_count: c._count.products })),
        products: products.map((p) => ({ _id: p.id, name: p.productName, category_id: p.categoryId, menu_description: p.menuDescription, price: Number(p.sellingPrice) })),
    };
};

export const updateMenuCategory = async ({ user, categoryId, menuVisible, menuSortOrder }) => {
    const category = await prisma.category.findFirst({ where: { id: categoryId, createdById: user.prismaId } });
    if (!category) throw new ApiError(404, "Categoría no encontrada.", [], "", "menu_category_not_found");
    await prisma.category.update({
        where: { id: category.id },
        data: {
            ...(menuVisible !== undefined ? { menuVisible: Boolean(menuVisible) } : {}),
            ...(menuSortOrder !== undefined ? { menuSortOrder: Math.min(Math.max(Number.parseInt(menuSortOrder, 10) || 0, 0), 9999) } : {}),
        },
    });
    return { updated: true };
};

export const updateMenuProduct = async ({ user, productId, menuDescription }) => {
    const product = await prisma.product.findFirst({ where: { id: productId, createdById: user.prismaId }, select: { id: true } });
    if (!product) throw new ApiError(404, "Producto no encontrado.", [], "", "menu_product_not_found");
    const text = String(menuDescription ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    await prisma.product.update({ where: { id: product.id }, data: { menuDescription: text || null } });
    return { updated: true };
};
