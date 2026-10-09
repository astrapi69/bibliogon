/**
 * Parity pin for the seeded article-platform schemas (#1015).
 *
 * `backend/app/data/platform_schemas.yaml` is the source of truth and the
 * backend path still serves it, so this reads the YAML and compares rather
 * than restating the eight platforms in a test and pinning the copy to
 * itself. `make verify-seed-drift` covers the generator's byte output; this
 * covers the meaning, which is the part a reader needs to trust.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { SEED_ARTICLE_PLATFORMS } from "./index";

const YAML_PATH = path.resolve(
    __dirname,
    "../../../../backend/app/data/platform_schemas.yaml",
);

/** Top-level platform slugs, read without a YAML parser: the file's
 *  platform entries are the only lines starting at column zero with a
 *  `slug:` and nothing after the colon. */
function platformSlugs(): string[] {
    return fs
        .readFileSync(YAML_PATH, "utf-8")
        .split("\n")
        .filter((line) => /^[a-z][a-z0-9_]*:\s*$/.test(line))
        .map((line) => line.replace(":", "").trim());
}

describe("SEED_ARTICLE_PLATFORMS", () => {
    it("covers every platform the YAML declares", () => {
        expect(Object.keys(SEED_ARTICLE_PLATFORMS).sort()).toEqual(platformSlugs().sort());
    });

    it("carries the API response shape, not the raw YAML", () => {
        // The generator passes each entry through PlatformSchemaOut, so the
        // optional fields are present-and-null rather than absent - which is
        // what the form renderer and the validator read.
        for (const [slug, schema] of Object.entries(SEED_ARTICLE_PLATFORMS)) {
            expect(typeof schema.display_name, slug).toBe("string");
            expect(Array.isArray(schema.required_metadata), slug).toBe(true);
            expect(Array.isArray(schema.optional_metadata), slug).toBe(true);
            expect(schema, slug).toHaveProperty("max_tags");
            expect(schema, slug).toHaveProperty("max_chars_per_post");
            expect(typeof schema.publishing_method, slug).toBe("string");
        }
    });
});
