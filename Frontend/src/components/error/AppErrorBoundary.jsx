import React from "react";

// Deliberately NOT lazy-loaded (unlike ErrorPage.jsx) and uses no antd - if
// this is rendering, it's often because a chunk failed to load in the first
// place, so the fallback UI can't depend on any other dynamic import
// succeeding. Plain HTML + Tailwind only (Tailwind's compiled CSS is a
// static <link> in index.html, not a JS chunk, so it's unaffected).
const CHUNK_ERROR_PATTERN =
    /Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module/i;

const RELOAD_GUARD_KEY = "ohnix:chunk-reload";

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("[AppErrorBoundary] Uncaught error:", error, errorInfo);

        // A production deploy replaces old hashed chunk files - a tab left
        // open since before the deploy (or main.jsx's own vite:preloadError
        // listener missing this particular failure shape) can throw this as
        // a plain render-time error instead. The fix is the same either
        // way: reload once to fetch the current index.html/asset manifest.
        // Session-guarded so a genuinely broken deploy doesn't reload
        // forever - after one failed attempt it falls through to the
        // manual "reload" button below instead.
        const message = `${error?.message || ""}`;
        if (CHUNK_ERROR_PATTERN.test(message) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
            sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
            window.location.reload();
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 flex items-center justify-center bg-[#050505] px-6 text-center">
                    <div className="max-w-sm">
                        <h1 className="mb-2 text-lg font-semibold text-white">
                            Hubo un problema al cargar la página
                        </h1>
                        <p className="mb-5 text-sm text-[#a9b3b8]">
                            Puede que haya una nueva versión de Ohnix disponible. Recarga la página para
                            continuar.
                        </p>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="rounded-lg border-0 bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] px-6 py-2.5 text-sm font-semibold text-[#021314]"
                        >
                            Recargar
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
