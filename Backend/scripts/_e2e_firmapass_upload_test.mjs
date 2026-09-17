import dotenv from "dotenv";
dotenv.config();

import { prisma } from "../db/prisma.js";
import { uploadCompanyFirmaPassRut } from "../services/firmaPassProvisioning.service.js";

const COMPANY_ID = "cmtblbus40002isho3e449ha2"; // Auditoria Contabilidad SAS (real, itcycle-provisioned)
const REAL_UUID = "2b154d73-1fe1-4ad4-8851-a69b8280210e"; // already claimed by nobody right now (reset last run)
const FAKE_UUID = "00000000-0000-4000-8000-000000000000";

const reset = () => prisma.company.update({ where: { id: COMPANY_ID }, data: { firmaPassValidationUuid: null } });

async function main() {
  await reset();

  // Claim the real uuid first WITHOUT actually uploading anything to
  // FirmaPass - just set the DB field directly, mirroring what step 1 of the
  // read-path test already proved happens on first legitimate contact.
  await prisma.company.update({ where: { id: COMPANY_ID }, data: { firmaPassValidationUuid: REAL_UUID } });
  console.log("Pre-claimed", REAL_UUID, "for the test company (no FirmaPass call yet).");

  console.log("\n--- uploadCompanyFirmaPassRut with a MISMATCHED uuid - must be rejected BEFORE ever reaching FirmaPass ---");
  try {
    await uploadCompanyFirmaPassRut({ companyId: COMPANY_ID, validationUuid: FAKE_UUID, rutBase64: "not-a-real-file" });
    console.log("BUG: this should have thrown a 403 but did not - it may have actually called FirmaPass!");
  } catch (error) {
    console.log(`Rejected as expected -> statusCode=${error.statusCode} message="${error.message}"`);
  }

  await reset();
  console.log("\nCleaned up (firmaPassValidationUuid reset to null). No real RUT upload was attempted against FirmaPass.");
}

main()
  .catch((error) => console.error("SCRIPT FAILED:", error))
  .finally(() => prisma.$disconnect());
