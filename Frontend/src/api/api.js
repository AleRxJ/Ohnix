import axios from "axios";

const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || "";
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
