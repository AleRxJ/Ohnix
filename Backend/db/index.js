import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { prisma } from "./prisma.js";

let isConnected = false;
let connectedProvider = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const connectDB = async () => {
    // The live app (server.js) always runs with DB_PROVIDER=postgres - Mongo
    // is legacy, kept alive only for the one-off scripts under Backend/scripts/
    // (createSampleData.js, getVerifyOtp.js, markUserVerified.js,
    // migrateMongoToPostgres.js) that still read/write it directly via the
    // Mongoose models in Backend/models/. No controller/service touches
    // Mongo or those models - see the multi-user concurrency audit
    // (2026-08-20), which confirmed Postgres via Prisma is the only source
    // of truth for business data.
    const provider = (process.env.DB_PROVIDER || "mongo").toLowerCase();

    if (isConnected && connectedProvider === provider) {
        console.log(`♻️ Reusing existing ${provider.toUpperCase()} connection`);
        return;
    }

    if (provider === "postgres" || provider === "prisma") {
        const maxRetries = parsePositiveInt(process.env.DB_CONNECT_MAX_RETRIES, 5);
        const retryDelayMs = parsePositiveInt(process.env.DB_CONNECT_RETRY_MS, 2000);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await prisma.$connect();
                isConnected = true;
                connectedProvider = provider;
                console.log("✅ PostgreSQL connected via Prisma");
                return;
            } catch (error) {
                const isLastAttempt = attempt === maxRetries;
                console.error(
                    `❎ PostgreSQL connection FAILED (attempt ${attempt}/${maxRetries})`,
                    error
                );

                if (isLastAttempt) {
                    console.error(
                        "ℹ️ Verify DATABASE_URL, Neon project status, and outbound network access."
                    );
                    throw error;
                }

                await sleep(retryDelayMs);
            }
        }
    }

    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined");
        }

        const conn = await mongoose.connect(
            process.env.MONGODB_URI,
            {
                dbName: DB_NAME,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            }
        );
        isConnected = conn.connections[0].readyState === 1;
        connectedProvider = "mongo";
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("❎ MongoDB connection FAILED", error);
        throw error;
    }
};

export default connectDB;
