/**
 * Static source-scan guard: every IndexedDB database name goes through
 * ``storageDbName`` (#991).
 *
 * GitHub Pages serves production at ``astrapi69.github.io/bibliogon/`` and
 * the preview build at ``astrapi69.github.io/bibliogon-preview/``. An
 * origin is scheme, host and port - the path is not part of it - so those
 * two paths are one origin with one IndexedDB. A database opened under a
 * bare literal name is therefore the SAME database in both builds, and a
 * schema change shipped to the preview can leave production state the
 * stable build cannot open.
 *
 * ``storageDbName`` suffixes the name in the preview build and returns it
 * unchanged everywhere else. The failure it prevents is silent in every
 * environment a test runs in - Vitest, the dev server and the production
 * deploy all resolve ``__IS_PREVIEW__`` to false - so the scan is the only
 * thing that catches a new database added with a bare name.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "..", "..");

/** Opens a database: ``new Dexie("x")`` or ``super("x")`` in a subclass. */
const BARE_NAME = /(?:new\s+Dexie|super)\(\s*(["'`])([^"'`]+)\1/g;

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

describe("IndexedDB database names", () => {
    it("are never opened with a bare string literal", () => {
        const offenders: string[] = [];
        for (const file of collectSourceFiles(SRC_ROOT)) {
            const source = fs.readFileSync(file, "utf8");
            if (!/from ["']dexie["']/.test(source)) continue;
            for (const match of source.matchAll(BARE_NAME)) {
                offenders.push(
                    `${path.relative(SRC_ROOT, file)}: opens "${match[2]}" without storageDbName()`,
                );
            }
        }
        expect(offenders).toEqual([]);
    });

    it("cover every database the app opens", () => {
        const opened: string[] = [];
        for (const file of collectSourceFiles(SRC_ROOT)) {
            const source = fs.readFileSync(file, "utf8");
            if (!/from ["']dexie["']/.test(source)) continue;
            for (const match of source.matchAll(/storageDbName\(\s*["'`]([^"'`]+)["'`]/g)) {
                opened.push(match[1]);
            }
        }
        // Drops to two if a database loses its wrapper, which the first
        // case would also catch - this one says WHICH stores are expected,
        // so a fourth database added later shows up as a deliberate edit
        // here rather than slipping in unnoticed.
        expect(opened.sort()).toEqual([
            "bibliogon",
            "bibliogon-backup-history",
            "bibliogon-offline",
        ]);
    });
});
