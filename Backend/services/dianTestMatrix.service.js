import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { decryptSecret } from "../utils/secretEncryption.js";
import {
    createItcycleInvoice,
    createItcycleCreditNote,
    createItcycleDebitNote,
    refreshItcycleDocumentStatus,
    isItcycleConfigured,
} from "./itcycleDian.service.js";
import { getCompanyDianReadiness } from "./firmaPassProvisioning.service.js";
import { buildItcycleCustomerParty, buildItcycleLines, buildItcycleTotals } from "./electronicInvoicing.service.js";
import { notifyAdminsDianTestMatrixRunFinished, notifyCompanyOwnerDianTestMatrixRunFinished } from "../utils/dianTestMatrixNotifications.js";

const text = (value) => `${value || ""}`.trim();

const POLL_INTERVAL_MS = Number(process.env.DIAN_TEST_MATRIX_POLL_INTERVAL_MS) || 15000;
const MAX_POLL_ATTEMPTS = Number(process.env.DIAN_TEST_MATRIX_MAX_POLL_ATTEMPTS) || 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// DIAN document-type codes.
const DOCUMENT_TYPE_CODE = { invoice: "01", creditNote: "91", debitNote: "92" };

// DIAN's own habilitación portal tells each company exactly how many
// accepted documents of each type it actually requires ("Total de
// documentos aceptados requeridos: Facturas X, Notas de débito Y, Notas de
// crédito Z") - that number varies per company and isn't exposed by any API
// (see listTestSubmissions's own comment on itcycle-api-dian's side), so it
// can't be looked up automatically. These defaults - one of each document
// type - only exist to keep a run fast and cheap when the caller doesn't
// specify anything; whoever starts a run can and should override them with
// what their own portal actually asks for. A hardcoded 30/10/10 used to be
// the ONLY option, sized for one company that happened to need that much -
// for a company that only needs 1 invoice (the DIAN minimum) and 0 notes,
// that was 47 unnecessary documents' worth of waiting for no reason.
const DEFAULT_INVOICE_TARGET = 1;
const DEFAULT_CREDIT_NOTE_TARGET = 1;
const DEFAULT_DEBIT_NOTE_TARGET = 1;
const MAX_DOCUMENT_TARGET = 50;

/** Clamps a caller-supplied target to [min, MAX_DOCUMENT_TARGET], falling back to `fallback` for anything not a finite number. */
const clampTarget = (value, fallback, min = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(MAX_DOCUMENT_TARGET, Math.max(min, Math.round(n)));
};

// Official DIAN "concepto de corrección" codes (Anexo Técnico 1.9, secciones
// 13.2.7.4/13.2.7.5) - confirmed against itcycle-api-dian's own schema
// comments (discrepancyResponseCode: "2" = anulacion / "1" = intereses) and
// dian-engine's own credit-note example. Chosen for being the simplest,
// always-well-formed case for synthetic data (full annulment/plain interest
// charge need no partial-amount consistency math against the original line
// items), not because other codes would be wrong.
const DISCREPANCY_BY_TYPE = {
    creditNote: { responseCode: "2", description: "Anulación de factura electrónica - prueba de habilitación" },
    debitNote: { responseCode: "1", description: "Intereses - prueba de habilitación" },
};

// A handful of plausible product lines, cycled deterministically per sequence
// (not random) so a failed run is reproducible on retry.
const PRODUCT_LINES = [
    { productName: "Servicio de consultoría", standardCode: "SRV001", unitMeasureCode: "94", taxCode: "01", taxRateApplied: 19, taxTreatmentApplied: "taxed" },
    { productName: "Producto exento", standardCode: "SRV002", unitMeasureCode: "94", taxCode: "01", taxRateApplied: 0, taxTreatmentApplied: "taxed" },
    { productName: "Bien excluido de IVA", standardCode: "SRV003", unitMeasureCode: "94", taxCode: "01", taxRateApplied: 0, taxTreatmentApplied: "excluded" },
];

const dummyCustomer = (sequence) => ({
    name: `Cliente de prueba ${sequence}`,
    identification: `22200000${String(sequence).padStart(2, "0")}`,
    identificationDocumentCode: "13",
    legalOrganizationCode: "2",
    tributeCode: "01",
    municipalityCode: "11001",
    address: "Calle 100 # 10-20",
    email: undefined,
});

