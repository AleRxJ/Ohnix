import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { getPurchaseSupportDocuments } from "../controllers/purchaseSupportDocument.controller.js";

const router = Router();
router.use(verifyJWT);
// Same reasoning as electronicInvoice.routes.js: Documento Soporte is
// scoped under "purchases" everywhere else (purchase.routes.js), so this
// cross-purchase list matches that instead of introducing a new module.
router.get("/", requireModulePermission("purchases", "view"), getPurchaseSupportDocuments);

export default router;
