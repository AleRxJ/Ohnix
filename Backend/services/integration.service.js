import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { encryptSecret, decryptSecret } from "../utils/secretEncryption.js";
import { getConnector } from "../connectors/registry.js";
import { PAYMENT_PROVIDER_KEYS } from "../paymentProviders/registry.js";
import { resolveDefaultPointOfSaleId } from "../middleware/pos.permissions.js";
import orderService from "./order.service.js";
import { findProductByAnyId, mapProduct } from "../controllers/product.controller.js";

const PUBLIC_BASE_URL = (process.env.PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

export const mapConnection = (connection) => ({
    _id: connection.id,
    provider: connection.provider,
    name: connection.name,
    status: connection.status,
    config: connection.config,
    last_synced_at: connection.lastSyncedAt,
    last_error: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
});

// Attaches decrypted credentials onto a connection row for exactly the
// duration of one connector call - never persisted, never returned by any
// API response (see IntegrationConnection's schema comment). Every
// connector method reads connection.credentials, never
// connection.credentialsEncrypted directly.
const withCredentials = (connection) => ({
    ...connection,
    credentials: connection.credentialsEncrypted ? JSON.parse(decryptSecret(connection.credentialsEncrypted)) : {},
});

export const createConnection = async (accountId, { provider, name, credentials, config }) => {
    getConnector(provider); // throws if the provider has no connector yet

    const connection = await prisma.integrationConnection.create({
        data: {
            accountId,
            provider,
            name: name || provider,
            config: config || {},
            credentialsEncrypted: credentials ? encryptSecret(JSON.stringify(credentials)) : null,
            status: "disconnected",
        },
    });
    return connection;
};

// Payment-provider connections (Bold, for the Caja) share this table but are
// managed from Finanzas (paymentProvider.controller.js) - the e-commerce
// Integrations screen and its endpoints never see or delete them.
const ECOMMERCE_ONLY = { provider: { notIn: PAYMENT_PROVIDER_KEYS } };

export const listConnections = (accountId) =>
    prisma.integrationConnection.findMany({ where: { accountId, ...ECOMMERCE_ONLY }, orderBy: { createdAt: "desc" } });

export const findConnectionForAccount = async (id, accountId) => {
    const connection = await prisma.integrationConnection.findFirst({ where: { id, accountId, ...ECOMMERCE_ONLY } });
    if (!connection) throw new ApiError(404, "Integration connection not found");
    return connection;
};

const logSync = (connectionId, { direction, entityType, action, entityId, externalId, status, requestPayload, responsePayload, errorMessage }) =>
    prisma.syncLog
        .create({
            data: { connectionId, direction, entityType, action, entityId, externalId, status, requestPayload, responsePayload, errorMessage },
        })
        .catch((err) => console.error("[integration] failed to write sync log", err));

export const testConnection = async (connectionId, accountId) => {
    const connection = await findConnectionForAccount(connectionId, accountId);
    const connector = getConnector(connection.provider);

    try {
        const result = await connector.testConnection(withCredentials(connection));
        await prisma.integrationConnection.update({
            where: { id: connection.id },
            data: { status: "connected", lastError: null },
        });
        await logSync(connection.id, { direction: "outbound", entityType: "connection", action: "test", status: "success", responsePayload: result });
        return result;
    } catch (error) {
        await prisma.integrationConnection.update({
            where: { id: connection.id },
            data: { status: "error", lastError: error.message },
        });
        await logSync(connection.id, { direction: "outbound", entityType: "connection", action: "test", status: "error", errorMessage: error.message });
        throw error;
    }
};

// Registers Ohnix's webhook receiver with the channel so it can start
// pushing orders back - called right after a successful testConnection
// from the "connect" flow (see integration.controller.js#connectIntegration).
export const registerWebhooks = async (connectionId, accountId) => {
    const connection = await findConnectionForAccount(connectionId, accountId);
    const connector = getConnector(connection.provider);
    if (!PUBLIC_BASE_URL) {
        throw new ApiError(500, "PUBLIC_API_BASE_URL is not configured - webhooks can't be registered without a reachable callback URL");
    }
    const callbackUrl = `${PUBLIC_BASE_URL}/api/v1/integrations/${connection.provider}/webhook/${connection.id}`;
    await connector.registerWebhooks(withCredentials(connection), callbackUrl);
};

const upsertExternalReference = (connectionId, entityType, entityId, externalId, extra = {}) =>
    prisma.externalReference.upsert({
        where: { connectionId_entityType_entityId: { connectionId, entityType, entityId } },
        create: { connectionId, entityType, entityId, externalId, lastSyncedAt: new Date(), ...extra },
        update: { externalId, lastSyncedAt: new Date(), lastError: null, ...extra },
    });

// Pushes one product (and its variants) to a channel - creates it there on
// first publish, updates it on every later call (the ExternalReference row
// created here is what tells this function which case it is). See
// connectors/base.connector.js#pushProduct for the connector-side contract.
export const publishProduct = async (connectionId, accountId, productId) => {
    const connection = await findConnectionForAccount(connectionId, accountId);
    const connector = getConnector(connection.provider);

    const product = await findProductByAnyId(productId);
    if (!product || product.createdById !== accountId) {
        throw new ApiError(404, "Product not found");
    }

    const variants = await prisma.productVariant.findMany({ where: { productId: product.id }, orderBy: { position: "asc" } });
    const existingRef = await prisma.externalReference.findUnique({
        where: { connectionId_entityType_entityId: { connectionId, entityType: "product", entityId: product.id } },
    });

    try {
        const result = await connector.pushProduct(withCredentials(connection), {
            product: mapProduct(product),
            variants: variants.map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode, optionsLabel: v.optionsLabel, sellingPrice: v.sellingPrice })),
            externalId: existingRef?.externalId,
        });

        await upsertExternalReference(connectionId, "product", product.id, result.externalId, { externalUrl: result.externalUrl });

        // inventoryMeta's per-entry shape is connector-specific and opaque
        // here on purpose (see base.connector.js#pushProduct) - it's stored
        // verbatim and handed back unchanged to pushInventory below.
        for (const variant of variants) {
            const externalVariantId = result.variantExternalIds?.[variant.id];
            if (!externalVariantId) continue;
            await upsertExternalReference(connectionId, "variant", variant.id, externalVariantId, {
                metadata: result.inventoryMeta?.[variant.id] || null,
            });
        }
        if (variants.length === 0 && result.inventoryMeta?.default) {
            await upsertExternalReference(connectionId, "product", product.id, result.externalId, {
                externalUrl: result.externalUrl,
                metadata: result.inventoryMeta.default,
            });
        }

        await prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), lastError: null } });
        await logSync(connection.id, {
            direction: "outbound",
            entityType: "product",
            action: "publish",
            entityId: product.id,
            externalId: result.externalId,
            status: "success",
            responsePayload: result,
        });
        return result;
    } catch (error) {
        await prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastError: error.message } });
        await logSync(connection.id, {
            direction: "outbound",
            entityType: "product",
            action: "publish",
            entityId: product.id,
            status: "error",
            errorMessage: error.message,
        });
        throw error;
    }
};

