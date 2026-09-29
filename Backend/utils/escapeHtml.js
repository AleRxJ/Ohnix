// For user-supplied text interpolated into HTML emails.
export const escapeHtml = (value) =>
    `${value ?? ""}`.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));
