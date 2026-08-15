import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import errorHandler from "./middleware/error.middleware.js";
import { handlePaymentWebhook, handleEpaycoConfirmation, handleEpaycoResponse } from "./controllers/subscription.controller.js";
import { isOriginAllowed } from "./utils/allowedOrigins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Render puts a single reverse proxy in front of the app, which sets
// X-Forwarded-For. Without this, Express ignores that header and req.ip
// resolves to the proxy's own address for every request - meaning every
// visitor looks like the same IP to express-rate-limit, so IP-based limits
// (login, OTP requests, etc.) end up shared across all users instead of
// per-visitor, and express-rate-limit logs a ValidationError on every hit.
app.set("trust proxy", 1);

app.get("/", (req, res) => {
   res.json({
      message: "Hello World !!",
      status: "Backend is running",
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || "development",
   });
});

app.get("/api/v1/test", (req, res) => {
   res.json({
      message: "API routes are working!",
      endpoint: "/api/v1/test",
      timestamp: new Date().toISOString(),
   });
});

app.use(
    cors({
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            } else {
                console.log("Blocked by CORS:", origin);
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.post(
   "/api/v1/subscriptions/payments/webhook",
   express.raw({ type: "application/json" }),
   handlePaymentWebhook
);

// ePayco public endpoints — must be registered before the global body parsers
// so we can apply the correct parsers per route.
// Confirmation: server-to-server POST from ePayco (form-urlencoded or JSON)
app.post(
    "/api/v1/subscriptions/payments/epayco/confirmation",
    express.json({ limit: "16kb" }),
    express.urlencoded({ extended: true, limit: "16kb" }),
    handleEpaycoConfirmation
);
// Response: browser redirect from ePayco after the user completes payment (GET or POST)
app.get("/api/v1/subscriptions/payments/epayco/response", handleEpaycoResponse);
app.post(
    "/api/v1/subscriptions/payments/epayco/response",
    express.json({ limit: "16kb" }),
    express.urlencoded({ extended: true, limit: "16kb" }),
    handleEpaycoResponse
);

// NOTE: There is no Factus webhook endpoint here (there used to be one).
// The official Factus V2 Postman collection (source of truth for this
// integration) has zero webhook/event-push endpoints, and every document
// creation call ("Crear y validar") responds synchronously with the final
// validation result in the same HTTP response - there is nothing async to
// receive a callback for. If Factus support ever confirms a real webhook
// feature, reintroduce this route plus FACTUS_WEBHOOK_SECRET and the
// corresponding service/controller functions (removed on 2026-08-04).

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

//routes import
import userRouter from "./routes/user.routes.js";
import categoryRouter from "./routes/category.routes.js";
import customerRouter from "./routes/customer.routes.js";
import supplierRouter from "./routes/supplier.routes.js";
import unitRouter from "./routes/unit.routes.js";
import productRouter from "./routes/product.routes.js";
import purchaseRouter from "./routes/purchase.routes.js";
import orderRouter from "./routes/order.routes.js";
import reportRouter from "./routes/report.routes.js";
import schedulerRouter from "./routes/scheduler.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import companyRouter from "./routes/company.routes.js";
import companySelfRouter from "./routes/companySelf.routes.js";
import electronicInvoiceRouter from "./routes/electronicInvoice.routes.js";
import apiKeyRouter from "./routes/apiKey.routes.js";
import publicApiRouter from "./routes/publicApi.routes.js";
import teamRouter from "./routes/team.routes.js";
import tutorialDataRouter from "./routes/tutorialData.routes.js";
import systemSettingsRouter from "./routes/systemSettings.routes.js";

//routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/suppliers", supplierRouter);
app.use("/api/v1/units", unitRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/purchases", purchaseRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/scheduler", schedulerRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);
app.use("/api/v1/companies", companyRouter);
app.use("/api/v1/company", companySelfRouter);
app.use("/api/v1/electronic-invoices", electronicInvoiceRouter);
app.use("/api/v1/api-keys", apiKeyRouter);
app.use("/api/v1/public", publicApiRouter);
app.use("/api/v1", teamRouter);
app.use("/api/v1/tutorial-data", tutorialDataRouter);
app.use("/api/v1/system-settings", systemSettingsRouter);

/**
   ___________________________ :: API Documentation :: ___________________________

 * users
    API : http://localhost:3001/api/v1/users/register - POST
    API : http://localhost:3001/api/v1/users/login - POST
    API : http://localhost:3001/api/v1/users/logout - POST
    API : http://localhost:3001/api/v1/users/refresh-token - POST
    API : http://localhost:3001/api/v1/users/change-password - POST
    API : http://localhost:3001/api/v1/users/update-account - PATCH
    API : http://localhost:3001/api/v1/users/avatar - PATCH
    API : http://localhost:3001/api/v1/users/current-user - GET
    API : http://localhost:3001/api/v1/users/send-verify-otp - POST
    API : http://localhost:3001/api/v1/users/verify-email - POST
    API : http://localhost:3001/api/v1/users/is-auth - POST
    API : http://localhost:3001/api/v1/users/send-reset-otp - POST
    API : http://localhost:3001/api/v1/users/reset-password - POST
    API : http://localhost:3001/api/v1/users/send-change-password-otp - POST
    API : http://localhost:3001/api/v1/users/verify-change-password-otp - POST
 
 * categories
    API : http://localhost:3001/api/v1/categories - POST
    API : http://localhost:3001/api/v1/categories/user - GET
    API : http://localhost:3001/api/v1/categories/user/:id - PATCH, DELETE
    API : http://localhost:3001/api/v1/categories/all - GET (Admin only)
    API : http://localhost:3001/api/v1/categories/:id - PATCH, DELETE (Admin only)
 
 * customers
    API : http://localhost:3001/api/v1/customers - GET, POST
    API : http://localhost:3001/api/v1/customers/:id - PATCH, DELETE

 * suppliers
    API : http://localhost:3001/api/v1/suppliers - GET, POST
    API : http://localhost:3001/api/v1/suppliers/:id - PATCH, DELETE
 
 * units 
    API : http://localhost:3001/api/v1/units - GET, POST
    API : http://localhost:3001/api/v1/units/:id - PATCH, DELETE
 
 * products
    API : http://localhost:3001/api/v1/products - GET, POST
    API : http://localhost:3001/api/v1/products/:id - PATCH, DELETE
 
 * purchases
    API : http://localhost:3001/api/v1/purchases - GET, POST
    API : http://localhost:3001/api/v1/purchases/:id - GET, PATCH
 
 * orders
    API : http://localhost:3001/api/v1/orders - GET, POST
    API : http://localhost:3001/api/v1/orders/:id/details - GET
    API : http://localhost:3001/api/v1/orders/:id/status - PATCH
    API : http://localhost:3001/api/v1/orders/:id/invoice - GET
 
 * reports
    API : http://localhost:3001/api/v1/reports/dashboard - GET
    API : http://localhost:3001/api/v1/reports/stock - GET
    API : http://localhost:3001/api/v1/reports/sales - GET
    API : http://localhost:3001/api/v1/reports/purchases - GET
    API : http://localhost:3001/api/v1/reports/top-products - GET
    API : http://localhost:3001/api/v1/reports/low-stock-alerts - GET

 * subscriptions
    API : http://localhost:3001/api/v1/subscriptions/me - GET
    API : http://localhost:3001/api/v1/subscriptions/me/usage - GET
    API : http://localhost:3001/api/v1/subscriptions/me/pause - PATCH
    API : http://localhost:3001/api/v1/subscriptions/me/cancel - PATCH
    API : http://localhost:3001/api/v1/subscriptions/me/reactivate - PATCH
    API : http://localhost:3001/api/v1/subscriptions/admin/users/:userId/plan - PATCH (Admin only)
    API : http://localhost:3001/api/v1/subscriptions/admin/users/:userId/usage - GET (Admin only)
 */

app.use(errorHandler);
export { app };
