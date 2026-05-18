/**
 * Live-dev smoke for USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (C4).
 *
 * Sister to PLUGIN-COMICS-E2E-SMOKE-01: pytest with TestClient
 * masks the operational class this rule closes (the conftest
 * tmpdir-overlay is empty, so the migration trivially no-ops
 * and the merge falls through to the full project list). This
 * spec runs against the actual uvicorn process so:
 *
 * 1. The live-stack /api/system/info reports the post-migration
 *    state — comics IS in the plugin list.
 * 2. The live-stack /api/comics/info responds 200 — comics is
 *    actually loaded + its route mounted.
 * 3. The user-overlay file on disk reflects the migration —
 *    plugins.enabled contains "comics" (the migration persisted).
 *
 * This is a POSITIVE state check, not a stale-overlay simulation.
 * Simulating a stale overlay would require restarting the dev
 * server mid-spec, which the Playwright framework doesn't
 * orchestrate. The 3 integration tests in
 * backend/tests/test_user_overlay_migration_lifespan.py cover the
 * stale-overlay-and-restart path via TestClient. This spec is
 * the live-stack check that the SHIPPED state is healthy.
 */

import {test, expect} from "../fixtures/base";
import {readFileSync, existsSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";

const API = "http://localhost:8000/api";

/** Minimal YAML parser for the user-overlay's plugins.enabled +
 *  plugins.disabled lists. Avoids a js-yaml dependency for a
 *  single spec — the overlay shape is stable + simple.
 *
 *  Scopes parsing to the top-level ``plugins:`` block to avoid
 *  matching sibling keys like ``ai.enabled: true`` or
 *  ``donations.enabled: true``. */
function parsePluginsLists(raw: string): {enabled: string[]; disabled: string[]} {
    const lines = raw.split("\n");
    const result = {enabled: [] as string[], disabled: [] as string[]};
    let inPluginsBlock = false;
    let currentList: "enabled" | "disabled" | null = null;
    for (const line of lines) {
        // Top-level block boundary: matches "plugins:" or any other
        // top-level key.
        if (/^[a-z_][a-z0-9_]*:\s*$/.test(line)) {
            inPluginsBlock = line.startsWith("plugins:");
            currentList = null;
            continue;
        }
        if (!inPluginsBlock) continue;
        // List header inside the plugins: block (2-space indent).
        const headerMatch = line.match(/^  (enabled|disabled):\s*(\[.*\])?\s*$/);
        if (headerMatch) {
            const name = headerMatch[1] as "enabled" | "disabled";
            // Inline form: enabled: [a, b, c]
            const inline = headerMatch[2];
            if (inline) {
                result[name] = inline
                    .replace(/[\[\]]/g, "")
                    .split(",")
                    .map((s) => s.trim().replace(/['"]/g, ""))
                    .filter(Boolean);
                currentList = null;
            } else {
                currentList = name;
            }
            continue;
        }
        // List item (4+ space indent, dash-prefixed).
        if (currentList) {
            const itemMatch = line.match(/^    -\s+(.+)$/);
            if (itemMatch) {
                result[currentList].push(itemMatch[1].trim().replace(/['"]/g, ""));
                continue;
            }
            // Any other shape (key: value, blank line) ends the list.
            currentList = null;
        }
    }
    return result;
}

test.describe("User-overlay plugin-enable migration (live-dev)", () => {
    test("backend reports comics in the discovered plugin list", async ({page: _page}) => {
        // page param required by Playwright fixture; not used here.
        const resp = await fetch(`${API}/settings/plugins/discovered`);
        expect(resp.status).toBe(200);
        const plugins = (await resp.json()) as Array<{
            name: string;
            enabled: boolean;
            loaded: boolean;
        }>;
        const comics = plugins.find((p) => p.name === "comics");
        expect(comics).toBeDefined();
        expect(comics!.enabled).toBe(true);
        expect(comics!.loaded).toBe(true);
    });

    test("/api/comics/info responds 200 from the live stack", async () => {
        const resp = await fetch(`${API}/comics/info`);
        expect(resp.status).toBe(200);
        const body = (await resp.json()) as {name: string; version: string};
        expect(body.name).toBe("comics");
        expect(body.version).toBe("1.0.0");
    });

    test("user-overlay app.yaml on disk has comics in plugins.enabled", () => {
        // The local-dev user-overlay path. On Linux this is
        // ~/.local/share/bibliogon/config/app.yaml. If the file
        // doesn't exist (fresh install before any Settings UI
        // write), this assertion is skipped — the migration is
        // only relevant when an overlay exists.
        const overlayPath = join(
            homedir(),
            ".local",
            "share",
            "bibliogon",
            "config",
            "app.yaml",
        );
        if (!existsSync(overlayPath)) {
            test.skip(
                true,
                `No user-overlay at ${overlayPath} — fresh install, ` +
                `migration not relevant.`,
            );
            return;
        }
        const raw = readFileSync(overlayPath, "utf-8");
        const {enabled, disabled} = parsePluginsLists(raw);
        // If the user explicitly disabled comics, the migration
        // respects that — comics stays out of enabled.
        if (disabled.includes("comics")) {
            expect(enabled).not.toContain("comics");
            return;
        }
        // Otherwise the migration MUST have appended comics to the
        // user-overlay so the running server activates it.
        expect(enabled).toContain("comics");
    });
});
