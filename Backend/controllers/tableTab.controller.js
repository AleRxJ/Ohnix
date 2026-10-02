import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    listTables,
    createTables,
    updateTable,
    getQrSettings,
    updateQrSettings,
    listOpenTabs,
    openTab,
    updateTab,
    applyItemDelta,
    updateItem,
    sendTabToKitchen,
    cancelTab,
    listKitchenRounds,
    setKitchenStatus,
    claimKitchenPrint,
    listPendingRequests,
    acceptRequest,
    rejectRequest,
    getMenuSettings,
    updateMenuCategory,
    updateMenuProduct,
} from "../services/tableTab.service.js";

const ok = (res, data, message, status = 200) => res.status(status).json(new ApiResponse(status, data, message));

// resolveOrAssertPointOfSaleId reads req.body.pointOfSaleId - GETs carry it
// in the query string instead.
const withQueryLocation = (req) => {
    if (req.query?.pointOfSaleId && !req.body?.pointOfSaleId) req.body = { ...(req.body || {}), pointOfSaleId: req.query.pointOfSaleId };
    return req;
};

export const getTables = asyncHandler(async (req, res) =>
    ok(res, await listTables({ user: req.user, pointOfSaleId: req.query.pointOfSaleId, includeInactive: req.query.include_inactive === "true" }), "Tables fetched")
);

// Accepts one table or { tables: [...] } (bulk "crear 10 mesas").
export const postTables = asyncHandler(async (req, res) =>
    ok(res, await createTables({ req, tables: req.body?.tables || req.body }), "Tables created", 201)
);

export const patchTable = asyncHandler(async (req, res) => {
    const { name, zone, seats, sort_order, is_active, regenerate_token } = req.body || {};
    return ok(
        res,
        await updateTable({ user: req.user, tableId: req.params.id, name, zone, seats, sortOrder: sort_order, isActive: is_active, regenerateToken: regenerate_token === true }),
        "Table updated"
    );
});

export const getTablesQrSettings = asyncHandler(async (req, res) => ok(res, await getQrSettings({ req: withQueryLocation(req) }), "QR settings fetched"));

export const patchTablesQrSettings = asyncHandler(async (req, res) =>
    ok(res, await updateQrSettings({ req, enabled: req.body?.qr_ordering_enabled === true }), "QR settings updated")
);

export const getOpenTabs = asyncHandler(async (req, res) =>
    ok(res, await listOpenTabs({ user: req.user, pointOfSaleId: req.query.pointOfSaleId }), "Open tabs fetched")
);

export const postTab = asyncHandler(async (req, res) => {
    const { id, table_id, guests, note } = req.body || {};
    return ok(res, await openTab({ user: req.user, id, tableId: table_id, guests, note }), "Tab opened", 201);
});

export const patchTab = asyncHandler(async (req, res) => {
    const { table_id, guests, note, take_over } = req.body || {};
    return ok(res, await updateTab({ user: req.user, tabId: req.params.id, tableId: table_id, guests, note, takeOver: take_over === true }), "Tab updated");
});

export const postTabItemDelta = asyncHandler(async (req, res) => {
    const { line_id, product_id, quantity_delta, unit_price, note } = req.body || {};
    return ok(res, await applyItemDelta({ user: req.user, tabId: req.params.id, lineId: line_id, productId: product_id, delta: quantity_delta, unitPrice: unit_price, note }), "Tab item updated");
});

export const patchTabItem = asyncHandler(async (req, res) => {
    const { unit_price, note } = req.body || {};
    return ok(res, await updateItem({ user: req.user, tabId: req.params.id, lineId: req.params.lineId, unitPrice: unit_price, note }), "Tab item updated");
});

export const postSendToKitchen = asyncHandler(async (req, res) =>
    ok(res, await sendTabToKitchen({ user: req.user, tabId: req.params.id, printed: req.body?.printed === true }), "Sent to kitchen")
);

export const postCancelTab = asyncHandler(async (req, res) => ok(res, await cancelTab({ user: req.user, tabId: req.params.id }), "Tab cancelled"));

export const getKitchen = asyncHandler(async (req, res) =>
    ok(res, await listKitchenRounds({ user: req.user, pointOfSaleId: req.query.pointOfSaleId }), "Kitchen rounds fetched")
);

export const postKitchenStatus = asyncHandler(async (req, res) => {
    const { status, line_ids, sent_at } = req.body || {};
    return ok(res, await setKitchenStatus({ user: req.user, tabId: req.params.id, status, lineIds: line_ids, sentAt: sent_at }), "Kitchen status updated");
});

export const postClaimKitchenPrint = asyncHandler(async (req, res) => ok(res, await claimKitchenPrint({ req }), "Kitchen print claimed"));

export const getPendingRequests = asyncHandler(async (req, res) =>
    ok(res, await listPendingRequests({ user: req.user, pointOfSaleId: req.query.pointOfSaleId }), "Table requests fetched")
);

export const postAcceptRequest = asyncHandler(async (req, res) =>
    ok(res, await acceptRequest({ user: req.user, requestId: req.params.id, tabId: req.body?.tab_id, sendToKitchen: req.body?.send_to_kitchen === true, printed: req.body?.printed === true }), "Table request accepted")
);

export const postRejectRequest = asyncHandler(async (req, res) => ok(res, await rejectRequest({ user: req.user, requestId: req.params.id }), "Table request dismissed"));

export const getMenuSettingsHandler = asyncHandler(async (req, res) => ok(res, await getMenuSettings({ user: req.user }), "Menu settings fetched"));

export const patchMenuCategory = asyncHandler(async (req, res) =>
    ok(res, await updateMenuCategory({ user: req.user, categoryId: req.params.id, menuVisible: req.body?.menu_visible, menuSortOrder: req.body?.menu_sort_order }), "Menu category updated")
);

export const patchMenuProduct = asyncHandler(async (req, res) =>
    ok(res, await updateMenuProduct({ user: req.user, productId: req.params.id, menuDescription: req.body?.menu_description }), "Menu product updated")
);
