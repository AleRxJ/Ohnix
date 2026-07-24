import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { prisma } from "./prisma.js";

let isConnected = false;
let connectedProvider = null;

const connectDB = async () => {
    const provider = (process.env.DB_PROVIDER || "mongo").toLowerCase();

    if (isConnected && connectedProvider === provider) {
        console.log(`♻️ Reusing existing ${provider.toUpperCase()} connection`);
        return;
    }

    if (provider === "postgres" || provider === "prisma") {
        try {
            await prisma.$connect();
            isConnected = true;
            connectedProvider = provider;
            console.log("✅ PostgreSQL connected via Prisma");
            return;
        } catch (error) {
            console.error("❎ PostgreSQL connection FAILED", error);
            throw error;
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
