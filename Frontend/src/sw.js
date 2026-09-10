import { precache, addPlugins, addRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

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

// Navigation fallback, now safe to reintroduce: app.html is a real Vite
// build entry (vite.config.js rollupOptions.input), so it's actually in the
// precache manifest by the time this file is built - createHandlerBoundToURL
// below resolves instead of throwing at SW startup.
//
// This is NOT the same mistake as before (binding to "/index.html", the
// marketing homepage). That broke because index.html is prerendered *static
// content* that gets hydrateRoot()'d against whatever JS bundle happens to
// be current - a stale cached copy served as a fallback for an unrelated
// route mismatched against a newer bundle and crashed the hydrate. app.html
// has no prerendered content at all (plain `<div id="root">`, see its own
// comment) - main.jsx always does a fresh createRoot().render() for it,
// never hydrateRoot(), so there is no hydration-mismatch class of bug here:
// whichever JS this worker has active is exactly what app.html's own
// precache entry was built alongside, and React Router renders whatever the
// real URL is once it boots, regardless of which shell file served it.
//
// The denylist mirrors workbox's own generateSW default: don't fall back to
// the app shell for a navigation that looks like a direct request for a
// file (has a dot in the last path segment) - e.g. a mistyped asset URL
// should still 404 normally instead of silently returning HTML.
registerRoute(
    new NavigationRoute(createHandlerBoundToURL("/app.html"), {
        denylist: [/\/[^/?]+\.[^/]+$/],
    })
);

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
