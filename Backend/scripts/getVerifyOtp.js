import dotenv from "dotenv";
import connectDB from "../db/index.js";
import { User } from "../models/user.model.js";

dotenv.config({ path: "./.env" });

const run = async () => {
    try {
        await connectDB();
        const username = "testuser";
        const user = await User.findOne({ username }).select(
            "username email verifyOtp verifyOtpExpiry isVerified"
        );

        if (!user) {
            console.log("User not found");
            process.exit(1);
        }

        console.log("User:", {
            username: user.username,
            email: user.email,
            verifyOtp: user.verifyOtp,
            verifyOtpExpiry: user.verifyOtpExpiry,
            isVerified: user.isVerified,
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
