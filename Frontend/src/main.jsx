// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n/config.js";
import App from "./App.jsx";
import AppErrorBoundary from "./components/error/AppErrorBoundary.jsx";
import { loadGoogleAdsTag } from "./utils/googleAds.js";
import { loadMetaPixel } from "./utils/metaPixel.js";

loadGoogleAdsTag();
loadMetaPixel();

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

createRoot(document.getElementById("root")).render(
    <AppErrorBoundary>
        <App />
    </AppErrorBoundary>
);
