import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import { prisma } from "../db/prisma.js";

// One-off backfill for the multi-image feature: every pre-existing product
// only ever had Product.productImage (a plain string column). This creates
// the matching ProductImage row (position 0, isPrimary true) so those
// products show up in the new gallery exactly as they did before - see
// services/productImage.service.js for the write path this table now goes
// through for every product going forward.
//
// Idempotent: skips any product that already has ProductImage rows, so it's
// safe to re-run (e.g. after a partial run, or once more products are
// created before this is run).
const PLACEHOLDER_PRODUCT_IMAGE = "default-product.png";

const run = async () => {
    await prisma.$connect();

    const products = await prisma.product.findMany({
        where: {
            productImage: { not: PLACEHOLDER_PRODUCT_IMAGE },
            images: { none: {} },
        },
        select: { id: true, productImage: true },
    });

    console.log(`Found ${products.length} product(s) needing a backfilled primary image.`);

    let created = 0;
    for (const product of products) {
        await prisma.productImage.create({
            data: {
                productId: product.id,
                url: product.productImage,
                position: 0,
                isPrimary: true,
            },
        });
        created += 1;
    }

    console.log(`Backfilled ${created} ProductImage row(s).`);
};

run()
    .catch((err) => {
        console.error("Backfill failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
