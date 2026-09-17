import axios from "axios";
import { reportNetworkFailure } from "../offline/connectivity.js";

const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();

// Keep local development pointing at the local backend when env is absent,
// but use the hosted backend in production to avoid mobile clients resolving /api/v1 on Vercel.
const backendBaseUrl = configuredBackendUrl
    ? configuredBackendUrl
        : import.meta.env.DEV
            ? "http://localhost:3001"
            : "https://ohnix.onrender.com";

const normalizedBackendUrl = backendBaseUrl.endsWith("/api/v1")
    ? backendBaseUrl
    : `${backendBaseUrl.replace(/\/$/, "")}/api/v1`;

// Exposed for live/socketClient.js - Socket.IO connects to the server root
// (with its own `path`), not the /api/v1 REST prefix.
export const backendRootUrl = normalizedBackendUrl.replace(/\/api\/v1$/, "");

export const api = axios.create({
    baseURL: normalizedBackendUrl,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
    // No default timeout meant a stalled backend request (SMTP hang, Render
    // cold start, dropped connection) left the UI spinning forever with no
    // error and no way to retry. 30s comfortably covers a cold start and
    // normal requests; calls expected to run longer (large exports) can
    // still override this per-request via the axios config argument.
    timeout: 30000,
});

// A request that fails with a real 401 almost always means the accessToken
// (1-day lifetime, Backend/utils/authTokens.js) simply expired mid-session -
// not that the session itself is over (the refresh token behind it lives 10
// days). Previously nothing refreshed it: every action just kept failing
// with 401 until something else happened to re-run AuthContext's own check
// (a reload, or reconnecting after being offline) - a user active past the
// 24h mark saw random failures with no explanation and no recovery short of
// refreshing the page. POST /users/refresh-token already existed
// server-side for exactly this but the frontend never called it.
const NO_REFRESH_RETRY_PATHS = ["/users/login", "/users/refresh-token", "/users/logout"];

// Concurrent 401s (several requests in flight right when the token expires)
// share one in-flight refresh instead of each triggering its own - the
// refresh token is single-use (user.controller.js#refreshAccessToken
// rotates it on every call), so two parallel refresh attempts would make the
// second fail as "expired or used" purely from the race, not a real problem.
let refreshPromise = null;

async function refreshAccessToken() {
    // A bare axios call, not the shared `api` instance - this must never be
    // able to recurse back into this same interceptor. withCredentials so
    // the httpOnly refreshToken cookie (the actual source of truth server-
    // side) rides along automatically; nothing readable in JS needs passing.
    const response = await axios.post(
        `${normalizedBackendUrl}/users/refresh-token`,
        {},
        { withCredentials: true }
    );
    const newAccessToken = response?.data?.data?.accessToken;
    if (!newAccessToken) throw new Error("Refresh response had no accessToken");
    localStorage.setItem("accessToken", newAccessToken);
    api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
    return newAccessToken;
}

const hasStoredSession = () => {
    try {
        return Boolean(localStorage.getItem("accessToken"));
    } catch {
        return false;
    }
};

// The browser's 'offline' event (what connectivity.js primarily relies on)
// doesn't fire reliably in every environment - VPNs, multiple network
// adapters, some Windows network stacks can leave navigator.onLine reporting
// true while every real request fails. A request that fails with no
// `response` at all (DNS/connection failure, not a server error status) is a
// much stronger, immediate signal - feed it back so connectivity state
// self-corrects without waiting on that event.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (!error.response) {
            reportNetworkFailure();
            return Promise.reject(error);
        }

        const originalRequest = error.config;
        const isExemptPath = NO_REFRESH_RETRY_PATHS.some((path) => originalRequest?.url?.includes(path));

        // Only worth attempting if the app believed it had a session in the
        // first place - a stray 401 from a visitor who was never logged in
        // (e.g. a marketing page's optional check) isn't a session expiring,
        // and refreshing/dispatching the "session expired" event for that
        // case would just be confusing noise on a page with no session to
        // lose. `_retriedAfterRefresh` caps this at one attempt per request
        // so a refresh that itself doesn't fix things can't loop forever.
        if (
            error.response.status === 401 &&
            originalRequest &&
            !originalRequest._retriedAfterRefresh &&
            !isExemptPath &&
            hasStoredSession()
        ) {
            originalRequest._retriedAfterRefresh = true;
            try {
                refreshPromise ??= refreshAccessToken().finally(() => {
                    refreshPromise = null;
                });
                const newAccessToken = await refreshPromise;
                originalRequest.headers = {
                    ...originalRequest.headers,
                    Authorization: `Bearer ${newAccessToken}`,
                };
                return api.request(originalRequest);
            } catch {
                // The refresh token is gone or invalid too - a real, permanent
                // end of session, not a network blip (that path already
                // returned above). AuthContext only re-checks this reactively
                // on mount or reconnect otherwise, so nothing would tell it
                // to stop believing it's logged in until one of those
                // happened to run - this event is that signal, immediately.
                window.dispatchEvent(new Event("ohnix:session-expired"));
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    }
);
