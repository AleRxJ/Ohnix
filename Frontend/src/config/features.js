// Feature flag for DIAN electronic invoicing (Colombia) - controls whether it
// re-appears in the nav, pricing, and marketing pages. Driven by an env var
// instead of a hardcoded value so it can be toggled per environment (local
// .env, Vercel project settings) without a code change/redeploy. Unset (or
// anything other than the literal string "true") defaults to off, so a
// missing variable never accidentally exposes the feature.
export const ELECTRONIC_INVOICING_ENABLED = import.meta.env.VITE_ELECTRONIC_INVOICING_ENABLED === "true";
