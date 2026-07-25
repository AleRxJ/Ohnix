import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";

dotenv.config({ path: "./.env" });

const run = async () => {
    try {
        await prisma.$connect();

        const email = "test@example.com";
        const username = "testuser";
        const password = "Test1234!";
        const avatar = "https://via.placeholder.com/150";

        const existed = await prisma.user.findFirst({
            where: {
                OR: [{ email }, { username }],
            },
            select: {
                id: true,
                email: true,
                username: true,
            },
        });

        if (existed) {
            console.log("User already exists:", existed.email || existed.username);
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                email,
                username,
                password: hashedPassword,
                avatar,
                isVerified: true,
            },
        });

        console.log("✅ Test user created:", { email, username });
    } catch (err) {
        console.error("Error creating test user:", err);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
};

run();
