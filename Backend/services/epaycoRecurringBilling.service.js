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
    // eslint-disable-next-line global-require, import/no-dynamic-require
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

// Wrapped so it NEVER throws past this function - the monthly scheduler
// processes many clients in one run and a single ePayco failure (declined
// card, network error, etc.) must only fail that one client's charge, never
// abort the batch. Every outcome (success or failure) is reported back for
// the caller to log as an ExternalApiClientCharge row either way.
export const chargeExternalApiClient = async ({ client, amountCop, description, billReference }) => {
    try {
        const epayco = getEpaycoSdk();
        // ePayco requires a cardholder identification on a direct charge -
        // ASSUMPTION (not confirmed against a real test charge yet): using
        // "NIT" as doc_type with the company's own taxIdentification as
        // doc_number, since every ExternalApiClient is a company and DIAN's
        // own "31" code is unlikely to be what ePayco's own doc_type
        // vocabulary expects. Verify this against a real sandbox charge
        // before relying on it in production - if ePayco rejects the
        // doc_type value, this is the first place to look.
        const response = await epayco.charge.create({
            token_card: client.epaycoTokenCard,
            customer_id: client.epaycoCustomerId,
            doc_type: "NIT",
            doc_number: client.taxIdentification,
            name: client.companyName,
            last_name: "(empresa)",
            email: client.contactEmail || undefined,
            bill: billReference,
            description,
            value: String(amountCop),
            tax: "0",
            tax_base: "0",
            currency: "COP",
            dues: "1",
        });

        const success = Boolean(response?.success !== false && response?.data?.estado?.toLowerCase?.() !== "rechazada");
        const ref = response?.data?.ref_payco || response?.data?.transaction_id || null;
        return { success, ref, raw: response };
    } catch (error) {
        return { success: false, ref: null, raw: { error: error?.message || String(error) } };
    }
};
