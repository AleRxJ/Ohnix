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
    if (isOnline) {
        clearTimeout(pollTimer);
    } else {
        schedulePollWhileOffline();
    }
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
    });

    // setOnline() only schedules the offline poll on a *transition* to
    // offline - if the app boots already offline (isOnline's initial value,
    // read from navigator.onLine, is already false), checkNow() below
    // resolves to the same value and setOnline() sees no transition. Cover
    // that boot-time case explicitly.
    checkNow().then(() => {
        if (!isOnline) schedulePollWhileOffline();
    });
}

// Called by api.js's response interceptor whenever a request fails at the
// network level (no response reached at all - DNS/connection failure,
// timeout), regardless of whether the browser's own 'offline' event fired.
// That event is not reliable in every environment (VPNs, multiple network
// adapters, some Windows network stacks) - a real failed request is a much
// stronger signal than navigator.onLine, so use it to re-verify reachability
// right away instead of waiting on an event that might never come.
export function reportNetworkFailure() {
    if (!isOnline) return; // already known offline, nothing new to learn
    checkNow();
}
