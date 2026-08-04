import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { getElectronicInvoices } from "../controllers/electronicInvoice.controller.js";

const router = Router();
router.use(verifyJWT);
router.get("/", getElectronicInvoices);

export default router;
