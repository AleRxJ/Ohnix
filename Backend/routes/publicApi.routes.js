import { Router } from "express";
import { verifyApiKey, enforceApiRateLimit } from "../middleware/apiKeyAuth.middleware.js";
import { enforceEntityLimit, enforceMonthlyLimit } from "../middleware/pricing.middleware.js";
import { createProduct, getAllProducts } from "../controllers/product.controller.js";
import { createCustomer, getUserCustomers } from "../controllers/customer.controller.js";
import { createOrder, getAllOrders, getOrderDetails } from "../controllers/order.controller.js";

const router = Router();

router.use(verifyApiKey, enforceApiRateLimit);

router.route("/products").get(getAllProducts).post(enforceEntityLimit("products"), createProduct);
router.route("/customers").get(getUserCustomers).post(enforceEntityLimit("customers"), createCustomer);
router
    .route("/orders")
    .get(getAllOrders)
    .post(enforceEntityLimit("orders"), enforceMonthlyLimit("orders"), createOrder);
router.route("/orders/:id/details").get(getOrderDetails);

export default router;