const buildDummyInvoicePayload = (sequence) => {
    const line = PRODUCT_LINES[sequence % PRODUCT_LINES.length];
    const quantity = 1 + (sequence % 5);
    const unitcost = 50000 + sequence * 12345;
    const orderDetails = [{
        quantity,
        unitcost,
        taxTreatmentApplied: line.taxTreatmentApplied,
        taxRateApplied: line.taxRateApplied,
        taxAmount: line.taxTreatmentApplied === "excluded" ? 0 : Math.round(quantity * unitcost * (line.taxRateApplied / 100)),
        product: { unitMeasureCode: line.unitMeasureCode, productName: `${line.productName} ${sequence}`, taxCode: line.taxCode, standardCode: line.standardCode },
    }];
    const lines = buildItcycleLines(orderDetails);
    const totals = buildItcycleTotals(lines);
    const now = new Date();
    return {
        issueDate: now.toISOString(),
        issueTime: now.toISOString(),
        customer: buildItcycleCustomerParty(dummyCustomer(sequence)),
        lines,
        ...totals,
        paymentMeans: { paymentForm: "1", paymentMethod: "10" },
    };
};

// CreditNoteInput/DebitNoteInput both require customer + paymentMeans (see
// dian-engine's InvoiceInput, which CreditNoteInput/DebitNoteInput extend) -
// itcycle-api-dian's real production note payload (buildItcycleCreditNotePayload
// in electronicInvoicing.service.js) always reuses the ORIGINAL invoice's own
// customer for this reason. This dummy generator used to omit both entirely,
// which never surfaced as long as notes failed earlier in the pipeline (the
// "referenced invoice not ACCEPTED" cascade, now fixed at the root in
// itcycle-api-dian) - once that stopped masking it, every note started
// failing Zod validation instead. `referenceInvoiceSequence` (not the note's
// own `sequence`) drives the dummy customer so it matches the invoice this
// note actually references, same as real production notes.
const buildDummyNotePayload = (sequence, referenceInvoiceSequence) => {
    const orderDetails = [{
        quantity: 1,
        unitcost: 10000 + sequence * 100,
        taxTreatmentApplied: "taxed",
        taxRateApplied: 19,
        taxAmount: Math.round((10000 + sequence * 100) * 0.19),
        product: { unitMeasureCode: "94", productName: `Ajuste de prueba ${sequence}`, taxCode: "01", standardCode: "AJU001" },
    }];
    const lines = buildItcycleLines(orderDetails);
    const totals = buildItcycleTotals(lines);
    return {
        issueDate: new Date().toISOString(),
        issueTime: new Date().toISOString(),
        customer: buildItcycleCustomerParty(dummyCustomer(referenceInvoiceSequence)),
        lines,
        ...totals,
        paymentMeans: { paymentForm: "1", paymentMethod: "10" },
    };
};

/**
 * Validates a company is ready for a DIAN habilitación test-matrix run and,
 * if so, creates the run + its pending document rows (sized by
 * invoiceTarget/creditNoteTarget/debitNoteTarget - see their own comment),
 * then kicks off the worker in the background (fire-and-forget, mirroring
 * the one-off async pattern used for subscription reconciliation in
 * server.js - this is not a periodic job, so it's not a node-cron
 * scheduler). Returns immediately; the caller polls getDianTestMatrixRun
 * for progress.
 */
