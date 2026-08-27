// Mirrors Backend/utils/dianValidation.util.js - real DIAN credential/format
// checks grounded in Ohnix's own DIAN engine (itcycle-api-dian/dian-engine:
// packages/core/src/schemas/common.schema.ts, docs/guia-inicio-rapido.md,
// docs/technical-reference/dian-xml-specifications.md). Catching the real
// shape here, at setup, means a typo surfaces immediately instead of at the
// first invoice attempt or as an opaque backend error after the whole wizard
// is filled out.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The "clave técnica" DIAN returns from SetTestConfiguration is a 40-char
// lowercase hex token (SHA1 length) - see dian-engine's quickstart example:
// fc8eac422eba16e22ffd8c6f94b3f40a6e38162c
const TECHNICAL_KEY_RE = /^[0-9a-f]{40}$/i;
const NIT_RE = /^\d{6,15}$/;
// dian-kit's own NumberingAuthorizationSchema caps prefix at 4 chars.
const PREFIX_RE = /^[A-Za-z0-9]{1,4}$/;

export const isValidNit = (value) => NIT_RE.test(`${value || ""}`.replace(/\D/g, ""));
// DIAN's software ID and FirmaPass's validation ID are both plain UUIDs.
export const isValidUuid = (value) => UUID_RE.test(`${value || ""}`.trim());
export const isValidSoftwareId = isValidUuid;
export const isValidTechnicalKey = (value) => TECHNICAL_KEY_RE.test(`${value || ""}`.trim());
export const isValidPrefix = (value) => PREFIX_RE.test(`${value || ""}`.trim());
