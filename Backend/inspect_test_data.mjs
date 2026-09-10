import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const companyId = "cmtt576qv0000isw05ure33o6";
const company = await prisma.company.findUnique({ where: { id: companyId } });
console.log("company.vatResponsible:", company.vatResponsible);
console.log("company.electronicInvoicingEnabled:", company.electronicInvoicingEnabled);
console.log("company.electronicInvoicingProvider:", company.electronicInvoicingProvider);

const user = await prisma.user.findFirst({ where: { companyId }, select: { id: true, email: true } });
console.log("user:", user);

// Any existing customer/supplier anywhere in the DB with these DIAN fields filled, to copy realistic sandbox codes
const sampleCustomer = await prisma.customer.findFirst({
    where: { identificationDocumentCode: { not: null }, tributeCode: { not: null } },
    select: { identificationDocumentCode: true, identification: true, legalOrganizationCode: true, tributeCode: true, municipalityCode: true, countryCode: true, name: true },
});
console.log("sample customer with DIAN fields:", sampleCustomer);

const sampleSupplier = await prisma.supplier.findFirst({
    where: { identificationDocumentCode: { not: null }, tributeCode: { not: null } },
    select: { identificationDocumentCode: true, identification: true, legalOrganizationCode: true, tributeCode: true, municipalityCode: true, countryCode: true, name: true, notObligatedToInvoice: true },
});
console.log("sample supplier with DIAN fields:", sampleSupplier);

await prisma.$disconnect();