export const startDianTestMatrixRun = async ({ companyId, testSetId, requesterUserId, invoiceTarget, creditNoteTarget, debitNoteTarget }) => {
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");
    if (!text(testSetId)) throw new ApiError(400, "testSetId is required");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!text(company.itcycleCompanyId) || !text(company.itcycleApiKeyCiphertext)) {
        throw new ApiError(422, "Company has not been provisioned with itcycle-api-dian yet");
    }

    const active = await prisma.dianTestMatrixRun.findFirst({
        where: { companyId, status: { in: ["pending", "running"] } },
    });
    if (active) throw new ApiError(409, "A DIAN test-matrix run is already in progress for this company", [active.id]);

    const readiness = await getCompanyDianReadiness({ companyId });
    const missing = [];
    // Never run synthetic habilitación documents against a real PRODUCTION
    // DianConfiguration - a test-matrix run is only meaningful in SANDBOX.
    if (readiness.environment !== "SANDBOX") missing.push("environment_must_be_sandbox");
    if (!readiness.configurationReady) missing.push("dian_configuration");
    if (!readiness.certificateReady) missing.push("active_certificate");
    for (const type of ["01", "91", "92"]) {
        const hasCurrent = (readiness.resolutions || []).some((r) => r.documentType === type && r.isCurrent);
        if (!hasCurrent) missing.push(`numbering_resolution_${type}`);
    }
    if (missing.length > 0) {
        throw new ApiError(422, "Company is not ready for a DIAN test-matrix run", missing);
    }

    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);

    // Invoices always >= 1 - DIAN's habilitación never accepts a company
    // with zero required invoices (see this file's own header comment), and
    // every note needs at least one invoice sequence to reference.
    const invoiceCount = clampTarget(invoiceTarget, DEFAULT_INVOICE_TARGET, 1);
    const creditNoteCount = clampTarget(creditNoteTarget, DEFAULT_CREDIT_NOTE_TARGET);
    const debitNoteCount = clampTarget(debitNoteTarget, DEFAULT_DEBIT_NOTE_TARGET);

    const documentsData = [];
    let sequence = 1;
    for (let i = 0; i < invoiceCount; i += 1, sequence += 1) {
        documentsData.push({ sequence, documentType: "invoice" });
    }
    for (let i = 0; i < creditNoteCount; i += 1, sequence += 1) {
        documentsData.push({ sequence, documentType: "creditNote", referenceInvoiceSequence: 1 + (i % invoiceCount) });
    }
    for (let i = 0; i < debitNoteCount; i += 1, sequence += 1) {
        documentsData.push({ sequence, documentType: "debitNote", referenceInvoiceSequence: 1 + (i % invoiceCount) });
    }

    const run = await prisma.dianTestMatrixRun.create({
        data: {
            companyId,
            testSetId: testSetId.trim(),
            requestedByUserId: requesterUserId,
            invoiceTarget: invoiceCount,
            creditNoteTarget: creditNoteCount,
            debitNoteTarget: debitNoteCount,
        },
    });

    // internalReference must be globally unique (schema constraint) - only
    // known once we have the real run.id, so it's assembled here, not above.
    await prisma.dianTestMatrixDocument.createMany({
        data: documentsData.map((d) => ({ ...d, runId: run.id, internalReference: `${run.id}-${d.sequence}` })),
    });

    runDianTestMatrixWorker({ runId: run.id, apiKey, testSetId: testSetId.trim() }).catch((error) => {
        console.error(`[dian-test-matrix] worker failed for run ${run.id}:`, error);
    });

    return getDianTestMatrixRun({ runId: run.id });
};

const CREATE_FN_BY_TYPE = { creditNote: createItcycleCreditNote, debitNote: createItcycleDebitNote };

async function pollDocumentToTerminal({ itcycleCompanyId, dianDocumentType, externalId, docId }) {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        const cancelled = await isRunCancelledForDocument(docId);
        if (cancelled) return { terminal: false, cancelled: true };

        const refreshed = await refreshItcycleDocumentStatus({ companyId: itcycleCompanyId, documentType: dianDocumentType, id: externalId });
        await prisma.dianTestMatrixDocument.update({ where: { id: docId }, data: { attempts: attempt } });
        if (refreshed.status === "ACCEPTED" || refreshed.status === "REJECTED") {
            return { terminal: true, record: refreshed };
        }
    }
    return { terminal: false, timedOut: true };
}

async function isRunCancelledForDocument(docId) {
    const doc = await prisma.dianTestMatrixDocument.findUnique({ where: { id: docId }, select: { run: { select: { cancelRequested: true } } } });
    return Boolean(doc?.run?.cancelRequested);
}