// Pushes the current stock for one product/variant already published to a
// channel - a no-op (not an error) if it was never published there, since
// sync loops call this per-item across every connection an account has.
export const syncInventory = async (connectionId, accountId, { productId, variantId }) => {
    const connection = await findConnectionForAccount(connectionId, accountId);
    const connector = getConnector(connection.provider);

    const entityType = variantId ? "variant" : "product";
    const entityId = variantId || productId;
    const ref = await prisma.externalReference.findUnique({
        where: { connectionId_entityType_entityId: { connectionId, entityType, entityId } },
    });
    if (!ref) return { skipped: true, reason: "not_published" };

    const quantity = variantId
        ? (await prisma.productVariant.findUnique({ where: { id: variantId }, select: { stock: true } }))?.stock ?? 0
        : (await prisma.product.findUnique({ where: { id: productId }, select: { stock: true } }))?.stock ?? 0;

    try {
        await connector.pushInventory(withCredentials(connection), {
            variantExternalId: ref.externalId,
            quantity,
            ...(ref.metadata || {}),
        });
        await prisma.externalReference.update({ where: { id: ref.id }, data: { lastSyncedAt: new Date(), lastError: null } });
        await logSync(connection.id, { direction: "outbound", entityType, action: "inventory_sync", entityId, externalId: ref.externalId, status: "success", responsePayload: { quantity } });
        return { skipped: false, quantity };
    } catch (error) {
        await prisma.externalReference.update({ where: { id: ref.id }, data: { lastError: error.message } });
        await logSync(connection.id, { direction: "outbound", entityType, action: "inventory_sync", entityId, status: "error", errorMessage: error.message });
        throw error;
    }
};

