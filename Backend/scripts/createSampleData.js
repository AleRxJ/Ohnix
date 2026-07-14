import dotenv from "dotenv";
import connectDB from "../db/index.js";
import { Category } from "../models/category.model.js";
import { Unit } from "../models/unit.model.js";
import { User } from "../models/user.model.js";

dotenv.config({ path: "./.env" });

const run = async () => {
    try {
        await connectDB();

        const user = await User.findOne({ username: "testuser" });
        if (!user) {
            console.log("testuser not found");
            process.exit(1);
        }

        const category = await Category.create({
            category_name: "General",
            created_by: user._id,
        });

        const unit = await Unit.create({
            unit_name: "pcs",
            created_by: user._id,
        });

        console.log("Created sample category and unit:", {
            category_id: category._id.toString(),
            unit_id: unit._id.toString(),
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