async function processInvoiceDocument({ doc, apiKey, testSetId, itcycleCompanyId }) {
    await prisma.dianTestMatrixDocument.update({ where: { id: doc.id }, data: { status: "sending" } });
    let result;
    try {
        result = await createItcycleInvoice({
            apiKey,
            internalReference: doc.internalReference,
            invoice: buildDummyInvoicePayload(doc.sequence),
            send: { method: "SendTestSetAsync", testSetId },
        });
    } catch (error) {
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: error.message || String(error), resolvedAt: new Date() },
        });
        return null;
    }

    await prisma.dianTestMatrixDocument.update({
        where: { id: doc.id },
        data: {
            externalId: result.id,
            status: "sent",
            cufe: result.cufe || null,
            sentAt: new Date(),
            certificateId: result.certificateId || null,
            certificateProvider: result.certificate?.provider || null,
            certificateIdentifier: result.certificate?.certificateIdentifier || null,
        },
    });

    if (result.status === "ACCEPTED" || result.status === "REJECTED") {
        // Sync send (or DIAN already resolved it) - nothing to poll.
        // itcycle-api-dian's own status is canonical here, including the
        // "test set already Aceptado" case (see its
        // documentSend.service.ts#isTestSetAlreadyAcceptedMessage) - it
        // already reports that as ACCEPTED, not a real rejection, so this
        // just trusts it instead of re-deriving the same rule from the
        // response text a second time.
        const treatAsAccepted = result.status === "ACCEPTED";
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: treatAsAccepted ? "accepted" : "rejected", statusDescription: result.statusDescription || null, cufe: result.cufe || null, resolvedAt: new Date() },
        });
        return treatAsAccepted ? { sequence: doc.sequence, externalId: result.id } : null;
    }
    if (result.status !== "SENT") {
        // CONTINGENCY (DIAN unreachable) or ERROR - not pollable (no trackId
        // was ever set for these paths). Report immediately instead of
        // burning the whole poll budget only to time out with a misleading
        // "no response from DIAN" message.
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: result.errorMessage || `itcycle-api-dian returned status ${result.status}`, resolvedAt: new Date() },
        });
        return null;
    }

    const outcome = await pollDocumentToTerminal({ itcycleCompanyId, dianDocumentType: "01", externalId: result.id, docId: doc.id });
    if (outcome.cancelled) {
        await prisma.dianTestMatrixDocument.update({ where: { id: doc.id }, data: { status: "error", errorMessage: "Run cancelled", resolvedAt: new Date() } });
        return null;
    }
    if (outcome.timedOut) {
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: `Timed out waiting for DIAN confirmation after ${MAX_POLL_ATTEMPTS} attempts`, resolvedAt: new Date() },
        });
        return null;
    }
    // Same reasoning as the sync branch above: trust itcycle-api-dian's own
    // canonical status, already resolved through the "test set already
    // Aceptado" rule on that side.
    const accepted = outcome.record.status === "ACCEPTED";
    await prisma.dianTestMatrixDocument.update({
        where: { id: doc.id },
        data: {
            status: accepted ? "accepted" : "rejected",
            cufe: outcome.record.cufe || null,
            statusDescription: outcome.record.statusDescription || null,
            errorMessage: outcome.record.errorMessage || null,
            resolvedAt: new Date(),
        },
    });
    return accepted ? { sequence: doc.sequence, externalId: result.id } : null;
}

