import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const isPlaceholder = (value) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return !normalized || normalized === "change_me" || normalized === "change_me@gmail.com";
};

export const isMailConfigured = () =>
    !isPlaceholder(process.env.SENDER_EMAIL) &&
    !isPlaceholder(process.env.SENDER_PASSWORD);

const transporter = nodemailer.createTransport({
    host: "smtp.spacemail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SENDER_PASSWORD,
    },
});

export const sendMailSafe = async (mailOptions, context = "email") => {
    if (!isMailConfigured()) {
        if (process.env.NODE_ENV !== "production") {
            console.warn(
                `[mail:${context}] Skipped: SENDER_EMAIL/SENDER_PASSWORD are not configured.`
            );
        }
        return { skipped: true };
    }

    try {
        await transporter.sendMail(mailOptions);
        return { sent: true };
    } catch (error) {
        console.error(`[mail:${context}] Failed to send email:`, error?.message || error);
        return { sent: false, error };
    }
};

export default transporter;
