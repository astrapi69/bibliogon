/**
 * Static source-scan guard: no component/hook/page may call the raw
 * ``api.*`` client directly for a namespace that has a ``getStorage()``
 * seam equivalent — those reads/writes go through the seam so they work
 * in Dexie mode. Started as the ``api.settings`` guard (#107); each PWA
 * parity port (epic #727) adds its own namespace to ``GUARDED`` below.
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
 * caller for a guarded namespace fails this test: either route it
 * through the seam (the default), or — for genuinely backend-only
 * data — guard it on the storage mode and extend the allowlist with a
 * justification comment.
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
    "components/export/ExportForm.tsx",
    // Plugin-settings panel inside the Plugins tab, which is hidden
    // in Dexie mode (#96).
    "components/medium-import/MediumImportSettings.tsx",
    // listPlugins is mode-guarded (#96); the plugin CRUD sits inside
    // the offline-hidden Plugins tab.
    "pages/Settings.tsx",
]);

/** The api implementation + the seam itself: allowed for every namespace. */
const IMPLEMENTATION_LAYER: ReadonlySet<string> = new Set([
    "api/client.ts",
    "storage/api-storage.ts",
    "storage/types.ts",
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

/** One guarded api namespace: what to look for, and what to do instead. */
interface GuardedNamespace {
    /** Namespace label for the test name. */
    label: string;
    /**
     * Matches the forbidden direct call in comment-stripped source. Both
     * the single-line (``api.settings.getApp``) and the prettier-split
     * (``api.settings\n    .getApp``) shapes must match, so the pattern
     * stops at the namespace and does not spell out the method.
     */
    pattern: RegExp;
    /** The seam member to use instead, named in the failure message. */
    remedy: string;
    /** Files audited as legitimate direct callers, relative to ``src/``. */
    allowlist: ReadonlySet<string>;
}

const GUARDED: readonly GuardedNamespace[] = [
    {
        label: "api.settings",
        pattern: /\bapi\.settings\b/,
        remedy: "getStorage().settings (see #106/#107)",
        allowlist: ALLOWLIST,
    },
    {
        // Comments admin (list / trash lifecycle / reclassify) reads and
        // writes through getStorage().comments; #729 closed the last gap.
        label: "api.comments",
        pattern: /\bapi\.comments\b/,
        remedy: "getStorage().comments (see #729)",
        allowlist: IMPLEMENTATION_LAYER,
    },
    {
        // Book templates: list/create/delete plus the create-from-template
        // instantiation, all seam-backed since #730. `api.chapterTemplates`
        // is a DIFFERENT namespace and not ported yet (#731), so the
        // pattern stops at a word boundary after `templates`.
        label: "api.templates",
        pattern: /\bapi\.templates\b/,
        remedy: "getStorage().templates (see #730)",
        allowlist: IMPLEMENTATION_LAYER,
    },
    {
        label: "api.books.createFromTemplate",
        pattern: /\bapi\.books\s*\.\s*createFromTemplate\b/,
        remedy: "getStorage().books.createFromTemplate (see #730)",
        allowlist: IMPLEMENTATION_LAYER,
    },
    {
        // Chapter version history + snapshots. Guarded per-method rather
        // than all of api.chapters: the plain chapter CRUD has its own
        // seam members but several callers still go direct (epic #727).
        label: "api.chapters version methods",
        pattern:
            /\bapi\.chapters\s*\.\s*(listVersions|getVersion|restoreVersion|createSnapshot|diffVersion|deleteVersion)\b/,
        remedy: "getStorage().chapters.<same method> (see #728)",
        allowlist: IMPLEMENTATION_LAYER,
    },
    {
        // The article-scoped comment read the editor panel uses. Guarded
        // on its own rather than all of api.articles: the remaining
        // api.articles surfaces are not ported yet (epic #727).
        label: "api.articles.getComments",
        pattern: /\bapi\.articles\s*\.\s*getComments\b/,
        remedy: "getStorage().articles.getComments (see #729)",
        allowlist: IMPLEMENTATION_LAYER,
    },
];

describe("storage seam guard (#107, #727)", () => {
    for (const guarded of GUARDED) {
        it(`no direct ${guarded.label} callers outside the audited allowlist`, () => {
            const offenders: string[] = [];
            for (const file of collectSourceFiles(SRC_ROOT)) {
                const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");
                if (guarded.allowlist.has(rel)) continue;
                const source = fs.readFileSync(file, "utf-8");
                // Mentions inside comments (including this rule's own
                // references to it) are not call sites.
                const code = source
                    .split("\n")
                    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
                    .join("\n");
                if (guarded.pattern.test(code)) {
                    offenders.push(rel);
                }
            }
            expect(
                offenders,
                `direct ${guarded.label} caller(s) outside the seam: ` +
                    `${offenders.join(", ")} — route through ${guarded.remedy} ` +
                    "or mode-guard + allowlist with justification",
            ).toEqual([]);
        });
    }
});
