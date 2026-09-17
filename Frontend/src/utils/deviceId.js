const DEVICE_ID_KEY = "ohnix_device_id";

// A stable id for THIS browser/app install, generated once and persisted in
// localStorage (shared as-is on Desktop/Mobile since both are WebViews of
// this same app) - sent at login so the backend's multi-device session list
// (see Backend/utils/sessionStore.js) recognizes "logging in again from the
// same place" and updates one row instead of appending a new "device" every
// time. Falls back to a fresh id on failure (private-browsing storage
// blocks, etc.) - the only cost is that login showing up as its own device
// in the sessions list instead of reusing the previous one.
export function getOrCreateDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    } catch {
        return crypto.randomUUID();
    }
}
