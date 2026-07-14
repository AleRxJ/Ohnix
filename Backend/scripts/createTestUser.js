import dotenv from "dotenv";
import connectDB from "../db/index.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";

dotenv.config({ path: "./.env" });

const run = async () => {
    try {
        await connectDB();

        const email = "test@example.com";
        const username = "testuser";
        const password = "Test1234!";
        const avatar = "https://via.placeholder.com/150";

        // Check existing
        const existed = await User.findOne({ $or: [{ email }, { username }] });
        if (existed) {
            console.log("User already exists:", existed.email || existed.username);
            process.exit(0);
        }

        const user = new User({ email, username, password, avatar });
        await user.save();

        console.log("✅ Test user created:", { email, username });
        process.exit(0);
    } catch (err) {
        console.error("Error creating test user:", err);
        process.exit(1);
    }
};

run();
