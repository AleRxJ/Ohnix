import ES_MESSAGES from "./errorMessages.es.js";
import { ApiResponse } from "./ApiResponse.js";

// ApiError messages are written in English (dev-facing: logs, Postman, the
// standalone DIAN API's own clients), but ~200 frontend call sites toast
// `error.response.data.message` verbatim - so a Spanish user saw things like
// "A reason is required to adjust stock". Rather than give every one of the
// ~1,700 throw sites its own `code` + frontend key, the error middleware
// translates the final message here when the request asks for Spanish
// (the frontend sends Accept-Language from the app's chosen language, see
// Frontend/src/api/api.js). A message with no entry is returned unchanged.
//
// errorMessages.es.js keys are the English messages exactly as written at
// the throw site; template literals keep their `${...}` placeholders, which
// are matched as wildcards and carried into the Spanish text by name.

const exact = new Map();
const patterns = [];

const PLACEHOLDER = /\$\{([^}]+)\}/g;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const [english, spanish] of Object.entries(ES_MESSAGES)) {
    if (!english.includes("${")) {
        exact.set(english, spanish);
        continue;
    }
    const names = [];
    let source = "";
    let last = 0;
    for (const match of english.matchAll(PLACEHOLDER)) {
        source += escapeRegExp(english.slice(last, match.index)) + "([\\s\\S]*?)";
        names.push(match[1]);
        last = match.index + match[0].length;
    }
    source += escapeRegExp(english.slice(last));
    patterns.push({
        regex: new RegExp(`^${source}$`),
        names,
        spanish,
        // Most literal text first, so "Product ${x} not found" can't be
        // swallowed by a looser "${x} not found".
        literalLength: english.replace(PLACEHOLDER, "").length,
    });
}
patterns.sort((a, b) => b.literalLength - a.literalLength);

export const wantsSpanish = (req) => {
    const header = String(req?.headers?.["accept-language"] || "").trim().toLowerCase();
    return header.startsWith("es");
};

export const translateErrorMessageToSpanish = (message) => {
    if (typeof message !== "string" || !message) return message;
    const direct = exact.get(message);
    if (direct) return direct;
    for (const { regex, names, spanish } of patterns) {
        const match = message.match(regex);
        if (!match) continue;
        const values = new Map(names.map((name, i) => [name, match[i + 1]]));
        return spanish.replace(PLACEHOLDER, (whole, name) => (values.has(name) ? values.get(name) : whole));
    }
    return message;
};

export const localizeErrorMessage = (message, req) =>
    wantsSpanish(req) ? translateErrorMessageToSpanish(message) : message;

// Express middleware: same translation for ApiResponse bodies (success
// toasts like "Cancellation undone." are shown verbatim as well). Only
// touches ApiResponse instances, so webhooks/raw JSON pass through as-is.
export const localizeApiResponseMessages = (req, res, next) => {
    if (!wantsSpanish(req)) return next();
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (body instanceof ApiResponse && typeof body.message === "string") {
            body.message = translateErrorMessageToSpanish(body.message);
        }
        return originalJson(body);
    };
    next();
};
