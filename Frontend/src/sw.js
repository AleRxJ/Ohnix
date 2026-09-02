import { precache, addPlugins, addRoute, cleanupOutdatedCaches } from "workbox-precaching";

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

// No navigation-fallback route (previously createHandlerBoundToURL bound to
// "/index.html", i.e. the marketing homepage - wrong shell for an offline
// visitor on an authenticated route, and the actual cause of the hydration
// mismatch this file was rewritten to fix: a stale precached copy of "/"
// getting hydrated against a newer JS bundle after a deploy). The correct
// target is app.html (the real SPA shell), but it doesn't exist yet at the
// point this precache manifest is generated - prerender.js creates it by
// copying dist/index.html *after* `vite build` (and this plugin's manifest)
// already ran, so createHandlerBoundToURL("/app.html") would find no match
// and throw at SW startup, breaking the worker entirely. Needs the build
// order fixed (e.g. emit app.html as its own Vite entry point instead of a
// post-build copy) before this can be reintroduced safely.

// registerType: 'autoUpdate' (vite.config.js) makes the client-side
// registration (virtual:pwa-register) post this message as soon as it finds
// a waiting worker, instead of prompting the user - mirrors what
// vite-plugin-pwa's own generateSW output does. main.jsx's lightweight,
// registration-only update check (it never calls register() itself - see
// its comment) posts the same message for tabs that never load the
// PWA-registration bundle at all (every marketing page).
self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

// Take control of every already-open tab the moment this worker activates,
// instead of only new navigations from here on. Without this, a tab open
// from before the update - which is exactly the tab a returning visitor is
// most likely reloading - keeps talking to the OLD worker (and its stale
// precache) until it's closed and reopened, even after the new one has
// fully installed and skipped waiting.
self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});
