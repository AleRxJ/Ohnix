import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import { prisma } from "../db/prisma.js";
import { issueAuthTokens } from "../utils/authTokens.js";

const EMAIL = "alejandrovallejo10@outlook.com";
const BASE_URL = "http://localhost:3001/api/v1";

const call = async (token, method, path, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }
    return { status: res.status, json };
};

const section = (title) => console.log(`\n=== ${title} ===`);

const run = async () => {
    await prisma.$connect();
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) throw new Error("Seed user not found - run seedAccountingAudit.js first.");

    const { accessToken } = await issueAuthTokens(user.id);
    console.log("Issued access token for", EMAIL);

    section("GET /accounting/status");
    console.log(JSON.stringify((await call(accessToken, "GET", "/accounting/status")).json, null, 2));

    section("GET /accounting/chart-of-accounts");
    const coa = await call(accessToken, "GET", "/accounting/chart-of-accounts");
    console.log(JSON.stringify(coa.json.data, null, 2));

    section("GET /accounting/journal-entries (last 90 days)");
    const from90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const journal = await call(accessToken, "GET", `/accounting/journal-entries?from=${from90}&to=${to}`);
    console.log(`entries: ${journal.json.data?.length}`);
    for (const e of journal.json.data || []) {
        const debit = e.lines.reduce((s, l) => s + l.debit, 0);
        const credit = e.lines.reduce((s, l) => s + l.credit, 0);
        console.log(`  ${e.entry_date.slice(0, 10)} [${e.source_type}] ${e.description} debit=${debit} credit=${credit} balanced=${Math.abs(debit - credit) < 0.01}`);
    }

    section("GET /accounting/chart-of-accounts/:id/ledger (Clientes 1305)");
    const clientes = coa.json.data.find((a) => a.code === "1305");
    if (clientes) {
        const ledger = await call(accessToken, "GET", `/accounting/chart-of-accounts/${clientes._id}/ledger?from=${from90}&to=${to}`);
        console.log(JSON.stringify(ledger.json.data, null, 2));
    }

    section("GET /accounting/reports/trial-balance (this year)");
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const trial = await call(accessToken, "GET", `/accounting/reports/trial-balance?from=${yearStart}&to=${to}`);
    console.log(JSON.stringify(trial.json.data, null, 2));
    const totalDebit = (trial.json.data || []).reduce((s, r) => s + r.debit, 0);
    const totalCredit = (trial.json.data || []).reduce((s, r) => s + r.credit, 0);
    console.log(`TOTALS debit=${totalDebit} credit=${totalCredit} balanced=${Math.abs(totalDebit - totalCredit) < 0.01}`);

    section("GET /accounting/reports/income-statement (this year)");
    const income = await call(accessToken, "GET", `/accounting/reports/income-statement?from=${yearStart}&to=${to}`);
    console.log(JSON.stringify(income.json.data, null, 2));

    section("GET /accounting/reports/balance-sheet (today)");
    const balance = await call(accessToken, "GET", `/accounting/reports/balance-sheet?as_of=${to}`);
    console.log(JSON.stringify(balance.json.data, null, 2));

    section("GET /accounting/periods");
    const periods = await call(accessToken, "GET", "/accounting/periods");
    console.log(JSON.stringify(periods.json.data, null, 2));

    const closeable = (periods.json.data || []).find((p) => p.status === "open" && !(p.year === new Date().getFullYear() && p.month === new Date().getMonth() + 1));
    if (closeable) {
        section(`POST /accounting/periods/${closeable._id}/close (${closeable.month}/${closeable.year})`);
        const closeRes = await call(accessToken, "POST", `/accounting/periods/${closeable._id}/close`);
        console.log(closeRes.status, JSON.stringify(closeRes.json, null, 2));

        section("GET /accounting/reports/income-statement (closed month only) - should still show real figures");
        const closedFrom = `${closeable.year}-${String(closeable.month).padStart(2, "0")}-01`;
        const closedTo = new Date(closeable.year, closeable.month, 0).toISOString().slice(0, 10);
        const closedIncome = await call(accessToken, "GET", `/accounting/reports/income-statement?from=${closedFrom}&to=${closedTo}`);
        console.log(JSON.stringify(closedIncome.json.data, null, 2));

        section("GET /accounting/reports/balance-sheet (as of end of closed month) - equity should include retained earnings now");
        const balanceAfterClose = await call(accessToken, "GET", `/accounting/reports/balance-sheet?as_of=${closedTo}`);
        console.log(JSON.stringify(balanceAfterClose.json.data, null, 2));

        section("GET /accounting/reports/balance-sheet (today, AFTER close) - should be unchanged vs before close");
        const balanceToday2 = await call(accessToken, "GET", `/accounting/reports/balance-sheet?as_of=${to}`);
        console.log(JSON.stringify(balanceToday2.json.data, null, 2));
        console.log("total_equity before close:", balance.json.data.total_equity, "| total_equity after close:", balanceToday2.json.data.total_equity);
    } else {
        console.log("No closeable past period found.");
    }

    section("POST /accounting/chart-of-accounts (create a custom account)");
    const created = await call(accessToken, "POST", "/accounting/chart-of-accounts", {
        code: "5195",
        name: "Gastos de auditoria",
        account_type: "expense",
    });
    console.log(created.status, JSON.stringify(created.json, null, 2));

    if (created.status === 201) {
        section("PATCH /accounting/chart-of-accounts/:id/active (deactivate it)");
        const deactivated = await call(accessToken, "PATCH", `/accounting/chart-of-accounts/${created.json.data._id}/active`, { is_active: false });
        console.log(deactivated.status, JSON.stringify(deactivated.json, null, 2));
    }

    section("GET /company/me (tax config)");
    const company = await call(accessToken, "GET", "/company/me");
    console.log(JSON.stringify(company.json.data, null, 2));

    section("PATCH /company/me (update withholding/ICA config)");
    const updated = await call(accessToken, "PATCH", "/company/me", {
        isWithholdingAgent: true,
        icaMunicipalityCode: "11001",
        icaActivityCode: "4711",
        icaRatePerThousand: 6.9,
    });
    console.log(updated.status, JSON.stringify(updated.json?.data ? {
        isWithholdingAgent: updated.json.data.isWithholdingAgent,
        withholdingAgentEffectiveFrom: updated.json.data.withholdingAgentEffectiveFrom,
        icaMunicipalityCode: updated.json.data.icaMunicipalityCode,
        icaActivityCode: updated.json.data.icaActivityCode,
        icaRatePerThousand: updated.json.data.icaRatePerThousand,
    } : updated.json, null, 2));

    section("GET /reports/vat (cross-check the VAT report referenced from Impuestos tab)");
    const vat = await call(accessToken, "GET", `/reports/vat?start_date=${yearStart}&end_date=${to}`);
    console.log(vat.status, JSON.stringify(vat.json.data?.summary, null, 2));

    section("GET /reports/cartera (cross-check the Cartera report referenced from Resumen tab)");
    const cartera = await call(accessToken, "GET", `/reports/cartera?start_date=${yearStart}&end_date=${to}`);
    console.log(cartera.status, JSON.stringify(cartera.json.data?.receivables?.summary, null, 2));

    console.log("\nDONE");
};

run()
    .catch((err) => {
        console.error("Audit failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