async function processNoteDocument({ doc, apiKey, testSetId, itcycleCompanyId, invoiceBySequence }) {
    const invoiceRef = invoiceBySequence.get(doc.referenceInvoiceSequence);
    if (!invoiceRef) {
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: "Referenced invoice was not accepted", resolvedAt: new Date() },
        });
        return;
    }

    await prisma.dianTestMatrixDocument.update({ where: { id: doc.id }, data: { status: "sending" } });
    const createFn = CREATE_FN_BY_TYPE[doc.documentType];
    const dianDocumentType = DOCUMENT_TYPE_CODE[doc.documentType];
    let result;
    try {
        result = await createFn({
            apiKey,
            internalReference: doc.internalReference,
            invoiceId: invoiceRef.externalId,
            document: buildDummyNotePayload(doc.sequence, doc.referenceInvoiceSequence),
            discrepancyResponse: DISCREPANCY_BY_TYPE[doc.documentType],
            send: { method: "SendTestSetAsync", testSetId },
        });
    } catch (error) {
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: error.message || String(error), resolvedAt: new Date() },
        });
        return;
    }

    await prisma.dianTestMatrixDocument.update({
        where: { id: doc.id },
        data: {
            externalId: result.id,
            status: "sent",
            cufe: result.cufe || null,
            sentAt: new Date(),
            certificateId: result.certificateId || null,
            certificateProvider: result.certificate?.provider || null,
            certificateIdentifier: result.certificate?.certificateIdentifier || null,
        },
    });

    if (result.status === "ACCEPTED" || result.status === "REJECTED") {
        // Same reasoning as processInvoiceDocument's sync branch: trust
        // itcycle-api-dian's own canonical status.
        const treatAsAccepted = result.status === "ACCEPTED";
        await prisma.dianTestMatrixDocument.update({ where: { id: doc.id }, data: { status: treatAsAccepted ? "accepted" : "rejected", statusDescription: result.statusDescription || null, resolvedAt: new Date() } });
        return;
    }
    if (result.status !== "SENT") {
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: result.errorMessage || `itcycle-api-dian returned status ${result.status}`, resolvedAt: new Date() },
        });
        return;
    }

    const outcome = await pollDocumentToTerminal({ itcycleCompanyId, dianDocumentType, externalId: result.id, docId: doc.id });
    if (outcome.cancelled) {
        await prisma.dianTestMatrixDocument.update({ where: { id: doc.id }, data: { status: "error", errorMessage: "Run cancelled", resolvedAt: new Date() } });
        return;
    }
    if (outcome.timedOut) {
        await prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: { status: "error", errorMessage: `Timed out waiting for DIAN confirmation after ${MAX_POLL_ATTEMPTS} attempts`, resolvedAt: new Date() },
        });
        return;
    }
    // Same reasoning as processInvoiceDocument's polled branch.
    const accepted = outcome.record.status === "ACCEPTED";
    await prisma.dianTestMatrixDocument.update({
        where: { id: doc.id },
        data: {
            status: accepted ? "accepted" : "rejected",
            cufe: outcome.record.cufe || null,
            statusDescription: outcome.record.statusDescription || null,
            errorMessage: outcome.record.errorMessage || null,
            resolvedAt: new Date(),
        },
    });
}

/**
 * The actual batch worker. Runs strictly sequentially (never Promise.all) -
 * itcycle-api-dian's NumberingResolution.currentNumber claim has no row lock
 * (a plain read-then-write transaction), so concurrent creates for the same
 * company could silently collide on the same document number. Invoices are
 * fully processed first, since notes need an already-ACCEPTED invoice to
 * reference - a note's `referenceInvoiceSequence` can point at ANY accepted
 * invoice from this run, not necessarily a distinct one per note.
 *
 * `isRetry` (see retryFailedDianTestMatrixDocuments) skips any document
 * already "accepted" instead of reprocessing every row unconditionally -
 * re-sending an already-accepted document would claim ANOTHER real DIAN
 * document number for nothing. Already-accepted invoices are still added to
 * invoiceBySequence so retried notes can reference them. `startedAt` is only
 * set on a document's very first attempt (not on retry) so it keeps meaning
 * "when this habilitación attempt truly began".
 */
