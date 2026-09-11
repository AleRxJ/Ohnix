// Which shell is loading this same web app right now - Desktop (Tauri) and
// Mobile (Expo's WebView) both run this exact bundle unmodified, so this has
// to be detected at runtime rather than picked at build time.
//
// Deliberately not derived from navigator.userAgent: rewriting/appending to
// the UA to mark it risks tripping fraud heuristics on the payment gateway
// embedded in the app (epayco) for a signal that's purely informational -
// see Backend/utils/sessionStore.js. Desktop is detected via
// window.__TAURI_INTERNALS__, the IPC bridge global Tauri always injects
// into every page it loads (independent of the app ever calling
// @tauri-apps/api - Ohnix's Desktop shell doesn't). Mobile is detected via
// window.__OHNIX_MOBILE__, a flag Mobile/app/index.js's WebView injects
// before the page loads (injectedJavaScriptBeforeContentLoaded) - there's no
// equivalent automatic global for react-native-webview.
export function getClientPlatform() {
    if (typeof window === "undefined") return "web";
    if (window.__OHNIX_MOBILE__) return "mobile";
    if (window.__TAURI_INTERNALS__) return "desktop";
    return "web";
}
