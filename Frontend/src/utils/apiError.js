// The backend sends English dev-facing text in `message` (useful for logs/
// Postman) plus a machine-readable `code` for messages the UI must show
// translated - see Backend/utils/prismaErrors.js and the `code` param on
// ApiError. Look up the code first; only fall back to the raw backend
// message (or the caller's default) when there's no translated mapping for it.
export const resolveApiErrorMessage = (error, t, codeMessages, fallbackKey) => {
    const code = error?.response?.data?.code;
    if (code && codeMessages?.[code]) {
        return t(codeMessages[code]);
    }
    return error?.response?.data?.message || t(fallbackKey);
};