const findByExternalId = (connectionId, entityType, externalId) =>
    prisma.externalReference.findUnique({
        where: { connectionId_entityType_externalId: { connectionId, entityType, externalId } },
    });

const findOrCreateCustomer = async (accountId, pointOfSaleId, { name, email, phone }) => {
    const normalizedEmail = (email || "").toLowerCase().trim() || null;
    const normalizedPhone = (phone || "").trim() || null;

    if (normalizedEmail || normalizedPhone) {
        const existing = await prisma.customer.findFirst({
            where: {
                createdById: accountId,
                OR: [normalizedEmail ? { email: normalizedEmail } : undefined, normalizedPhone ? { phone: normalizedPhone } : undefined].filter(Boolean),
            },
        });
        if (existing) return existing;
    }

    return prisma.customer.create({
        data: {
            name: name || "Cliente",
            email: normalizedEmail || `sin-correo+${Date.now()}@ohnix.channel`,
            phone: normalizedPhone || "0000000000",
            photo: "default-customer.png",
            createdById: accountId,
            pointOfSaleId,
        },
    });
};

// Ingests one order webhook payload from a channel into Ohnix - resolves
// (or creates) the buyer as a Customer, resolves each line back to an
// Ohnix product/variant via ExternalReference, and creates the order
// through the SAME orderService.createOrder every other path uses (POS,
// public API) so tax/DIAN/accounting logic never has two implementations.
// Idempotent per (connection, external order id) via IdempotencyKey - a
// re-delivered webhook (Shopify retries on anything but a 2xx) replays the
// first result instead of creating a second order.
export const ingestInboundOrder = async (connection, rawPayload) => {
    const connector = getConnector(connection.provider);
    const mapped = connector.mapInboundOrder(rawPayload);

    const idempotencyKey = { accountId: connection.accountId, scope: `connector.order.${connection.provider}`, key: mapped.externalOrderId };
    const existingIdem = await prisma.idempotencyKey.findUnique({ where: { accountId_scope_key: idempotencyKey } });
    if (existingIdem?.status === "completed") {
        return { alreadyProcessed: true, order: existingIdem.responseBody };
    }

    try {
        const pointOfSaleId = await resolveDefaultPointOfSaleId(connection.accountId);
        const customer = await findOrCreateCustomer(connection.accountId, pointOfSaleId, mapped.customer);

        const orderItems = [];
        for (const line of mapped.lineItems) {
            let productId = null;
            let variantId = null;

            if (line.variantExternalId) {
                const variantRef = await findByExternalId(connection.id, "variant", line.variantExternalId);
                if (variantRef) {
                    const variant = await prisma.productVariant.findUnique({ where: { id: variantRef.entityId } });
                    if (variant) {
                        productId = variant.productId;
                        variantId = variant.id;
                    }
                }
                if (!productId) {
                    const productRef = await findByExternalId(connection.id, "product", line.variantExternalId);
                    if (productRef) productId = productRef.entityId;
                }
            }
            if (!productId && line.sku) {
                const bySku = await prisma.product.findFirst({ where: { sku: line.sku, createdById: connection.accountId } });
                if (bySku) productId = bySku.id;
            }
            if (!productId) {
                throw new ApiError(422, `Could not match order line "${line.title}" to any Ohnix product`);
            }

            orderItems.push({ product_id: productId, variant_id: variantId, quantity: line.quantity, unitcost: line.unitPrice });
        }

        const order = await orderService.createOrder(
            {
                customer_id: customer.id,
                order_status: mapped.status === "cancelled" ? "cancelled" : "completed",
                orderItems,
                channel: connection.provider,
                external_order_id: mapped.externalOrderId,
                external_connection_id: connection.id,
            },
            connection.accountId,
            "user",
            pointOfSaleId
        );

        await prisma.idempotencyKey.create({
            data: { ...idempotencyKey, status: "completed", responseStatus: 201, responseBody: order },
        }).catch(() => {}); // a concurrent delivery may have already written this - fine either way

        await upsertExternalReference(connection.id, "order", order._id, mapped.externalOrderId);
        await logSync(connection.id, {
            direction: "inbound",
            entityType: "order",
            action: "ingest",
            entityId: order._id,
            externalId: mapped.externalOrderId,
            status: "success",
            requestPayload: rawPayload,
        });

        return { alreadyProcessed: false, order };
    } catch (error) {
        await logSync(connection.id, {
            direction: "inbound",
            entityType: "order",
            action: "ingest",
            externalId: mapped.externalOrderId,
            status: "error",
            requestPayload: rawPayload,
            errorMessage: error.message,
        });
        throw error;
    }
};

