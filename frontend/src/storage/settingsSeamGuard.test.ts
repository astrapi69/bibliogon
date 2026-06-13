/**
 * Static source-scan guard for #107: no component/hook/page may call
 * the raw ``api.settings.*`` client directly — settings reads/writes
 * go through the ``getStorage()`` seam so they work in Dexie mode.
 *
 * Background: ``guardedFetch`` rejects raw ``/api`` calls on the
 * backendless build BEFORE any network request fires, so the offline
 * E2E's ``/api`` hard gate cannot see them — the result is SILENT
 * offline degradation (#106 was the user-visible instance: the
 * grid/list view switcher rolled back its own toggle). Route
 * interception cannot catch never-fired requests; this source scan
 * can.
 *
 * The allowlist below carries the audited Category-B/C call sites
 * (the API implementation itself + genuinely backend-only surfaces
 * that are mode-guarded or never mount offline). Adding a NEW direct
 * ``api.settings`` caller fails this test: either route it through
 * ``getStorage().settings`` (the default), or — for genuinely
 * backend-only data — guard it on the storage mode and extend the
 * allowlist with a justification comment.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "..");

/** Audited Category-B/C files (paths relative to ``src/``). */
const ALLOWLIST = new Set([
    // Category B — the API implementation layer itself.
    "api/client.ts",
    "storage/api-storage.ts",
    "storage/types.ts",
    // Category C — backend-only surfaces, audited 2026-06-12 (#107):
    // the backend import wizard only mounts in API mode (#82);
    // addPenName has no seam equivalent.
    "components/import-wizard/steps/AuthorPicker.tsx",
    // getPlugin("export") is manuscripta-passthrough data; the call
    // sits behind a getStorage().mode === "dexie" guard.
    "components/ExportForm.tsx",
    // Plugin-settings panel inside the Plugins tab, which is hidden
    // in Dexie mode (#96).
    "components/medium-import/MediumImportSettings.tsx",
    // listPlugins is mode-guarded (#96); the plugin CRUD sits inside
    // the offline-hidden Plugins tab.
    "pages/Settings.tsx",
]);

function collectSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectSourceFiles(full));
            continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.test\.(ts|tsx)$|\.d\.ts$/.test(entry.name)) continue;
        out.push(full);
    }
    return out;
}

describe("settings seam guard (#107)", () => {
    it("no direct api.settings.* callers outside the audited allowlist", () => {
        const offenders: string[] = [];
        for (const file of collectSourceFiles(SRC_ROOT)) {
            const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");
            if (ALLOWLIST.has(rel)) continue;
            const source = fs.readFileSync(file, "utf-8");
            // Match both single-line ``api.settings.getApp`` and the
            // prettier-split ``api.settings\n    .getApp`` shape, but
            // ignore mentions inside comments referencing the rule.
            const code = source
                .split("\n")
                .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
                .join("\n");
            if (/\bapi\.settings\b/.test(code)) {
                offenders.push(rel);
            }
        }
        expect(
            offenders,
            `direct api.settings caller(s) outside the seam: ${offenders.join(", ")} — ` +
                "route through getStorage().settings (see #106/#107) or " +
                "mode-guard + allowlist with justification",
        ).toEqual([]);
    });
});
