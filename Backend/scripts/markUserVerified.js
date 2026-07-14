import dotenv from "dotenv";
import connectDB from "../db/index.js";
import { User } from "../models/user.model.js";

dotenv.config({ path: "./.env" });

const run = async () => {
    try {
        await connectDB();
        const username = "testuser";
        const user = await User.findOne({ username });
        if (!user) {
            console.log("User not found");
            process.exit(1);
        }

        user.isVerified = true;
        user.verifyOtp = "";
        user.verifyOtpExpiry = 0;
        await user.save({ validateBeforeSave: false });

        console.log("✅ User marked as verified:", username);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
};

run();
