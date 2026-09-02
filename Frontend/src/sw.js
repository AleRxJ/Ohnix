import { precache, addPlugins, addRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

// Routes that are NOT part of the authenticated app shell (marketing site,
// auth pages, public token-based pages) - the service worker must never
// serve the SPA shell as a navigation fallback for these. They either have
// their own prerendered HTML or no offline requirement at all, and the
// wrong shell would be worse than the browser's normal "you're offline"
// error.
const NON_APP_NAVIGATION_PATTERNS = [
    /^\/$/,
    /^\/precios/,
    /^\/blog/,
    /^\/software-inventario-pymes/,
    /^\/facturacion-electronica-dian/,
    /^\/comparativa\//,
    /^\/colaboracion-en-equipo/,
    /^\/integraciones$/,
    /^\/demo/,
    /^\/login/,
    /^\/signup/,
    /^\/reset-password/,
    /^\/email-verify/,
    /^\/team\/invite\//,
    /^\/public\//,
];

// Extension -> substring expected in that asset's Content-Type. Precaching
// trusts each manifest URL blindly by default (it only checks for HTTP
// status 200) - if the origin ever answers a missing hashed asset with a
// fake "200 OK" HTML page instead of a real 404 (exactly what vercel.json's
// SPA catch-all rewrite used to do for any unmatched /assets/* request
// before it was scoped to exclude assets), that HTML gets permanently
// cached under the CSS/JS URL and is served to every future visitor from
// then on, with no error and no way to self-heal short of clearing the
// Service Worker. Rejecting a mismatched content-type here means a bad
// response is never cached at all - the browser just falls back to a normal
// (retriable) network failure instead of a permanently poisoned cache.
const EXPECTED_CONTENT_TYPE = {
    css: "text/css",
    js: "javascript", // covers both text/javascript and application/javascript
};

addPlugins([
    {
        cacheWillUpdate: async ({ request, response }) => {
            if (!response.ok) return null;
            const ext = request.url.split(/[?#]/)[0].split(".").pop();
            const expected = EXPECTED_CONTENT_TYPE[ext];
            if (!expected) return response;
            const contentType = response.headers.get("content-type") || "";
            return contentType.includes(expected) ? response : null;
        },
    },
]);
precache(self.__WB_MANIFEST);
addRoute();

cleanupOutdatedCaches();

registerRoute(
    new NavigationRoute(createHandlerBoundToURL("/index.html"), {
        denylist: NON_APP_NAVIGATION_PATTERNS,
    })
);

// registerType: 'autoUpdate' (vite.config.js) makes the client-side
// registration (virtual:pwa-register) post this message as soon as it finds
// a waiting worker, instead of prompting the user - mirrors what
// vite-plugin-pwa's own generateSW output does.
self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});
