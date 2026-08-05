import crypto from "crypto";

const KEY_NAMESPACE = "ohx";

// The raw key is only ever shown once, at creation time. We persist a
// SHA-256 hash plus a short plaintext prefix (so the user can tell keys
// apart in the UI without the full secret ever touching the database).
export const generateApiKey = () => {
    const prefix = crypto.randomBytes(4).toString("hex");
    const secret = crypto.randomBytes(24).toString("hex");
    const keyPrefix = `${KEY_NAMESPACE}_${prefix}`;
    const fullKey = `${keyPrefix}_${secret}`;
    const keyHash = hashApiKey(fullKey);

    return { fullKey, keyPrefix, keyHash };
};

export const hashApiKey = (rawKey) =>
    crypto.createHash("sha256").update(rawKey).digest("hex");
