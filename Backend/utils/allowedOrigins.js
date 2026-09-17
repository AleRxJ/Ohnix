// Shared by app.js (Express CORS) and live/socketServer.js (Socket.IO CORS)
// so a WebSocket connection is never allowed from an origin the REST API
// would reject, and vice versa - keeping the two in sync by hand would
// eventually drift.
const normalizeOrigin = (value) => value?.trim().replace(/\/$/, "");

const configuredOrigins = [
    process.env.FRONTEND_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(",") || []),
]
    .map(normalizeOrigin)
    .filter(Boolean);

// No wildcard *.vercel.app here on purpose: with credentials:true, that
// would let anyone who deploys a free Vercel project make authenticated
// cross-site requests using a victim's session cookies. Add specific
// preview-deployment URLs to ALLOWED_ORIGINS (comma-separated) if needed
// instead of wildcarding the whole domain.
const defaultOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://ohnix.co",
    "https://ohnix.co",
    "https://ohnix.vercel.app",
];

const allowedOrigins = [...new Set([...configuredOrigins, ...defaultOrigins])];

const wildcardToRegex = (pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
};

const allowedOriginMatchers = allowedOrigins
    .filter((origin) => origin.includes("*"))
    .map(wildcardToRegex);

const allowedOriginList = allowedOrigins.filter((origin) => !origin.includes("*"));

export const isOriginAllowed = (origin) => {
    // Allow non-browser requests (Postman, mobile apps, server-to-server).
    if (!origin) return true;

    const normalizedOrigin = normalizeOrigin(origin);
    const isAllowedByList = allowedOriginList.includes(normalizedOrigin);
    const isAllowedByPattern = allowedOriginMatchers.some((matcher) => matcher.test(normalizedOrigin));

    return isAllowedByList || isAllowedByPattern;
};
