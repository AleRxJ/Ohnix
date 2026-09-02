import { api } from "../api/api.js";

// `navigator.onLine` only reflects whether the OS network interface is up -
// a captive portal, a VPN that's stalled, or a backend that's simply down
// all report `true` there while every real request fails. This module treats
// it as a hint that something changed (worth re-checking now), never as the
// verdict itself. The verdict always comes from actually reaching the API.
//
// A lightweight, already-authenticated endpoint doubles as the reachability
// probe - a 401/403 response still proves the network path to the server
// works (the server answered), so only a network-level failure (no response
// at all, or a timeout) counts as "offline".
const PROBE_PATH = "/users/current-user";
const POLL_WHILE_OFFLINE_MS = 20000;
const PROBE_TIMEOUT_MS = 8000;

let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
let checking = false;
let pollTimer = null;
const listeners = new Set();

function notify() {
    for (const listener of listeners) listener(isOnline);
}

function setOnline(next) {
    if (next === isOnline) return;
    isOnline = next;
    notify();
}

async function probeReachability() {
    try {
        await api.get(PROBE_PATH, { timeout: PROBE_TIMEOUT_MS });
        return true;
    } catch (error) {
        // The server answered (even with an error status) - the network path
        // is up, whatever failed is a different concern (auth, 500, ...).
        if (error?.response) return true;
        return false;
    }
}

function schedulePollWhileOffline() {
    clearTimeout(pollTimer);
    if (isOnline) return;
    pollTimer = setTimeout(async () => {
        await checkNow();
        schedulePollWhileOffline();
    }, POLL_WHILE_OFFLINE_MS);
}

// Confirms real reachability rather than trusting the caller. Safe to call
// repeatedly - concurrent calls share the in-flight check.
export async function checkNow() {
    if (checking) return isOnline;
    checking = true;
    try {
        const reachable = await probeReachability();
        setOnline(reachable);
        return reachable;
    } finally {
        checking = false;
    }
}

export function getConnectivityState() {
    return isOnline;
}

// Returns an unsubscribe function. The callback fires only on an actual
// online<->offline transition, already-confirmed via a real request.
export function subscribeConnectivity(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

let initialized = false;
export function initConnectivityWatcher() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    window.addEventListener("online", () => {
        checkNow();
    });
    window.addEventListener("offline", () => {
        setOnline(false);
        schedulePollWhileOffline();
    });

    checkNow().then(() => {
        if (!isOnline) schedulePollWhileOffline();
    });
}
