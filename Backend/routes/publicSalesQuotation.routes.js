import { Router } from "express";
import { getPublicSalesQuotation, respondToPublicSalesQuotation } from "../controllers/salesQuotation.controller.js";

const router = Router();

router.get("/sales-quotations/:token", getPublicSalesQuotation);
router.post("/sales-quotations/:token/respond", respondToPublicSalesQuotation);

export default router;