import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit, standard for GCM
const KEY_LENGTH = 32; // AES-256

// AES-256-GCM at rest for secrets Ohnix must be able to decrypt later (e.g.
// Company.itcycleApiKeyCiphertext) - unlike password hashing (one-way, see
// apiKey.js), these need to come back out in plaintext to authenticate an
// outbound call. Same scheme as itcycle-api-dian's own
// EncryptedFileCertificateSecretStore, re-implemented here rather than
// shared across repos - SECRET_ENCRYPTION_KEY must be 32 raw bytes,
// base64url-encoded, and is a completely separate key from anything in
// itcycle-api-dian's own .env.
const getMasterKey = () => {
    const raw = process.env.SECRET_ENCRYPTION_KEY || "";
    const key = Buffer.from(raw, "base64url");
    if (key.length !== KEY_LENGTH) {
        throw new Error(
            `SECRET_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${key.length}). ` +
                "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
        );
    }
    return key;
};

// Layout: base64url([12-byte IV][16-byte auth tag][ciphertext]) - a single
// string column can hold this, no separate columns needed for iv/tag.
export const encryptSecret = (plaintext) => {
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
};

export const decryptSecret = (encoded) => {
    const key = getMasterKey();
    const payload = Buffer.from(encoded, "base64url");
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = payload.subarray(IV_LENGTH + 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
};
