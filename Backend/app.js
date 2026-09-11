import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import errorHandler from "./middleware/error.middleware.js";
import { handlePaymentWebhook, handleEpaycoConfirmation, handleEpaycoResponse } from "./controllers/subscription.controller.js";
import { handleCertificateOrderEpaycoConfirmation, handleCertificateOrderEpaycoResponse } from "./controllers/certificateOrderPayment.controller.js";
import { receiveConnectorWebhook } from "./controllers/connectorWebhook.controller.js";
import { isOriginAllowed } from "./utils/allowedOrigins.js";
import { getRedisHealth } from "./utils/redisClient.js";

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

// This is a JSON API, not an HTML-rendering server, so the default CSP
// (meant for pages with scripts/styles/images) has nothing to allow-list
// here and only risks blocking the few static files under Backend/public.
// contentSecurityPolicy: false keeps the other protections (X-Frame-Options,
// X-Content-Type-Options: nosniff, HSTS, etc.) without a policy tuned for a
// use case this server doesn't have.
app.use(helmet({ contentSecurityPolicy: false }));

app.get("/", (req, res) => {
   res.json({
      message: "Hello World !!",
      status: "Backend is running",
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || "development",
      // Redis fails open everywhere it's used (session enforcement,
      // presence, edit-locks), so an outage was previously invisible
      // outside console logs - see utils/redisClient.js#getRedisHealth.
      redis: getRedisHealth(),
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
        allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
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

// Same public ePayco pattern as above, scoped to CertificateOrder (Viafirma
// digital-certificate purchases) instead of PlanUpgradeRequest.
app.post(
    "/api/v1/certificate-orders/payments/epayco/confirmation",
    express.json({ limit: "16kb" }),
    express.urlencoded({ extended: true, limit: "16kb" }),
    handleCertificateOrderEpaycoConfirmation
);
app.get("/api/v1/certificate-orders/payments/epayco/response", handleCertificateOrderEpaycoResponse);
app.post(
    "/api/v1/certificate-orders/payments/epayco/response",
    express.json({ limit: "16kb" }),
    express.urlencoded({ extended: true, limit: "16kb" }),
    handleCertificateOrderEpaycoResponse
);

// Inbound webhooks FROM a connected e-commerce channel (Shopify order
// events today) - raw body needed for HMAC verification, same reasoning as
// the Stripe/ePayco routes above. See connectors/shopify.connector.js#verifyWebhookSignature.
app.post(
    "/api/v1/integrations/:provider/webhook/:connectionId",
    express.raw({ type: "application/json", limit: "2mb" }),
    receiveConnectorWebhook
);

// NOTE: There is no Factus webhook endpoint here (there used to be one).
// The official Factus V2 Postman collection (source of truth for this
// integration) has zero webhook/event-push endpoints, and every document
// creation call ("Crear y validar") responds synchronously with the final
// validation result in the same HTTP response - there is nothing async to
// receive a callback for. If Factus support ever confirms a real webhook
// feature, reintroduce this route plus FACTUS_WEBHOOK_SECRET and the
// corresponding service/controller functions (removed on 2026-08-04).

// Provisioning may include a customer-owned .p12/.pfx certificate encoded
// in base64. 16kb made that normal onboarding step fail before its route was
// reached; 2mb remains deliberately bounded for every JSON endpoint.
app.use(express.json({ limit: "2mb" }));
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
import purchaseQuotationRouter from "./routes/purchaseQuotation.routes.js";
import salesQuotationRouter from "./routes/salesQuotation.routes.js";
import publicSalesQuotationRouter from "./routes/publicSalesQuotation.routes.js";
import orderRouter from "./routes/order.routes.js";
import reportRouter from "./routes/report.routes.js";
import schedulerRouter from "./routes/scheduler.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import pricingRouter from "./routes/pricing.routes.js";
import companyRouter from "./routes/company.routes.js";
import dianTestMatrixRouter from "./routes/dianTestMatrix.routes.js";
import dianTestMatrixSelfRouter from "./routes/dianTestMatrixSelf.routes.js";
import companySelfRouter from "./routes/companySelf.routes.js";
import electronicInvoiceRouter from "./routes/electronicInvoice.routes.js";
import purchaseSupportDocumentRouter from "./routes/purchaseSupportDocument.routes.js";
import receivedInvoiceReceiptRouter from "./routes/receivedInvoiceReceipt.routes.js";
import apiKeyRouter from "./routes/apiKey.routes.js";
import publicApiRouter from "./routes/publicApi.routes.js";
import teamRouter from "./routes/team.routes.js";
import pointOfSaleRouter from "./routes/pointOfSale.routes.js";
import stockTransferRouter from "./routes/stockTransfer.routes.js";
import tutorialDataRouter from "./routes/tutorialData.routes.js";
import systemSettingsRouter from "./routes/systemSettings.routes.js";
import financeRouter from "./routes/finance.routes.js";
import accountingRouter from "./routes/accounting.routes.js";
import contactRouter from "./routes/contact.routes.js";
import integrationRouter from "./routes/integration.routes.js";
import webhookEndpointRouter from "./routes/webhookEndpoint.routes.js";
import apiDocsRouter from "./routes/apiDocs.routes.js";
import assistantRouter from "./routes/assistant.routes.js";

//routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/suppliers", supplierRouter);
app.use("/api/v1/units", unitRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/purchases", purchaseRouter);
app.use("/api/v1/purchase-quotations", purchaseQuotationRouter);
app.use("/api/v1/sales-quotations", salesQuotationRouter);
app.use("/api/v1/public", publicSalesQuotationRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/scheduler", schedulerRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);
app.use("/api/v1/pricing", pricingRouter);
app.use("/api/v1/companies", companyRouter);
app.use("/api/v1/admin/dian-test-matrix", dianTestMatrixRouter);
app.use("/api/v1/company/dian-test-matrix", dianTestMatrixSelfRouter);
app.use("/api/v1/company", companySelfRouter);
app.use("/api/v1/electronic-invoices", electronicInvoiceRouter);
app.use("/api/v1/purchase-support-documents", purchaseSupportDocumentRouter);
app.use("/api/v1/received-invoice-receipts", receivedInvoiceReceiptRouter);
app.use("/api/v1/api-keys", apiKeyRouter);
app.use("/api/v1/public", publicApiRouter);
app.use("/api/v1/integrations", integrationRouter);
app.use("/api/v1/webhooks", webhookEndpointRouter);
// apiDocsRouter is intentionally unauthenticated (see its own comment) -
// it MUST stay ahead of teamRouter/pointOfSaleRouter below for the same
// reason contactRouter does.
app.use("/api/v1/docs", apiDocsRouter);
// Mounted before teamRouter/pointOfSaleRouter: both apply router.use(verifyJWT)
// with no path restriction while mounted at the bare "/api/v1" prefix, so any
// router registered after them under that same prefix inherits their auth
// check for every path - this must stay ahead of them or /contact 401s.
app.use("/api/v1", contactRouter);
app.use("/api/v1", teamRouter);
app.use("/api/v1", pointOfSaleRouter);
app.use("/api/v1/stock-transfers", stockTransferRouter);
app.use("/api/v1/tutorial-data", tutorialDataRouter);
app.use("/api/v1/system-settings", systemSettingsRouter);
app.use("/api/v1/finance", financeRouter);
app.use("/api/v1/accounting", accountingRouter);
app.use("/api/v1/assistant", assistantRouter);

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
