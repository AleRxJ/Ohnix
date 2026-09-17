import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config();

// Seeds IncomeTaxYearConfig/SimpleRegimeBracket with REFERENCE values only -
// recalled from general knowledge of Colombian tax law (Ley 2277/2022's 35%
// corporate rate, Art. 908 ET's 4-group/4-bracket RST structure), NOT copied
// from a DIAN resolution someone actually checked. Every row is written with
// isVerified: false on purpose - see the schema comment on
// IncomeTaxYearConfig and accounting.renta_unverified_notice in the
// frontend. An accountant MUST confirm these (and mark them verified via the
// admin income-tax-config screen) before this module is used against a real
// client's numbers.
//
// UVT values: DIAN publishes the next year's UVT by resolution near the end
// of the prior year - only years already past have a value here.
const YEAR_CONFIGS = [
    { year: 2023, ordinaryRatePercent: 35, uvtValue: 42412 },
    { year: 2024, ordinaryRatePercent: 35, uvtValue: 47065 },
    { year: 2025, ordinaryRatePercent: 35, uvtValue: 49799 },
];

// Art. 908 ET tramos: each group's total annual gross ordinary+extraordinary
// income (converted to UVT using that year's uvtValue) falls into exactly
// one of these 4 brackets, and the WHOLE base is taxed at that bracket's
// single rate (not a marginal/progressive calculation).
const BRACKET_YEARS = [2023, 2024, 2025];
const RST_BRACKETS_BY_GROUP = {
    // Tiendas, mini/micro-mercados, peluquerías
    group1: [
        { minUvt: 0, maxUvt: 6000, ratePercent: 2.0 },
        { minUvt: 6000, maxUvt: 15000, ratePercent: 2.8 },
        { minUvt: 15000, maxUvt: 30000, ratePercent: 8.1 },
        { minUvt: 30000, maxUvt: 100000, ratePercent: 11.6 },
    ],
    // Comercio al por mayor y al por detal; servicios técnicos y mecánicos
    group2: [
        { minUvt: 0, maxUvt: 6000, ratePercent: 1.2 },
        { minUvt: 6000, maxUvt: 15000, ratePercent: 2.8 },
        { minUvt: 15000, maxUvt: 30000, ratePercent: 4.4 },
        { minUvt: 30000, maxUvt: 100000, ratePercent: 5.9 },
    ],
    // Servicios profesionales, de consultoría y científicos
    group3: [
        { minUvt: 0, maxUvt: 6000, ratePercent: 4.9 },
        { minUvt: 6000, maxUvt: 15000, ratePercent: 5.3 },
        { minUvt: 15000, maxUvt: 30000, ratePercent: 7.0 },
        { minUvt: 30000, maxUvt: 100000, ratePercent: 5.4 },
    ],
    // Actividades industriales, incluidas agroindustriales
    group4: [
        { minUvt: 0, maxUvt: 6000, ratePercent: 1.6 },
        { minUvt: 6000, maxUvt: 15000, ratePercent: 2.0 },
        { minUvt: 15000, maxUvt: 30000, ratePercent: 3.4 },
        { minUvt: 30000, maxUvt: 100000, ratePercent: 3.8 },
    ],
};

const parseArgs = () => ({ apply: process.argv.includes("--apply") });

const run = async () => {
    const { apply } = parseArgs();
    console.log(apply ? "Applying seed (writes to the database)..." : "Dry run (pass --apply to write).");

    for (const config of YEAR_CONFIGS) {
        console.log(`IncomeTaxYearConfig year=${config.year} ordinaryRatePercent=${config.ordinaryRatePercent} uvtValue=${config.uvtValue}`);
        if (apply) {
            await prisma.incomeTaxYearConfig.upsert({
                where: { year: config.year },
                update: { ordinaryRatePercent: config.ordinaryRatePercent, uvtValue: config.uvtValue },
                create: { ...config, isVerified: false },
            });
        }
    }

    for (const year of BRACKET_YEARS) {
        for (const [group, brackets] of Object.entries(RST_BRACKETS_BY_GROUP)) {
            for (const bracket of brackets) {
                console.log(`SimpleRegimeBracket year=${year} group=${group} ${bracket.minUvt}-${bracket.maxUvt ?? "∞"} UVT rate=${bracket.ratePercent}%`);
                if (apply) {
                    await prisma.simpleRegimeBracket.upsert({
                        where: { year_group_minUvt: { year, group, minUvt: bracket.minUvt } },
                        update: { maxUvt: bracket.maxUvt, ratePercent: bracket.ratePercent },
                        create: { year, group, ...bracket, isVerified: false },
                    });
                }
            }
        }
    }

    console.log(apply ? "Done. All rows written with isVerified: false - have an accountant confirm them." : "Dry run complete - nothing written.");
};

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
