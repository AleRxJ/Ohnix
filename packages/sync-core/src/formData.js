// FormData isn't structured-cloneable as-is, but its entries (strings and
// File/Blob objects) are - IndexedDB stores File/Blob natively (and a future
// SQLite adapter would serialize the blob itself, same idea). Serializing to
// a plain [key, value][] array here (instead of storing the FormData object
// itself) is what lets an offline-queued multipart mutation - e.g. editing a
// product with a new photo attached - survive a reload and still replay
// correctly once the connection comes back.
export function formDataToEntries(formData) {
    return Array.from(formData.entries());
}

export function entriesToFormData(entries) {
    const formData = new FormData();
    for (const [key, value] of entries) formData.append(key, value);
    return formData;
}

export function isFormData(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
}
