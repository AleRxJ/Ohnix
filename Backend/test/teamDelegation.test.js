import test from "node:test";
import assert from "node:assert/strict";
import { grantWithin, grantFromInput, assertScopeWithinActor } from "../services/teamDelegation.service.js";

const coAdmin = grantFromInput({
    permissions: { team: "admin", orders: "edit", customers: "edit", products: "view" },
    capabilities: { salesMaxDiscountPct: 10, reportsExport: true },
});

test("a co-admin can hand out anything up to their own role", () => {
    assert.ok(grantWithin(coAdmin, grantFromInput({ permissions: { orders: "edit", products: "view" }, capabilities: { salesMaxDiscountPct: 5 } })));
    assert.ok(grantWithin(coAdmin, grantFromInput({ permissions: {}, capabilities: {} })));
});

test("a co-admin can't grant a higher module level, a module they lack, or a capability they lack", () => {
    assert.equal(grantWithin(coAdmin, grantFromInput({ permissions: { orders: "admin" } })), false);
    assert.equal(grantWithin(coAdmin, grantFromInput({ permissions: { accounting: "view" } })), false);
    assert.equal(grantWithin(coAdmin, grantFromInput({ capabilities: { catalogViewCosts: true } })), false);
    assert.equal(grantWithin(coAdmin, grantFromInput({ capabilities: { salesMaxDiscountPct: 20 } })), false);
    assert.equal(grantWithin(coAdmin, grantFromInput({ capabilities: { salesPriceOverride: true } })), false);
});

test("free pricing covers any discount cap", () => {
    const pricer = grantFromInput({ permissions: { team: "edit" }, capabilities: { salesPriceOverride: true } });
    assert.ok(grantWithin(pricer, grantFromInput({ capabilities: { salesMaxDiscountPct: 50 } })));
});

test("a restricted-scope co-admin can only assign their own locations", () => {
    const req = { team: { ownerId: "owner" }, user: { actorId: "m1", posScopeAll: false, posScopeIds: ["pos-a", "pos-b"] } };
    assert.doesNotThrow(() => assertScopeWithinActor(req, { scopeAll: false, pointOfSaleIds: ["pos-a"] }));
    assert.throws(() => assertScopeWithinActor(req, { scopeAll: false, pointOfSaleIds: ["pos-c"] }), (e) => e.statusCode === 403);
    assert.throws(() => assertScopeWithinActor(req, { scopeAll: true }), (e) => e.statusCode === 403);
    const owner = { team: { ownerId: "owner" }, user: { actorId: "owner" } };
    assert.doesNotThrow(() => assertScopeWithinActor(owner, { scopeAll: true }));
});
