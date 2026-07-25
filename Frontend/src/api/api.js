import axios from "axios";

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

export const api = axios.create({
    baseURL: normalizedBackendUrl,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});
