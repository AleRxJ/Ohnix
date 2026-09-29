import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    getTables,
    postTables,
    patchTable,
    getOpenTabs,
    postTab,
    patchTab,
    postTabItemDelta,
    patchTabItem,
    postSendToKitchen,
    postCancelTab,
} from "../controllers/tableTab.controller.js";

// Restaurant mode of the Caja - see tableTab.service.js. Configuring tables
// is an "orders: admin" decision; working the tabs is ordinary selling.
const router = Router();
router.use(verifyJWT);

router.route("/tables")
    .get(requireModulePermission("orders", "view"), getTables)
    .post(requireModulePermission("orders", "admin"), postTables);
router.patch("/tables/:id", requireModulePermission("orders", "admin"), patchTable);

router.get("/table-tabs/open", requireModulePermission("orders", "view"), getOpenTabs);
router.post("/table-tabs", requireModulePermission("orders", "edit"), postTab);
router.patch("/table-tabs/:id", requireModulePermission("orders", "edit"), patchTab);
// Deltas MUST be idempotent: a replayed "+1" would otherwise add twice.
router.post("/table-tabs/:id/items", requireModulePermission("orders", "edit"), idempotent("table-tab.item-delta"), postTabItemDelta);
router.patch("/table-tabs/:id/items/:lineId", requireModulePermission("orders", "edit"), patchTabItem);
router.post("/table-tabs/:id/send", requireModulePermission("orders", "edit"), idempotent("table-tab.send"), postSendToKitchen);
router.post("/table-tabs/:id/cancel", requireModulePermission("orders", "edit"), postCancelTab);

export default router;
