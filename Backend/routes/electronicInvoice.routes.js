import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { getElectronicInvoices } from "../controllers/electronicInvoice.controller.js";

const router = Router();
router.use(verifyJWT);
// This was ungated - a team member with no permissions at all could still
// list every DIAN electronic invoice (financial/tax documents) for the
// whole team account. Electronic invoicing is scoped under "orders"
// everywhere else (order.routes.js), so this matches that.
router.get("/", requireModulePermission("orders", "view"), getElectronicInvoices);

export default router;