async function runDianTestMatrixWorker({ runId, apiKey, testSetId, isRetry = false }) {
    await prisma.dianTestMatrixRun.update({
        where: { id: runId },
        data: isRetry ? { status: "running" } : { status: "running", startedAt: new Date() },
    });

    try {
        const run = await prisma.dianTestMatrixRun.findUniqueOrThrow({
            where: { id: runId },
            include: { company: true, documents: { orderBy: { sequence: "asc" } } },
        });
        const itcycleCompanyId = run.company.itcycleCompanyId;

        const invoiceDocs = run.documents.filter((d) => d.documentType === "invoice");
        const noteDocs = run.documents.filter((d) => d.documentType !== "invoice");

        const invoiceBySequence = new Map();
        for (const doc of invoiceDocs) {
            if (doc.status === "accepted" && doc.externalId) {
                invoiceBySequence.set(doc.sequence, { sequence: doc.sequence, externalId: doc.externalId });
            }
        }

        for (const doc of invoiceDocs) {
            if (doc.status === "accepted") continue;
            const cancelled = (await prisma.dianTestMatrixRun.findUnique({ where: { id: runId }, select: { cancelRequested: true } }))?.cancelRequested;
            if (cancelled) break;
            const accepted = await processInvoiceDocument({ doc, apiKey, testSetId, itcycleCompanyId });
            if (accepted) invoiceBySequence.set(accepted.sequence, accepted);
        }

        for (const doc of noteDocs) {
            if (doc.status === "accepted") continue;
            const cancelled = (await prisma.dianTestMatrixRun.findUnique({ where: { id: runId }, select: { cancelRequested: true } }))?.cancelRequested;
            if (cancelled) break;
            await processNoteDocument({ doc, apiKey, testSetId, itcycleCompanyId, invoiceBySequence });
        }

        const finalRun = await prisma.dianTestMatrixRun.findUniqueOrThrow({ where: { id: runId } });
        if (finalRun.cancelRequested) {
            await prisma.dianTestMatrixRun.update({ where: { id: runId }, data: { status: "cancelled", finishedAt: new Date() } });
            await sendRunFinishedNotification(runId);
            return;
        }

        const acceptedInvoices = await prisma.dianTestMatrixDocument.count({ where: { runId, documentType: "invoice", status: "accepted" } });
        await prisma.dianTestMatrixRun.update({
            where: { id: runId },
            data: { status: "completed", finishedAt: new Date(), passResult: acceptedInvoices >= 1 },
        });
        await sendRunFinishedNotification(runId);
    } catch (error) {
        await prisma.dianTestMatrixRun.update({
            where: { id: runId },
            data: { status: "failed", finishedAt: new Date(), errorMessage: error.message || String(error) },
        });
        await sendRunFinishedNotification(runId);
    }
}

/**
 * Emails every admin, plus the company's own owner, once a run reaches a
 * terminal status - runs can take a while (up to ~50 documents x several
 * minutes of polling each), so this closes the loop instead of requiring
 * someone to keep a tab open. Fires regardless of who started the run
 * (an Ohnix admin, or the owner themselves via the self-service panel) -
 * the owner should always know their own habilitación result either way.
 * Never lets a notification failure affect the run's own recorded outcome -
 * both notify* functions already swallow their own errors, but the company/
 * owner lookups here are wrapped too, out of the same caution.
 */
async function sendRunFinishedNotification(runId) {
    try {
        const run = await getDianTestMatrixRun({ runId });
        const company = await prisma.company.findUnique({ where: { id: run.companyId }, select: { name: true } });
        await notifyAdminsDianTestMatrixRunFinished({ run, company, summary: run.summary });
        // run.requestedByUserId is NOT who to notify here - for an
        // admin-started run that's the admin, not the company. The owner is
        // the one user row carrying this companyId directly: team members
        // never get their own companyId set (they're scoped via TeamMember +
        // resolveAccountScope instead - see auth.middleware.js), so this
        // reliably resolves to exactly the account owner.
        const ownerUser = await prisma.user.findFirst({ where: { companyId: run.companyId }, select: { email: true, username: true } });
        if (ownerUser) await notifyCompanyOwnerDianTestMatrixRunFinished({ run, company, summary: run.summary, ownerUser });
    } catch (error) {
        console.error(`[dian-test-matrix] failed to send finish notification for run ${runId}:`, error);
    }
}

export const getDianTestMatrixRun = async ({ runId }) => {
    const run = await prisma.dianTestMatrixRun.findUnique({
        where: { id: runId },
        include: { documents: { orderBy: { sequence: "asc" } } },
    });
    if (!run) throw new ApiError(404, "DIAN test-matrix run not found");

    const summary = {};
    for (const doc of run.documents) {
        summary[doc.documentType] = summary[doc.documentType] || {};
        summary[doc.documentType][doc.status] = (summary[doc.documentType][doc.status] || 0) + 1;
    }
    return { ...run, summary };
};

export const listDianTestMatrixRuns = async ({ companyId }) =>
    prisma.dianTestMatrixRun.findMany({
        where: companyId ? { companyId } : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
    });

