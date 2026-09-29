import { Router } from "express";
import {
    downloadDemoCatalogFile,
    getDemoRequest,
    listDemoRequests,
    previewDemoImport,
    provisionDemoRequest,
    sendDemoRequestAccess,
    submitDemoRequest,
    updateDemoRequest,
} from "../controllers/demoRequest.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import { demoCatalogUpload } from "../middleware/multer.middleware.js";
import { demoRequestRateLimiter } from "../middleware/rateLimit.middleware.js";
import { ApiError } from "../utils/ApiError.js";

// Multer rejects (wrong type, over 5MB) as plain Errors - surface them as a
// translatable 400 instead of the generic 500.
const catalogFile = (req, res, next) =>
    demoCatalogUpload.single("catalog_file")(req, res, (error) => {
        if (!error) return next();
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return next(
            new ApiError(400, tooLarge ? "The file can be at most 5MB." : error.message, [], "", tooLarge ? "demo_catalog_too_large" : "demo_catalog_invalid_type")
        );
    });

// Public, unauthenticated: the /agenda-demo form (Instagram/TikTok funnel).
export const demoRequestPublicRouter = Router();
demoRequestPublicRouter.route("/").post(demoRequestRateLimiter, catalogFile, submitDemoRequest);

// Platform admins only: work the requests and provision the prospect's account.
export const demoRequestAdminRouter = Router();
demoRequestAdminRouter.use(verifyJWT, isAdmin);
demoRequestAdminRouter.route("/").get(listDemoRequests);
demoRequestAdminRouter.route("/:id").get(getDemoRequest).patch(idempotent("demo-request.update"), updateDemoRequest);
demoRequestAdminRouter.route("/:id/catalog-file").get(downloadDemoCatalogFile);
demoRequestAdminRouter.route("/:id/import-preview").post(previewDemoImport);
demoRequestAdminRouter.route("/:id/provision").post(idempotent("demo-request.provision"), provisionDemoRequest);
demoRequestAdminRouter.route("/:id/send-access").post(idempotent("demo-request.send-access"), sendDemoRequestAccess);
