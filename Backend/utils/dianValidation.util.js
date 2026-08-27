// Real DIAN credential/format checks, grounded in Ohnix's own DIAN engine
// (itcycle-api-dian/dian-engine: packages/core/src/schemas/common.schema.ts,
// docs/guia-inicio-rapido.md, docs/technical-reference/dian-xml-specifications.md).
// itcycle-api-dian's admin API itself accepts these as bare strings (its
// SetDianConfigurationBodySchema/CreateNumberingResolutionBodySchema don't
// enforce format), so a malformed value only fails much later at invoice
// issuance time or gets silently rejected by the DIAN. Catching the real
// shape here, at setup, surfaces the problem immediately instead.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The "clave técnica" DIAN returns from SetTestConfiguration is a 40-char
// lowercase hex token (SHA1 length) - see dian-engine's quickstart example:
// fc8eac422eba16e22ffd8c6f94b3f40a6e38162c
const TECHNICAL_KEY_RE = /^[0-9a-f]{40}$/i;
const NIT_RE = /^\d{6,15}$/;
// dian-kit's own NumberingAuthorizationSchema caps prefix at 4 chars
// (packages/core/src/schemas/common.schema.ts) - real DIAN prefixes like
// "SETP"/"SETT" match this. Case isn't actually constrained anywhere in
// dian-kit or itcycle-api-dian's admin API (both just take a bare string),
// so this only checks length/charset, matching the frontend's rule exactly.
const PREFIX_RE = /^[A-Za-z0-9]{1,4}$/;

export const isValidNit = (value) => NIT_RE.test(`${value || ""}`.trim());
export const isValidSoftwareId = (value) => UUID_RE.test(`${value || ""}`.trim());
export const isValidTechnicalKey = (value) => TECHNICAL_KEY_RE.test(`${value || ""}`.trim());
export const isValidPrefix = (value) => PREFIX_RE.test(`${value || ""}`.trim());

export const isValidNumberingRange = (startNumber, endNumber) =>
    Number.isInteger(startNumber) && Number.isInteger(endNumber) && startNumber > 0 && endNumber > startNumber;

export const isValidDateRange = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
};
