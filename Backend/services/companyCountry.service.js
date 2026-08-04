import { prisma } from "../db/prisma.js";

export const normalizeCountryCode = (value) =>
    `${value || ""}`.trim().toUpperCase() || null;

export const resolveCompanyCountryByUserId = async (userId) => {
    if (!userId) {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            company: {
                select: {
                    countryCode: true,
                },
            },
        },
    });

    if (!user) {
        return null;
    }

    const companyCountry = normalizeCountryCode(user.company?.countryCode);
    if (companyCountry) {
        return companyCountry;
    }

    // Language is not a fiscal jurisdiction. Emission must remain disabled until
    // the company has an explicit ISO country code.
    return null;
};