/** Sets cancelRequested - the worker checks this between documents (never mid-flight on one) and stops the run at the next safe point. */
export const cancelDianTestMatrixRun = async ({ runId }) => {
    const run = await prisma.dianTestMatrixRun.findUnique({ where: { id: runId } });
    if (!run) throw new ApiError(404, "DIAN test-matrix run not found");
    if (run.status !== "pending" && run.status !== "running") {
        throw new ApiError(409, `Run is already ${run.status} - nothing to cancel`);
    }
    return prisma.dianTestMatrixRun.update({ where: { id: runId }, data: { cancelRequested: true } });
};

/**
 * Re-attempts only the documents that ended in "error"/"rejected" on a
 * finished run, instead of forcing a whole new run from scratch for what
 * might be one transient failure (a slow DIAN sandbox response, a network
 * blip). Already-"accepted" documents are left untouched - see
 * runDianTestMatrixWorker's own comment for why re-sending them would be
 * both wasteful and wrong (a fresh DIAN document number for nothing).
 *
 * Each retried document gets a brand-new internalReference before being
 * resent: itcycle-api-dian's own idempotent-replay check (createInvoice's
 * `if (existing) return existing`) would otherwise just hand back the exact
 * same REJECTED/ERROR row for the old internalReference instead of actually
 * re-validating anything - see itcycle-api-dian's invoice.service.ts.
 */
export const retryFailedDianTestMatrixDocuments = async ({ runId }) => {
    const run = await prisma.dianTestMatrixRun.findUnique({
        where: { id: runId },
        include: { company: true, documents: true },
    });
    if (!run) throw new ApiError(404, "DIAN test-matrix run not found");
    if (run.status !== "completed" && run.status !== "failed") {
        throw new ApiError(409, `Run is currently ${run.status} - cannot retry while it's already in progress`);
    }
    if (!text(run.company.itcycleApiKeyCiphertext)) {
        throw new ApiError(422, "Company has not been provisioned with itcycle-api-dian yet");
    }

    const retryable = run.documents.filter((d) => d.status === "error" || d.status === "rejected");
    if (retryable.length === 0) {
        throw new ApiError(422, "This run has no failed documents to retry");
    }

    const apiKey = decryptSecret(run.company.itcycleApiKeyCiphertext);

    await Promise.all(retryable.map((doc) =>
        prisma.dianTestMatrixDocument.update({
            where: { id: doc.id },
            data: {
                status: "pending",
                internalReference: `${doc.internalReference}-r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                externalId: null,
                cufe: null,
                statusDescription: null,
                errorMessage: null,
                certificateId: null,
                certificateProvider: null,
                certificateIdentifier: null,
                sentAt: null,
                resolvedAt: null,
                attempts: 0,
            },
        })
    ));

    await prisma.dianTestMatrixRun.update({
        where: { id: runId },
        data: { status: "running", finishedAt: null, cancelRequested: false, passResult: null, errorMessage: null },
    });

    runDianTestMatrixWorker({ runId, apiKey, testSetId: run.testSetId, isRetry: true }).catch((error) => {
        console.error(`[dian-test-matrix] retry worker failed for run ${runId}:`, error);
    });

    return getDianTestMatrixRun({ runId });
};

/**
 * Recovers runs orphaned by a server restart (a deploy, a crash) - the
 * worker is a fire-and-forget async function tied to the process that
 * started it (see startDianTestMatrixRun's own comment), so a "pending" or
 * "running" run has no worker left to ever finish it once the process
 * that held it is gone. Without this, such a run stays "En curso" forever
 * - the self-service panel has no way to cancel it either, since
 * cancelRequested is also only checked by that same dead worker - leaving
 * a real customer stuck with no self-service recovery path at all.
 *
 * Call once at server startup (see server.js), same pattern as
 * runSubscriptionReconciliation - anything still "pending"/"running" at
 * that point can only be left over from before this process existed.
 */
export const reconcileOrphanedDianTestMatrixRuns = async () => {
    const orphaned = await prisma.dianTestMatrixRun.findMany({ where: { status: { in: ["pending", "running"] } } });
    for (const run of orphaned) {
        await prisma.dianTestMatrixRun.update({
            where: { id: run.id },
            data: {
                status: "failed",
                finishedAt: new Date(),
                errorMessage: "El servidor se reinició mientras esta prueba estaba en curso. Por favor, inicia una nueva prueba de habilitación.",
            },
        });
        await sendRunFinishedNotification(run.id);
    }
    return { recovered: orphaned.length };
};
