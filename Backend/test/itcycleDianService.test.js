import test from "node:test";
import assert from "node:assert/strict";
import { listItcycleFirmaPassValidations, refreshItcycleDocumentStatus, retryItcycleInvoiceSend } from "../services/itcycleDian.service.js";

const withItcycleEnv = async (fn) => {
    const previousUrl = process.env.ITCYCLE_API_URL;
    const previousKey = process.env.ITCYCLE_ADMIN_API_KEY;

    process.env.ITCYCLE_API_URL = "https://itcycle.example.test";
    process.env.ITCYCLE_ADMIN_API_KEY = "admin-key";

    const originalFetch = global.fetch;
    try {
        return await fn();
    } finally {
        global.fetch = originalFetch;
        if (previousUrl === undefined) delete process.env.ITCYCLE_API_URL;
        else process.env.ITCYCLE_API_URL = previousUrl;
        if (previousKey === undefined) delete process.env.ITCYCLE_ADMIN_API_KEY;
        else process.env.ITCYCLE_ADMIN_API_KEY = previousKey;
    }
};

test("listItcycleFirmaPassValidations retries once after a 429 and succeeds", async () => {
    const previousUrl = process.env.ITCYCLE_API_URL;
    const previousKey = process.env.ITCYCLE_ADMIN_API_KEY;
    const previousTimeout = process.env.ITCYCLE_TIMEOUT_MS;

    process.env.ITCYCLE_API_URL = "https://itcycle.example.test";
    process.env.ITCYCLE_ADMIN_API_KEY = "admin-key";
    process.env.ITCYCLE_TIMEOUT_MS = "5000";

    const originalFetch = global.fetch;
    const calls = [];

    try {
        global.fetch = async (url, init) => {
            calls.push({ url, init });

            if (calls.length === 1) {
                return new Response(JSON.stringify({ message: "Too many requests" }), {
                    status: 429,
                    headers: { "Content-Type": "application/json", "Retry-After": "0" },
                });
            }

            return new Response(JSON.stringify({ data: [{ uuid: "abc-123", nombre: "Cliente prueba" }], message: "ok" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };

        const result = await listItcycleFirmaPassValidations({ perPage: 20 });

        assert.equal(calls.length, 2);
        assert.equal(result.data[0].uuid, "abc-123");
    } finally {
        global.fetch = originalFetch;

        if (previousUrl === undefined) delete process.env.ITCYCLE_API_URL;
        else process.env.ITCYCLE_API_URL = previousUrl;

        if (previousKey === undefined) delete process.env.ITCYCLE_ADMIN_API_KEY;
        else process.env.ITCYCLE_ADMIN_API_KEY = previousKey;

        if (previousTimeout === undefined) delete process.env.ITCYCLE_TIMEOUT_MS;
        else process.env.ITCYCLE_TIMEOUT_MS = previousTimeout;
    }
});

// Regression test for a real bug found 2026-08-29: request() used to send
// Content-Type: application/json on EVERY call regardless of whether a body
// was actually sent. itcycle-api-dian (Fastify) rejects any request carrying
// that header with no body ("Body cannot be empty when content-type is set
// to 'application/json'"), which silently broke every bodyless POST -
// retry-send for invoices/credit-notes/support-documents and refresh-status.
test("a bodyless POST does not declare a JSON content-type", async () => {
    await withItcycleEnv(async () => {
        let capturedInit;
        global.fetch = async (url, init) => {
            capturedInit = init;
            return new Response(JSON.stringify({ status: "accepted" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };

        await refreshItcycleDocumentStatus({ companyId: "company-1", documentType: "invoices", id: "doc-1" });

        assert.equal(capturedInit.body, undefined);
        assert.equal(capturedInit.headers["Content-Type"], undefined);
    });
});

test("a POST with a send option declares content-type and carries it in the body", async () => {
    await withItcycleEnv(async () => {
        let capturedInit;
        global.fetch = async (url, init) => {
            capturedInit = init;
            return new Response(JSON.stringify({ status: "accepted" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };

        await retryItcycleInvoiceSend({ apiKey: "company-key", id: "doc-1", send: { method: "SendTestSetAsync", testSetId: "test-set-1" } });

        assert.equal(capturedInit.headers["Content-Type"], "application/json");
        assert.deepEqual(JSON.parse(capturedInit.body), { send: { method: "SendTestSetAsync", testSetId: "test-set-1" } });
    });
});
