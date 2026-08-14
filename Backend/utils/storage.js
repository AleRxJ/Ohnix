import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const isPlaceholder = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return !normalized || normalized === "change_me";
};

const isR2Configured = () =>
    !isPlaceholder(process.env.R2_ACCOUNT_ID) &&
    !isPlaceholder(process.env.R2_ACCESS_KEY_ID) &&
    !isPlaceholder(process.env.R2_SECRET_ACCESS_KEY) &&
    !isPlaceholder(process.env.R2_BUCKET_NAME) &&
    !isPlaceholder(process.env.R2_PUBLIC_URL);

let cachedClient = null;
const getClient = () => {
    if (!cachedClient) {
        cachedClient = new S3Client({
            region: "auto",
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            },
        });
    }
    return cachedClient;
};

// Every tenant's uploads used to land in the same flat bucket path with a
// key derived straight from the browser-supplied filename - two different
// accounts uploading a "photo.jpg" or "IMG_0001.jpg" (extremely common
// default camera/phone names) would collide on the same key and silently
// overwrite one account's image with the other's. `ownerId`/`entity` scope
// the key to a per-tenant, per-record-type path, and the timestamp+random
// suffix guarantees the key itself is never reused even within that scope.
const buildKey = (ownerId, entity, originalName) => {
    const ext = path.extname(originalName || "");
    const base = path
        .basename(originalName || "file", ext)
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 40);
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const parts = ["uploads"];
    if (ownerId) parts.push(String(ownerId));
    if (entity) parts.push(entity);
    parts.push(`${unique}-${base}${ext}`);
    return parts.join("/");
};

const putObject = async (buffer, key, contentType) => {
    const client = getClient();
    await client.send(
        new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType || undefined,
        })
    );
    const base = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
    return `${base}/${key}`;
};

const toPublicUrlFromLocalPath = (localFilePath) => {
    const normalizedPath = path.normalize(localFilePath);
    const publicSegment = `${path.sep}public${path.sep}`;
    const publicIndex = normalizedPath.lastIndexOf(publicSegment);

    if (publicIndex === -1) {
        return null;
    }

    const relativePath = normalizedPath
        .slice(publicIndex + publicSegment.length)
        .split(path.sep)
        .join("/");

    return `/${relativePath}`;
};

// Function to upload buffer directly to R2 (for production/memory storage)
const uploadBufferToR2 = async (buffer, filename, ownerId, entity, contentType) => {
    try {
        if (!buffer) return null;

        if (!isR2Configured()) {
            console.error(
                "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_URL."
            );
            return null;
        }

        const key = buildKey(ownerId, entity, filename);
        const url = await putObject(buffer, key, contentType);
        return { url, provider: "r2" };
    } catch (error) {
        console.error("R2 Upload Error:", error);
        return null;
    }
};

// Original function for local development (when files are saved to disk)
const uploadOnR2 = async (localFilePath, ownerId, entity, contentType) => {
    try {
        if (!localFilePath) return null;

        if (!fs.existsSync(localFilePath)) {
            console.error(`File not found: ${localFilePath}`);
            return null;
        }

        if (!isR2Configured()) {
            if (process.env.NODE_ENV === "production") {
                console.error(
                    "R2 storage is not configured in production. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_URL."
                );
                return null;
            }

            const localUrl = toPublicUrlFromLocalPath(localFilePath);
            if (!localUrl) {
                return null;
            }

            return {
                url: localUrl,
                provider: "local",
            };
        }

        const key = buildKey(ownerId, entity, path.basename(localFilePath));
        const buffer = fs.readFileSync(localFilePath);
        const url = await putObject(buffer, key, contentType);

        fs.unlinkSync(localFilePath);
        return { url, provider: "r2" };
    } catch (error) {
        console.error("R2 Upload Error:", error);
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return null;
    }
};

// Function that works in both local (disk storage) and production (memory
// storage) environments. `ownerId` scopes the upload to a tenant-specific
// path (the account's createdById/companyId) and `entity` further splits it
// by record type (products, customers, suppliers, branding, avatars) so
// different accounts' images never share a path or a filename.
const uploadFile = async (file, { ownerId, entity } = {}) => {
    try {
        if (!file) return null;

        // If file has buffer property (multer memory storage), use buffer upload
        if (file.buffer) {
            return await uploadBufferToR2(file.buffer, file.originalname, ownerId, entity, file.mimetype);
        }

        // If file has path property (multer disk storage), use file upload
        if (file.path) {
            return await uploadOnR2(file.path, ownerId, entity, file.mimetype);
        }

        // If it's just a file path string
        if (typeof file === "string") {
            return await uploadOnR2(file, ownerId, entity);
        }

        throw new Error("Invalid file format provided");
    } catch (error) {
        console.error("Upload to R2 failed:", error);
        return null;
    }
};

// Deletes a previously-uploaded object given the public URL stored on the
// record (Product.productImage, Customer.photo, Supplier.photo,
// Company.logoUrl, User.avatar). Only acts on URLs that actually point at
// our own R2 bucket - this is what safely no-ops on the default placeholder
// filenames ("default-product.png" etc, which aren't URLs at all), on
// User.avatar's generated ui-avatars.com fallback, and on the local dev
// fallback's "/temp/..." paths, without needing to special-case any of
// those individually.
const deleteFile = async (url) => {
    try {
        if (!url || !isR2Configured()) return false;

        const base = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
        if (!url.startsWith(`${base}/`)) return false;

        const key = url.slice(base.length + 1);
        if (!key) return false;

        const client = getClient();
        await client.send(
            new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: key,
            })
        );
        return true;
    } catch (error) {
        console.error("R2 Delete Error:", error);
        return false;
    }
};

export { uploadOnR2, uploadBufferToR2, uploadFile, deleteFile };
