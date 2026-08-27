import crypto from "crypto";

// HMAC-SHA256 over the exact bytes sent, hex-encoded - the receiver
// recomputes this the same way (docs/api/webhooks.md) and compares with a
// timing-safe check, same posture as Shopify's own webhook signing.
export const signWebhookPayload = (secret, rawBody) =>
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

export const verifyWebhookSignature = (secret, rawBody, signatureHex) => {
    if (!signatureHex) return false;
    const expected = Buffer.from(signWebhookPayload(secret, rawBody), "hex");
    let provided;
    try {
        provided = Buffer.from(String(signatureHex), "hex");
    } catch {
        return false;
    }
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
};
