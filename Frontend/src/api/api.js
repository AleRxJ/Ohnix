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

// The browser's 'offline' event (what connectivity.js primarily relies on)
// doesn't fire reliably in every environment - VPNs, multiple network
// adapters, some Windows network stacks can leave navigator.onLine reporting
// true while every real request fails. A request that fails with no
// `response` at all (DNS/connection failure, not a server error status) is a
// much stronger, immediate signal - feed it back so connectivity state
// self-corrects without waiting on that event.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (!error.response) {
            reportNetworkFailure();
        }
        return Promise.reject(error);
    }
);
