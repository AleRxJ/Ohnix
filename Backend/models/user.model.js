// model for user for inventory management system
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const DEFAULT_ACCESS_TOKEN_EXPIRY = "1d";
const DEFAULT_REFRESH_TOKEN_EXPIRY = "10d";

const normalizeJwtExpiry = (value, fallback) => {
    const normalized = value?.trim().replace(/^['"]|['"]$/g, "");

    if (!normalized) {
        return fallback;
    }

    if (/^\d+$/.test(normalized) || /^\d+[smhdwy]$/.test(normalized)) {
        return normalized;
    }

    console.warn(
        `Invalid JWT expiry value "${value}". Falling back to "${fallback}".`
    );
    return fallback;
};

const userSchema = mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, "Password is required"],
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        verifyOtp: {
            type: String,
            default: "",
        },
        verifyOtpExpiry: {
            type: Number,
            default: 0,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        resetOtp: {
            type: String,
            default: "",
        },
        resetOtpExpiry: {
            type: Number,
            default: 0,
        },
        avatar: {
            type: String,
            required: true,
        },
        refreshToken: {
            type: String,
        },
    },
    { timestamps: true }
);

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateAccessToken = function () {
    const accessTokenExpiry = normalizeJwtExpiry(
        process.env.ACCESS_TOKEN_EXPIRY,
        DEFAULT_ACCESS_TOKEN_EXPIRY
    );

    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: accessTokenExpiry }
    );
};

userSchema.methods.generateRefreshToken = function () {
    const refreshTokenExpiry = normalizeJwtExpiry(
        process.env.REFRESH_TOKEN_EXPIRY,
        DEFAULT_REFRESH_TOKEN_EXPIRY
    );

    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: refreshTokenExpiry }
    );
};

export const User = mongoose.model("User", userSchema);
