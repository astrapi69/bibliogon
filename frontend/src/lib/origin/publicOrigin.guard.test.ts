/**
 * Static source scan: the public host appears in one file, not thirteen
 * (#1102).
 *
 * The host was written out in `index.html` (five times), `sitemap.xml`,
 * `robots.txt`, four components, the share section, and as a gate
 * parameter in the Makefile and the deploy workflow. A domain move had to
 * find all of them across five file types, and nothing would have failed
 * if it had missed one - the app would simply have advertised an address
 * it is not served from any more.
 *
 * `public-origin.json` is the source. This scan is what keeps it the only
 * one: a new literal is red here, with the module to use named in the
 * failure.
 *
 * Prose is not in scope. A sentence that names the host as a fact about
 * who runs the site is not a URL the app resolves, and rewriting it from
 * a template would make a legal page harder to read for no gain. The
 * allowlist below says which files those are and why.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import config from "../../../public-origin.json";

const FRONTEND_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");

/** The host alone: a literal carrying it is a literal to replace. */
const HOST = new URL(config.origin).host;

/**
 * Files that may name the host, and the reason each one may.
 *
 * Keep it short. "It is only a docblock" is a reason; "it was easier" is
 * not. A docblock explaining WHY an origin is shared has to name the
 * origin to be worth reading, and it ships nothing.
 */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
    [
        "frontend/public-origin.json",
        "The source itself.",
    ],
    [
        "frontend/public/privacy.html",
        "Prose: the host appears in a sentence naming who operates the " +
            "site, not in a URL the app resolves. Per #991 the legal pages " +
            "are the last step of a domain move, after the domain and HTTPS.",
    ],
    [
        "frontend/public/datenschutz.html",
        "The German twin of privacy.html, same reason.",
    ],
    [
        "frontend/src/lib/origin/sharedOrigin.ts",
        "Docblock: explains why a Pages origin is shared by naming it. " +
            "The code matches host SUFFIXES and carries no address.",
    ],
    [
        "frontend/src/lib/origin/storageNamespace.ts",
        "Docblock, same reason: it names the two deploys to explain why " +
            "their storage namespaces have to differ.",
    ],
    [
        "frontend/src/lib/origin/publicOrigin.ts",
        "Docblock: the module that replaced the literals describes what " +
            "they were.",
    ],
    [
        "frontend/src/lib/origin/publicOrigin.guard.test.ts",
        "This scan, which has to know the host to look for it.",
    ],
    [
        "frontend/src/lib/origin/sharedOrigin.test.ts",
        "Tests the shared-origin classifier, whose inputs are hostnames.",
    ],
    [
        "frontend/src/storage/guards/dexieDbNameGuard.test.ts",
        "Docblock: names the two deploys whose database names must differ.",
    ],
    [
        "frontend/src/components/ui/SharedOriginNote.test.tsx",
        "Renders the note for a shared host, so a shared host is its input.",
    ],
    [
        "frontend/src/storage/seed/seed-help-docs-de.json",
        "Generated from docs/help by `make generate-seed-data`. The host " +
            "appears in help PROSE; rewriting the help pages from a " +
            "template is #991's last step, not this guard's business.",
    ],
    [
        "frontend/src/storage/seed/seed-help-docs-en.json",
        "The English twin, same reason.",
    ],
]);

/** Live files, in the sense of shipped or gate-forming. */
const SCANNED: readonly string[] = [
    "frontend/index.html",
    "frontend/vite.config.ts",
    "Makefile",
    ".github/workflows/deploy-pages.yml",
    ...walk(path.join(FRONTEND_ROOT, "src")),
    ...walk(path.join(FRONTEND_ROOT, "public")),
].map((file) => path.relative(REPO_ROOT, path.resolve(REPO_ROOT, file)));

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(full));
            continue;
        }
        if (/\.(ts|tsx|html|xml|txt|json|css)$/.test(entry.name)) out.push(full);
    }
    return out;
}

describe("the public host is declared once", () => {
    it("appears in no shipped or gate-forming file outside the source", () => {
        const offenders: string[] = [];
        for (const file of SCANNED) {
            if (ALLOWLIST.has(file)) continue;
            const absolute = path.join(REPO_ROOT, file);
            if (!fs.existsSync(absolute)) continue;
            if (fs.readFileSync(absolute, "utf-8").includes(HOST)) offenders.push(file);
        }
        expect(
            offenders,
            `${offenders.length} file(s) carry "${HOST}" instead of reading it.\n` +
                `In the app: import { APP_URL, publicUrl } from "lib/origin/publicOrigin".\n` +
                `In a static file: a %PUBLIC_APP_URL% placeholder, resolved by ` +
                `the publicOrigin plugin in vite.config.ts.\n` +
                `In a script: scripts/public_origin.py.\n` +
                `Files: ${offenders.join(", ")}`,
        ).toEqual([]);
    });

    it("scans the files it claims to scan", () => {
        // A scan that silently covers nothing is the failure mode this
        // second assertion exists for: the walk must have found the
        // components the first assertion is about.
        expect(SCANNED).toContain("frontend/index.html");
        expect(SCANNED).toContain("frontend/vite.config.ts");
        expect(SCANNED).toContain("frontend/public/privacy.html");
        expect(SCANNED.some((f) => f.endsWith("ShareAppSection.tsx"))).toBe(true);
        expect(SCANNED.length).toBeGreaterThan(200);
    });
});
