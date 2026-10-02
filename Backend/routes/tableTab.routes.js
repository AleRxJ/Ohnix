import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    getTables,
    postTables,
    patchTable,
    getTablesQrSettings,
    patchTablesQrSettings,
    getOpenTabs,
    postTab,
    patchTab,
    postTabItemDelta,
    patchTabItem,
    postSendToKitchen,
    postCancelTab,
    getKitchen,
    postKitchenStatus,
    postClaimKitchenPrint,
    getPendingRequests,
    postAcceptRequest,
    postRejectRequest,
    getMenuSettingsHandler,
    patchMenuCategory,
    patchMenuProduct,
} from "../controllers/tableTab.controller.js";

// Restaurant mode of the Caja - see tableTab.service.js. Configuring tables
// (and the QR ordering switch) is an "orders: admin" decision; working the
// tabs, the kitchen screen and customer requests is ordinary selling.
// Charging is gated separately, on POST /orders (posCharge capability).
const router = Router();
router.use(verifyJWT);

router.route("/tables")
    .get(requireModulePermission("orders", "view"), getTables)
    .post(requireModulePermission("orders", "admin"), postTables);
router.route("/tables/qr-settings")
    .get(requireModulePermission("orders", "view"), getTablesQrSettings)
    .patch(requireModulePermission("orders", "admin"), patchTablesQrSettings);
router.patch("/tables/:id", requireModulePermission("orders", "admin"), patchTable);

router.get("/table-tabs/open", requireModulePermission("orders", "view"), getOpenTabs);
router.post("/table-tabs", requireModulePermission("orders", "edit"), postTab);
router.patch("/table-tabs/:id", requireModulePermission("orders", "edit"), patchTab);
// Deltas MUST be idempotent: a replayed "+1" would otherwise add twice.
router.post("/table-tabs/:id/items", requireModulePermission("orders", "edit"), idempotent("table-tab.item-delta"), postTabItemDelta);
router.patch("/table-tabs/:id/items/:lineId", requireModulePermission("orders", "edit"), patchTabItem);
router.post("/table-tabs/:id/send", requireModulePermission("orders", "edit"), idempotent("table-tab.send"), postSendToKitchen);
router.post("/table-tabs/:id/cancel", requireModulePermission("orders", "edit"), postCancelTab);
router.post("/table-tabs/:id/kitchen-status", requireModulePermission("orders", "edit"), postKitchenStatus);

router.get("/kitchen", requireModulePermission("orders", "view"), getKitchen);
router.post("/kitchen/claim-print", requireModulePermission("orders", "view"), postClaimKitchenPrint);

router.get("/requests/pending", requireModulePermission("orders", "view"), getPendingRequests);
router.post("/requests/:id/accept", requireModulePermission("orders", "edit"), idempotent("table-request.accept"), postAcceptRequest);
router.post("/requests/:id/reject", requireModulePermission("orders", "edit"), postRejectRequest);

// What the customer QR menu shows - configuring it is an admin decision.
router.get("/menu-settings", requireModulePermission("orders", "admin"), getMenuSettingsHandler);
router.patch("/menu-settings/categories/:id", requireModulePermission("orders", "admin"), patchMenuCategory);
router.patch("/menu-settings/products/:id", requireModulePermission("orders", "admin"), patchMenuProduct);

export default router;
