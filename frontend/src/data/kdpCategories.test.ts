/**
 * Parity pin for the client KDP category catalog (#738).
 *
 * The Python constant in `bibliogon_kdp/routes.py` is the authority -
 * the backend path still serves it - so this reads that file and
 * compares, rather than restating the 26 names a second time in a test
 * and pinning the copy to itself.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { KDP_CATEGORIES } from "./kdpCategories";

const ROUTES = path.resolve(
    __dirname,
    "../../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py",
);

function backendCategories(): string[] {
    const source = fs.readFileSync(ROUTES, "utf-8");
    const block = source.match(/KDP_CATEGORIES: list\[str\] = \[([\s\S]*?)\n\]/);
    if (!block) throw new Error("KDP_CATEGORIES not found in routes.py");
    return [...block[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
}

describe("KDP_CATEGORIES", () => {
    it("matches the backend catalog name for name", () => {
        expect(KDP_CATEGORIES).toEqual(backendCategories());
    });

    it("carries the 26 Amazon-canonical names", () => {
        expect(KDP_CATEGORIES).toHaveLength(26);
        expect(new Set(KDP_CATEGORIES).size).toBe(26);
    });
});
