import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";
import { calculateExpectedReturnedTax } from "../utils/orderReturnTax.js";

dotenv.config();

const apply = process.argv.includes("--apply");

const main = async () => {
    const details = await prisma.orderDetail.findMany({
        where: { returnedQuantity: { gt: 0 } },
        select: {
            id: true,
            orderId: true,
            quantity: true,
            returnedQuantity: true,
            unitcost: true,
            taxRateApplied: true,
            taxAmount: true,
            returnedTaxAmount: true,
            order: { select: { invoiceNo: true, createdById: true } },
        },
        orderBy: { id: "asc" },
    });

    const invalid = [];
    const candidates = [];

    for (const detail of details) {
        if (detail.returnedQuantity > detail.quantity) {
            invalid.push({
                detail_id: detail.id,
                order_id: detail.orderId,
                invoice_no: detail.order.invoiceNo,
                quantity: detail.quantity,
                returned_quantity: detail.returnedQuantity,
            });
            continue;
        }

        const current = Number(detail.returnedTaxAmount);
        const expected = calculateExpectedReturnedTax(detail);
        if (Math.abs(current - expected) > 0.001) {
            candidates.push({
                detail_id: detail.id,
                order_id: detail.orderId,
                account_id: detail.order.createdById,
                invoice_no: detail.order.invoiceNo,
                current_returned_tax: current,
                expected_returned_tax: expected,
                difference: Number((expected - current).toFixed(2)),
            });
        }
    }

    const result = {
        mode: apply ? "apply" : "dry-run",
        returned_lines_scanned: details.length,
        candidates: candidates.length,
        invalid_lines: invalid.length,
        total_adjustment: Number(candidates.reduce((sum, row) => sum + row.difference, 0).toFixed(2)),
        updated: 0,
        conflicts: [],
        invalid,
        details: candidates,
    };

    if (apply && invalid.length > 0) {
        throw new Error(`Backfill blocked: ${invalid.length} order detail(s) have returnedQuantity greater than quantity.`);
    }

    if (apply) {
        for (const candidate of candidates) {
            const claimed = await prisma.orderDetail.updateMany({
                where: {
                    id: candidate.detail_id,
                    returnedTaxAmount: candidate.current_returned_tax,
                },
                data: { returnedTaxAmount: candidate.expected_returned_tax },
            });
            if (claimed.count === 1) result.updated += 1;
            else result.conflicts.push(candidate.detail_id);
        }
    }

    console.log(JSON.stringify(result, null, 2));
    if (result.conflicts.length > 0) process.exitCode = 2;
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
