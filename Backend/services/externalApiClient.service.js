// Backend/services/externalApiClient.service.js
//
// Admin-only provisioning of "external API clients" - companies with NO
// Ohnix account/Company row (their own POS/ERP/SaaS) that want to integrate
// directly against itcycle-api-dian's DIAN e-invoicing engine via API,
// bypassing Ohnix's own app entirely. Today this only exists as raw
// curl/Postman calls against itcycle-api-dian's admin API; this service (and
// the admin UI backed by it) is the first Ohnix-side wrapper around it.
//
// Unlike Company (Ohnix's own tenants), ExternalApiClient never gets an
// itcycleApiKeyCiphertext-style column - the whole point of an external
// client is that THEY call itcycle-api-dian directly with their own key, so
// Ohnix's backend never needs to reuse it. See issueApiKeyForExternalClient
// below for why the raw key is never persisted here either.

import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { provisionItcycleCompany, createItcycleApiKey, listItcycleApiKeys, getItcycleCompanyUsage } from "./itcycleDian.service.js";

// Calls itcycle-api-dian FIRST, before touching Ohnix's own DB - if
// provisioning fails there, no ExternalApiClient row is ever created, so a
// failed upstream call never leaves a half-written local record pointing at
// an itcycleCompanyId that doesn't actually exist.
export const createExternalApiClient = async ({
    companyName,
    taxIdentification,
    taxIdentificationDv,
    personType,
    contactName,
    contactEmail,
    contactPhone,
    notes,
    createdByUserId,
}) => {
    const itcycleCompany = await provisionItcycleCompany({
        name: companyName,
        nit: taxIdentification,
        dv: taxIdentificationDv,
        personType,
    });

    return prisma.externalApiClient.create({
        data: {
            companyName,
            taxIdentification,
            taxIdentificationDv,
            personType,
            contactName: contactName || null,
            contactEmail: contactEmail || null,
            contactPhone: contactPhone || null,
            notes: notes || null,
            itcycleCompanyId: itcycleCompany.id,
            createdByUserId,
        },
    });
};

export const listExternalApiClients = () =>
    prisma.externalApiClient.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            createdByUser: { select: { username: true, email: true } },
            apiKeyIssuances: { orderBy: { issuedAt: "desc" } },
        },
    });

// Issues a brand-new itcycle-api-dian API key for an already-provisioned
// external client and returns the raw key to the caller EXACTLY ONCE -
// mirroring itcycle-api-dian's own one-time reveal for a Company's key (see
// createItcycleApiKey's caller in company.controller.js). Deliberately does
// NOT store the raw key anywhere in Ohnix's DB (not encrypted, not
// plaintext, not logged) - only the issuance EVENT (label, who, when) is
// recorded, so the admin UI can later show "a key was issued on this date by
// this admin" without ever being able to show the key value itself again.
export const issueApiKeyForExternalClient = async ({ externalApiClientId, label, issuedByUserId }) => {
    const client = await prisma.externalApiClient.findUnique({ where: { id: externalApiClientId } });
    if (!client) {
        throw new ApiError(404, "External API client not found");
    }

    const rawKey = await createItcycleApiKey({ companyId: client.itcycleCompanyId, label });

    // Metadata only - see this function's own comment above for why the key
    // itself never reaches this insert.
    await prisma.externalApiClientKeyIssuance.create({
        data: {
            externalApiClientId,
            label: label || null,
            issuedByUserId,
        },
    });

    return rawKey;
};

// Cross-checks Ohnix's own issuance log (ExternalApiClientKeyIssuance, which
// only ever records metadata) against what itcycle-api-dian actually has on
// file for this company - itcycle-api-dian's admin API had no way to
// enumerate this before, so until now this admin UI's "keys issued" count
// was pure Ohnix bookkeeping, never verified against the source of truth.
export const listLiveApiKeysForExternalClient = async ({ externalApiClientId }) => {
    const client = await prisma.externalApiClient.findUnique({ where: { id: externalApiClientId } });
    if (!client) {
        throw new ApiError(404, "External API client not found");
    }

    return listItcycleApiKeys({ companyId: client.itcycleCompanyId });
};

// Read-only billable-usage lookup (current calendar month, ACCEPTED
// documents only) - see getItcycleCompanyUsage. Lets Ohnix's admin panel
// show real numbers before manually invoicing an external client against its
// published per-document pricing.
export const getUsageForExternalClient = async ({ externalApiClientId }) => {
    const client = await prisma.externalApiClient.findUnique({ where: { id: externalApiClientId } });
    if (!client) throw new ApiError(404, "External API client not found");
    return getItcycleCompanyUsage({ companyId: client.itcycleCompanyId });
};
