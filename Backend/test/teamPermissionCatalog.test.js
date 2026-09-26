import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    MODULE_KEYS,
    COUPLED_MODULES,
    MODULE_LABELS_ES,
    DEFAULT_MEMBER_ROLE_PERMISSIONS,
    OWNER_ROLE_PERMISSIONS,
    getPermissionCatalog,
} from "../middleware/team.permissions.js";

// Guards against the drift that once left "pointsOfSale" out of the role
// editor (reset to "none" on every save) and "payroll" out of the 403 text.
const frontendSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../Frontend/src");
const hasFrontend = fs.existsSync(frontendSrc);

test("every module key has a Spanish 403 label", () => {
    for (const key of MODULE_KEYS) {
        assert.ok(MODULE_LABELS_ES[key], `missing MODULE_LABELS_ES.${key}`);
    }
});

test("default member role denies every module, owner role grants admin on every module", () => {
    assert.deepEqual(Object.keys(DEFAULT_MEMBER_ROLE_PERMISSIONS).sort(), [...MODULE_KEYS].sort());
    assert.ok(Object.values(DEFAULT_MEMBER_ROLE_PERMISSIONS).every((level) => level === "none"));
    assert.ok(Object.values(OWNER_ROLE_PERMISSIONS).every((level) => level === "admin"));
});

test("permission catalog lists every non-coupled module", () => {
    const catalog = getPermissionCatalog();
    assert.deepEqual(catalog.modules, MODULE_KEYS.filter((key) => !COUPLED_MODULES[key]));
    assert.deepEqual(catalog.levels, ["none", "view", "edit", "admin"]);
});

test("frontend fallback MODULE_KEYS mirrors the backend", { skip: !hasFrontend && "Frontend not present" }, () => {
    const source = fs.readFileSync(path.join(frontendSrc, "constants/teamModules.js"), "utf8");
    const block = source.match(/export const MODULE_KEYS = \[([\s\S]*?)\]/);
    assert.ok(block, "MODULE_KEYS not found in teamModules.js");
    const frontendKeys = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...frontendKeys].sort(), [...MODULE_KEYS].sort());
});

test("every grantable module has a team.module_* label in es and en", { skip: !hasFrontend && "Frontend not present" }, () => {
    for (const locale of ["es", "en"]) {
        const messages = JSON.parse(fs.readFileSync(path.join(frontendSrc, `locales/${locale}/common.json`), "utf8"));
        for (const key of getPermissionCatalog().modules) {
            assert.ok(messages.team?.[`module_${key}`], `missing ${locale} team.module_${key}`);
        }
    }
});