// Entry point for every inbound order webhook (orders/create, .../updated,
// .../cancelled all land here - Shopify's own topics don't cleanly map
// 1:1 to "create vs update", so this decides that itself from whether an
// ExternalReference for the order already exists).
//
// v1 deliberately only applies ONE status transition on an update:
// completed -> cancelled (a real cancellation in the channel). Every other
// "updated" delivery (payment captured, fulfillment, tags changed, ...) is
// logged to SyncLog but not applied - order.service.js#updateOrderStatus's
// transition table is intentionally narrow (see its own comments) and
// guessing a channel-specific status through it risks a transition that
// makes sense in Shopify but not in Ohnix's own order lifecycle. Widening
// this is a documented fast-follow (see docs/api/webhooks.md), not an
// oversight.
export const handleInboundOrderEvent = async (connection, rawPayload) => {
    const connector = getConnector(connection.provider);
    const mapped = connector.mapInboundOrder(rawPayload);

    const existingRef = await findByExternalId(connection.id, "order", mapped.externalOrderId);
    if (!existingRef) {
        return ingestInboundOrder(connection, rawPayload);
    }

    if (mapped.status === "cancelled") {
        const order = await prisma.order.findUnique({ where: { id: existingRef.entityId }, select: { id: true, orderStatus: true } });
        if (order?.orderStatus === "completed") {
            await orderService.updateOrderStatus(order.id, "cancelled", connection.accountId, "user", {
                prismaId: connection.accountId,
                role: "user",
                posScopeAll: true,
                posScopeIds: null,
            });
            await logSync(connection.id, {
                direction: "inbound",
                entityType: "order",
                action: "status_sync",
                entityId: order.id,
                externalId: mapped.externalOrderId,
                status: "success",
                responsePayload: { applied: "cancelled" },
            });
            return { alreadyProcessed: true, updated: true };
        }
    }

    await logSync(connection.id, {
        direction: "inbound",
        entityType: "order",
        action: "status_sync_skipped",
        entityId: existingRef.entityId,
        externalId: mapped.externalOrderId,
        status: "success",
        responsePayload: { channelStatus: mapped.status },
    });
    return { alreadyProcessed: true, updated: false };
};

export const withDecryptedCredentials = withCredentials;
