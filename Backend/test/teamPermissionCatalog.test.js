import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("module dependencies only reference real grantable modules", () => {
    const { modules, dependencies } = getPermissionCatalog();
    for (const [moduleKey, deps] of Object.entries(dependencies)) {
        assert.ok(modules.includes(moduleKey), `unknown module ${moduleKey}`);
        for (const dep of deps) assert.ok(modules.includes(dep), `${moduleKey} depends on unknown ${dep}`);
    }
});

test("role templates use real modules, include their dependencies and have labels", { skip: !hasFrontend && "Frontend not present" }, async () => {
    const { ROLE_TEMPLATES } = await import(pathToFileURL(path.join(frontendSrc, "constants/roleTemplates.js")).href);
    const { modules, dependencies } = getPermissionCatalog();
    const messages = {
        es: JSON.parse(fs.readFileSync(path.join(frontendSrc, "locales/es/common.json"), "utf8")),
        en: JSON.parse(fs.readFileSync(path.join(frontendSrc, "locales/en/common.json"), "utf8")),
    };
    for (const template of ROLE_TEMPLATES) {
        for (const [moduleKey, level] of Object.entries(template.permissions)) {
            assert.ok(modules.includes(moduleKey), `${template.key}: unknown module ${moduleKey}`);
            assert.ok(["view", "edit", "admin"].includes(level), `${template.key}: bad level ${level}`);
            for (const dep of dependencies[moduleKey] || []) {
                assert.ok(template.permissions[dep], `${template.key}: ${moduleKey} needs ${dep}`);
            }
        }
        for (const locale of ["es", "en"]) {
            assert.ok(messages[locale].team?.[`template_${template.key}`], `missing ${locale} team.template_${template.key}`);
        }
    }
});
