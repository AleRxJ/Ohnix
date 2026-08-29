// Customer-facing label for whichever DIAN provider actually issued a given
// document. Alanube/Factus are third-party resellers the customer's plan is
// billed through, so they're shown under their own brand. itcycle-api-dian is
// Ohnix's own in-house engine (not a reseller a customer would recognize by
// name), so it's branded as Ohnix instead of leaking that internal partner
// name into customer-facing copy.
export const ELECTRONIC_INVOICING_PROVIDER_LABELS = {
    factus: "Factus",
    alanube: "Alanube",
    itcycle: "Ohnix",
};

export const getElectronicInvoicingProviderLabel = (provider) =>
    ELECTRONIC_INVOICING_PROVIDER_LABELS[provider] || ELECTRONIC_INVOICING_PROVIDER_LABELS.alanube;
