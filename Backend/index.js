import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";

dotenv.config({
    path: "./.env",
});

let dbConnectPromise;

const ensureDatabaseConnection = async () => {
    if (!dbConnectPromise) {
        dbConnectPromise = connectDB().catch((error) => {
            dbConnectPromise = null;
            throw error;
        });
    }

    return dbConnectPromise;
};

export default async function handler(req, res) {
    try {
        await ensureDatabaseConnection();
        return app(req, res);
    } catch (error) {
        console.error("❎ Database initialization failed", error);
        return res.status(500).json({
            message: "Database connection failed",
            success: false,
        });
    }
}
