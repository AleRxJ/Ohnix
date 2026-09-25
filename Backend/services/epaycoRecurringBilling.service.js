// Backend/services/epaycoRecurringBilling.service.js
//
// Recurring, variable-amount charges against an already-tokenized card for
// an ExternalApiClient (see externalApiClient.service.js). Uses the OFFICIAL
// epayco-sdk-node package - not epayco.service.js's own on-page checkout
// widget (that one is for a human clicking through a one-time payment on
// Ohnix's own SaaS plans, a different flow entirely).
//
// Deliberately NOT using ePayco's "Suscripciones"/plans product
// (epayco.plans.create + epayco.subscriptions.charge) - confirmed from
// ePayco's own docs that plans charge a FIXED amount per cycle, which
// doesn't fit this product's usage-based billing (the amount changes every
// month). epayco.charge.create against a stored token_card/customer_id is
// the right primitive here: a plain one-time charge for whatever `value` we
// compute ourselves, run monthly by apiClientBillingScheduler.js.
//
// The card itself is NEVER touched here or anywhere in this backend - it is
// tokenized client-side, in the browser, via ePayco's own
// `ePayco.token.create($form, callback)` JS (see Frontend/src/pages/
// EnrollApiBilling.jsx) which sends the card straight to ePayco's servers.
// Only the resulting token id (an opaque ePayco reference, not card data)
// ever reaches this backend.
//
// Also reused for Ohnix's own SaaS subscription auto-renewal (see
// subscriptionAutoRenew.service.js) - same primitive, a stored token_card
// charged for an amount we compute ourselves.

import { createRequire } from "module";

// epayco-sdk-node is CommonJS-only; this backend is an ES module
// ("type": "module"), where a bare `require` doesn't exist.
const require = createRequire(import.meta.url);

const getEpaycoSdk = () => {
    const apiKey = `${process.env.EPAYCO_PUBLIC_KEY || ""}`.trim();
    const privateKey = `${process.env.EPAYCO_PRIVATE_KEY || ""}`.trim();
    if (!apiKey || !privateKey) {
        throw new Error("ePayco is not configured. Set EPAYCO_PUBLIC_KEY and EPAYCO_PRIVATE_KEY.");
    }
    // Same TRUE/FALSE normalization as epayco.service.js's own `test` flag -
    // defaults to test mode so a missing/misconfigured env var never
    // accidentally fires a real charge.
    const test = `${process.env.EPAYCO_TEST || "TRUE"}`.trim().toUpperCase() !== "FALSE";
    return require("epayco-sdk-node")({ apiKey, privateKey, lang: "ES", test });
};

// ePayco's `customers.create` fields are person-shaped (name/last_name), but
// an ExternalApiClient is a company - `companyName` goes entirely into
// `name`, with a fixed literal in `last_name` rather than splitting the
// company name in half, since there's no real "surname" to extract from it.
export const createEpaycoCustomerForClient = async ({ client, tokenCard }) => {
    const epayco = getEpaycoSdk();
    const customer = await epayco.customers.create({
        token_card: tokenCard,
        name: client.companyName,
        last_name: "(empresa)",
        email: client.contactEmail || undefined,
        default: true,
        phone: client.contactPhone || undefined,
        cell_phone: client.contactPhone || undefined,
    });
    return customer;
};

