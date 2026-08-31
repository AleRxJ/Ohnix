import { issueElectronicInvoiceForOrder } from "./services/electronicInvoicing.service.js";

const orderId = process.argv[2];
const requesterUserId = process.argv[3];

try {
    const result = await issueElectronicInvoiceForOrder({
        orderId,
        requesterUserId,
        requesterRole: "user",
        trigger: "manual",
    });
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error("ERROR:", error.message);
    if (error.errors) console.error("errors:", JSON.stringify(error.errors));
}
process.exit(0);
