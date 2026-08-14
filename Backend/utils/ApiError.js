class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        stack = "",
        code = undefined
    ) {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.message = message;
        this.success = false;
        this.errors = errors;
        // Machine-readable identifier for messages the frontend needs to
        // translate itself instead of showing verbatim - `message` here is
        // only an English dev-facing fallback (e.g. for logs, Postman).
        this.code = code;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export { ApiError };
