import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedTargets, describeAppMap, NAVIGATION_TARGETS } from "../services/assistantNavigation.js";
import { sanitizeRespondArgs, buildSystemPrompt } from "../services/assistantAgent.service.js";

// A team member whose role only grants these modules - the allowed set is
// built from an explicit list here so the test never touches the database.
const allowedFor = (keys) => new Set(keys);

test("owner and solo users can be sent anywhere", async () => {
    const allowed = await getAllowedTargets({ isTeamMember: false });
    assert.equal(allowed.size, Object.keys(NAVIGATION_TARGETS).length);
});

test("navigation and highlights outside the role are dropped", () => {
    const allowed = allowedFor(["dashboard", "orders", "customers"]);
    const blocked = sanitizeRespondArgs(
        { message: "Ve a contabilidad", navigate_to: "accounting.journal", highlight: "accounting-vouchers-new" },
        { allowedTargets: allowed }
    );
    assert.equal(blocked.actions, null);

    const ok = sanitizeRespondArgs({ message: "Ve a ventas", navigate_to: "orders" }, { allowedTargets: allowed });
    assert.equal(ok.actions.navigate.path, "/orders");
});

test("the app map only lists allowed screens and tells the model to refer the person to the owner", () => {
    const map = describeAppMap({ module: "orders", allowed: allowedFor(["dashboard", "orders"]) });
    assert.match(map, /- orders:/);
    assert.doesNotMatch(map, /accounting|integrations|fiscal-setup/);
    assert.match(map, /dueño de la cuenta/);
    // Unrestricted map has no role note.
    assert.doesNotMatch(describeAppMap({ module: "orders" }), /dueño de la cuenta/);
    assert.doesNotMatch(buildSystemPrompt({ locale: "es", module: "orders", allowedTargets: allowedFor(["orders"]) }), /- finance:/);
});
