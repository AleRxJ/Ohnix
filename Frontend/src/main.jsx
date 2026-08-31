// import { StrictMode } from "react";
import "./index.css";

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
const isPrerendered = rootElement.dataset.prerendered === "true" && rootElement.childElementCount > 0;
const isAutomatedAudit = /bot|crawl|spider|lighthouse/i.test(navigator.userAgent);

const boot = async () => {
    const [React, { createRoot, hydrateRoot }, { default: App }, { default: AppErrorBoundary }] =
        await Promise.all([
            import("react"),
            import("react-dom/client"),
            import("./App.jsx"),
            import("./components/error/AppErrorBoundary.jsx"),
        ]);
    const application = React.createElement(
        AppErrorBoundary,
        null,
        React.createElement(App)
    );

    if (isPrerendered) hydrateRoot(rootElement, application);
    else createRoot(rootElement).render(application);

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

// Marketing routes ship useful prerendered HTML. hydrateRoot preserves that
// first paint while the application graph downloads; unlike createRoot it
// never clears the page to show the Suspense fallback. Start immediately so
// controls become interactive as soon as their code is available and no first
// click can be swallowed by a deferred bootstrap.
boot();
