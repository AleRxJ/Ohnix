import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import lowStockScheduler from "./utils/lowStockScheduler.js";

dotenv.config({
    path: "./.env",
});

connectDB()
    .then(() => {
        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            console.log(`✅ Server listening on http://localhost:${port}/`);

            if (process.env.START_SCHEDULER !== "false") {
                console.log("🚀 Starting low stock alert scheduler...");
                lowStockScheduler.start();
            }
        });
    })
    .catch((err) => {
        console.log("Database connection failed !!! ", err);
    });

// Graceful shutdown for local/node runtime.
process.on("SIGTERM", () => {
    console.log("🛑 SIGTERM received, stopping low stock scheduler...");
    lowStockScheduler.stop();
    process.exit(0);
});

process.on("SIGINT", () => {
    console.log("🛑 SIGINT received, stopping low stock scheduler...");
    lowStockScheduler.stop();
    process.exit(0);
});