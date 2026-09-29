import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    listTables,
    createTables,
    updateTable,
    listOpenTabs,
    openTab,
    updateTab,
    applyItemDelta,
    updateItem,
    sendTabToKitchen,
    cancelTab,
} from "../services/tableTab.service.js";

const ok = (res, data, message, status = 200) => res.status(status).json(new ApiResponse(status, data, message));

export const getTables = asyncHandler(async (req, res) =>
    ok(res, await listTables({ user: req.user, pointOfSaleId: req.query.pointOfSaleId, includeInactive: req.query.include_inactive === "true" }), "Tables fetched")
);

// Accepts one table or { tables: [...] } (bulk "crear 10 mesas").
export const postTables = asyncHandler(async (req, res) =>
    ok(res, await createTables({ req, tables: req.body?.tables || req.body }), "Tables created", 201)
);

export const patchTable = asyncHandler(async (req, res) => {
    const { name, zone, seats, sort_order, is_active } = req.body || {};
    return ok(res, await updateTable({ user: req.user, tableId: req.params.id, name, zone, seats, sortOrder: sort_order, isActive: is_active }), "Table updated");
});

export const getOpenTabs = asyncHandler(async (req, res) =>
    ok(res, await listOpenTabs({ user: req.user, pointOfSaleId: req.query.pointOfSaleId }), "Open tabs fetched")
);

export const postTab = asyncHandler(async (req, res) => {
    const { id, table_id, guests, note } = req.body || {};
    return ok(res, await openTab({ user: req.user, id, tableId: table_id, guests, note }), "Tab opened", 201);
});

export const patchTab = asyncHandler(async (req, res) => {
    const { table_id, guests, note } = req.body || {};
    return ok(res, await updateTab({ user: req.user, tabId: req.params.id, tableId: table_id, guests, note }), "Tab updated");
});

export const postTabItemDelta = asyncHandler(async (req, res) => {
    const { line_id, product_id, quantity_delta, unit_price, note } = req.body || {};
    return ok(res, await applyItemDelta({ user: req.user, tabId: req.params.id, lineId: line_id, productId: product_id, delta: quantity_delta, unitPrice: unit_price, note }), "Tab item updated");
});

export const patchTabItem = asyncHandler(async (req, res) => {
    const { unit_price, note } = req.body || {};
    return ok(res, await updateItem({ user: req.user, tabId: req.params.id, lineId: req.params.lineId, unitPrice: unit_price, note }), "Tab item updated");
});

export const postSendToKitchen = asyncHandler(async (req, res) => ok(res, await sendTabToKitchen({ user: req.user, tabId: req.params.id }), "Sent to kitchen"));

export const postCancelTab = asyncHandler(async (req, res) => ok(res, await cancelTab({ user: req.user, tabId: req.params.id }), "Tab cancelled"));
