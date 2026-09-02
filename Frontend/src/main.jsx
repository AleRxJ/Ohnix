// import { StrictMode } from "react";

// A production deploy deletes the old build's hashed chunk files (e.g.
// Login-B-Fjz8gK.js) - a tab that's had the app open since before that
// deploy still references those old hashes, and React.lazy()'s dynamic
// import() 404s. Vite fires this event specifically for that case; without
// a handler the rejected import was an uncaught error and the app crashed
// to a blank/black screen instead of just fetching the current version.
// Session-guarded so a genuinely broken deploy doesn't reload forever.
window.addEventListener("vite:preloadError", () => {
    if (!sessionStorage.getItem("ohnix:chunk-reload")) {
        sessionStorage.setItem("ohnix:chunk-reload", "1");
        window.location.reload();
    }
});

const rootElement = document.getElementById("root");
const PUBLIC_PATHS = new Set([
    "/", "/precios", "/demo", "/software-inventario-pymes",
    "/facturacion-electronica-dian", "/comparativa/ohnix-vs-alegra",
    "/colaboracion-en-equipo", "/blog",
]);
const isPublicPath = PUBLIC_PATHS.has(location.pathname) || location.pathname.startsWith("/blog/");
const isPrerendered = isPublicPath
    && rootElement.dataset.prerendered === "true"
    && rootElement.childElementCount > 0;
const isBuildPrerender = new URLSearchParams(location.search).has("ohnix-prerender");
const isAutomatedAudit = /bot|crawl|spider|lighthouse/i.test(navigator.userAgent);
let stylesReady;
if (isPrerendered || isBuildPrerender) {
    stylesReady = import("./marketingStyles.js");
} else {
    stylesReady = import("./appStyles.js");
}
let hydrationPromise;
let hydrated = false;

// Vite's dynamic-import CSS loader (behind `stylesReady` above) resolves as
// soon as it sees a matching <link> already in the document - it does NOT
// wait for that link to actually finish loading. prerender.js pre-injects
// exactly such a <link> into app.html so the browser's preload scanner can
// start fetching it early, which means `stylesReady` above resolves the
// instant that link exists, regardless of whether the (200+ KiB) stylesheet
// it points to has downloaded yet. Without this, React could mount and
// paint the whole tree - including Tailwind's `hidden`/`lg:*` responsive
// classes - before that CSS was actually in effect, e.g. showing both the
// desktop and mobile variants of AuthLayout at once on a slow first load.
const waitForStylesheets = () =>
    Promise.all(
        Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) =>
            link.sheet
                ? null
                : new Promise((resolve) => {
                      link.addEventListener("load", resolve, { once: true });
                      link.addEventListener("error", resolve, { once: true });
                  })
        )
    );

const boot = async () => {
    const [styles, React, { createRoot, hydrateRoot }, { default: App }, { default: AppErrorBoundary }] =
        await Promise.all([
            stylesReady,
            import("react"),
            import("react-dom/client"),
            import("./App.jsx"),
            import("./components/error/AppErrorBoundary.jsx"),
        ]);
    if (!styles.styleMode) throw new Error("Ohnix styles failed to load");
    await waitForStylesheets();
    const application = React.createElement(
        AppErrorBoundary,
        null,
        React.createElement(App)
    );

    if (isPrerendered) hydrateRoot(rootElement, application);
    else createRoot(rootElement).render(application);
    hydrated = true;

    // Analytics should represent people, not crawlers or Lighthouse runs.
    // Avoiding these third-party requests during automated rendering also
    // prevents audit traffic from polluting conversion data.
    if (!isAutomatedAudit) {
        Promise.all([
            import("./utils/googleAds.js").then(({ loadGoogleAdsTag }) => loadGoogleAdsTag()),
            import("./utils/metaPixel.js").then(({ loadMetaPixel }) => loadMetaPixel()),
        ]).catch(() => {});
    }
};

const startBoot = () => {
    hydrationPromise ??= boot();
    return hydrationPromise;
};

if (!isPrerendered) {
    // Development and private/authenticated routes have no static application
    // markup, so they must start exactly as before.
    startBoot();
} else {
    // Public production pages already contain complete prerendered content.
    // Avoid downloading the authenticated app's 800+ KiB vendor graph for a
    // visitor who only reads the landing page. Scrolling, keyboard focus or
    // pointer intent starts hydration early, before a typical interaction.
    ["scroll", "pointerover", "focusin", "touchstart"].forEach((eventName) =>
        addEventListener(eventName, startBoot, { once: true, passive: true })
    );

    // A very fast first click can arrive before the dynamic imports finish.
    // Replay button interactions once React has attached its handlers instead
    // of silently losing that click. Normal anchors keep native navigation and
    // never need to wait for hydration.
    addEventListener("click", (event) => {
        if (hydrated) return;
        const control = event.target.closest?.("button, [role='button']");
        if (!control) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        startBoot().then(() => control.click());
    }, true);

    addEventListener("submit", (event) => {
        if (hydrated) return;
        const form = event.target;
        event.preventDefault();
        event.stopImmediatePropagation();
        startBoot().then(() => form.requestSubmit());
    }, true);
}
