import { ApiError } from "../utils/ApiError.js";
import { localizeErrorMessage } from "../utils/localizeErrorMessage.js";

const errorHandler = (err, req, res, next) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: localizeErrorMessage(err.message, req),
            errors: err.errors || [],
            ...(err.code ? { code: err.code } : {}),
        });
    }

    console.error("Unhandled Error:", err);
    res.status(500).json({
        success: false,
        message: localizeErrorMessage("Internal Server Error", req),
    });
};

export default errorHandler;
