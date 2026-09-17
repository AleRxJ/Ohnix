import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "../docs/openapi.js";

const router = Router();

// Publicly reachable - the whole point is letting an external developer
// browse/try the API without first getting a key (see docs/api/README.md's
// "primer request" flow). swagger-ui-express self-hosts its assets, so this
// never depends on an external CDN.
router.get("/openapi.json", (_req, res) => res.status(200).json(openApiDocument));
router.use("/", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "Ohnix API Docs" }));

export default router;