// Normalizes charge.create's response. `data.cod_respuesta` / `data.estado`
// carry the transaction state (1/Aceptada, 2/Rechazada, 3/Pendiente,
// 4/Fallida) - "Pendiente" (antifraud review / 3DS) is NOT a success: the
// signed confirmation webhook (handleEpaycoConfirmation, reached via the
// url_confirmation + extra1 we pass) or the reconcile job settles it later.
const parseEpaycoChargeResponse = (response) => {
    const data = response?.data || {};
    const code = parseInt(`${data.cod_respuesta ?? data.x_cod_response ?? data.x_cod_transaction_state ?? 0}`, 10);
    const estado = `${data.estado ?? data.x_transaction_state ?? data.respuesta ?? ""}`.trim().toLowerCase();
    let state = "failed";
    if (code === 1 || estado === "aceptada") state = "approved";
    else if (code === 3 || estado === "pendiente") state = "pending";
    else if (code === 2 || estado === "rechazada") state = "rejected";
    if (response?.success === false || response?.status === false) state = "failed";
    return {
        state,
        success: state === "approved",
        ref: data.ref_payco ? String(data.ref_payco) : data.transaction_id ? String(data.transaction_id) : null,
        amount: data.valor != null ? Math.round(Number(data.valor)) : null,
        currency: `${data.moneda || ""}`.toUpperCase() || null,
        isTest: data.enpruebas != null ? ["1", "true", "si", "sí"].includes(`${data.enpruebas}`.toLowerCase()) : null,
        message: data.respuesta || response?.text_response || response?.message || null,
    };
};

// Creates an ePayco customer holding a browser-tokenized card. Returns the
// customer id (ePayco's response shape varies across API versions).
export const createEpaycoCustomer = async ({ tokenCard, name, lastName, email, phone }) => {
    const epayco = getEpaycoSdk();
    const customer = await epayco.customers.create({
        token_card: tokenCard,
        name,
        last_name: lastName || name,
        email: email || undefined,
        default: true,
        phone: phone || undefined,
        cell_phone: phone || undefined,
    });
    const customerId = customer?.data?.customerId || customer?.data?.id_customer || customer?.data?.customer_id;
    if (!customerId) {
        throw new Error(customer?.message || customer?.data?.description || "ePayco did not return a customer id");
    }
    return String(customerId);
};

// Generic stored-card charge. Wrapped so it NEVER throws - schedulers
// process many accounts per run and one declined card must only fail that
// one charge. `extras.extra1` should be the PlanUpgradeRequest id when the
// charge belongs to a SaaS subscription, so the confirmation webhook can
// settle a "Pendiente" result on its own.
export const chargeEpaycoToken = async ({
    customerId,
    tokenCard,
    docType,
    docNumber,
    name,
    lastName,
    email,
    value,
    bill,
    description,
    ip,
    urlConfirmation,
    extras = {},
}) => {
    try {
        const epayco = getEpaycoSdk();
        const response = await epayco.charge.create({
            token_card: tokenCard,
            customer_id: customerId,
            doc_type: docType,
            doc_number: docNumber,
            name,
            last_name: lastName || name,
            email: email || undefined,
            bill,
            description,
            value: String(value),
            tax: "0",
            tax_base: "0",
            currency: "COP",
            dues: "1",
            // ePayco requires the payer's IP; a server-initiated renewal has
            // none, so the server's own placeholder is sent in that case.
            ip: ip || "127.0.0.1",
            ...(urlConfirmation ? { url_confirmation: urlConfirmation, method_confirmation: "POST" } : {}),
            use_default_card_customer: true,
            ...extras,
        });
        return { ...parseEpaycoChargeResponse(response), raw: response };
    } catch (error) {
        return { state: "failed", success: false, ref: null, message: error?.message || String(error), raw: { error: error?.message || String(error) } };
    }
};

// ExternalApiClient wrapper - see chargeEpaycoToken. ASSUMPTION (not
// confirmed against a real test charge yet): "NIT" as doc_type with the
// company's taxIdentification, since every ExternalApiClient is a company.
export const chargeExternalApiClient = async ({ client, amountCop, description, billReference }) => {
    const result = await chargeEpaycoToken({
        customerId: client.epaycoCustomerId,
        tokenCard: client.epaycoTokenCard,
        docType: "NIT",
        docNumber: client.taxIdentification,
        name: client.companyName,
        lastName: "(empresa)",
        email: client.contactEmail,
        value: amountCop,
        bill: billReference,
        description,
    });
    return { success: result.success, ref: result.ref, raw: result.raw };
};
