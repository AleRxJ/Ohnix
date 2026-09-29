import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadTempDir = path.resolve(__dirname, "../public/temp");

const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            fs.mkdirSync(uploadTempDir, { recursive: true });
            cb(null, uploadTempDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        cb(
            null,
            file.fieldname + "-" + Date.now() + path.extname(file.originalname)
        );
    },
});

const storage =
    process.env.NODE_ENV === "production" ? memoryStorage : diskStorage;

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed!"), false);
        }
    },
});

// Accepts either a plain CSV, or a ZIP bundling the CSV together with the
// product images it references (see product.bulk.controller.js) - the size
// cap is higher than a bare CSV needs because a ZIP of a few dozen product
// photos is legitimately much bigger.
export const bulkUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024,
    },
    fileFilter: function (req, file, cb) {
        const name = file.originalname.toLowerCase();
        const isCSV =
            file.mimetype === "text/csv" ||
            file.mimetype === "application/csv" ||
            file.mimetype === "application/vnd.ms-excel" ||
            name.endsWith(".csv");
        const isZip =
            file.mimetype === "application/zip" ||
            file.mimetype === "application/x-zip-compressed" ||
            name.endsWith(".zip");

        if (isCSV || isZip) {
            cb(null, true);
        } else {
            cb(new Error("Only CSV or ZIP files are allowed for bulk upload"), false);
        }
    },
});

// A demo prospect's own product list (/agenda-demo). Memory-only on purpose:
// the bytes go straight into demo_requests.catalog_file_data and must never
// land on disk or in R2 (public URLs) - see the DemoRequest schema comment.
export const demoCatalogUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter: function (req, file, cb) {
        const name = file.originalname.toLowerCase();
        if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
            cb(null, true);
        } else {
            cb(new Error("Only Excel (.xlsx, .xls) or CSV files are allowed"), false);
        }
    },
});
