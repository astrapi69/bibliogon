/**
 * Parity pins for the platform-metadata validator mirror (#747).
 *
 * The rules come from `app/services/platform_schema.py`, which still runs
 * on the backend path - so a divergence would mean the same publication is
 * legal in one storage mode and rejected in the other.
 */
import { describe, it, expect } from "vitest";

import { validatePlatformMetadata } from "./platformMetadata";

const MEDIUM = {
    display_name: "Medium",
    required_metadata: ["title", "tags"],
    optional_metadata: [],
    max_tags: 5,
    max_chars_per_post: null,
    publishing_method: "manual",
};

const X = {
    display_name: "X",
    required_metadata: ["body"],
    optional_metadata: [],
    max_tags: null,
    max_chars_per_post: 280,
    publishing_method: "manual",
};

describe("validatePlatformMetadata", () => {
    it("passes a complete payload", () => {
        expect(validatePlatformMetadata(MEDIUM, { title: "T", tags: ["a"] })).toEqual({
            valid: true,
            errors: [],
        });
    });

    it("passes an unknown platform, deliberately", () => {
        // The backend is permissive here on purpose: the user may publish to
        // a platform Bibliogon ships no schema for.
        expect(validatePlatformMetadata(undefined, {})).toEqual({ valid: true, errors: [] });
    });

    it("names every missing required field", () => {
        const result = validatePlatformMetadata(MEDIUM, {});
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
            "missing required field: title",
            "missing required field: tags",
        ]);
    });

    it("treats empty string, empty array and empty object as missing", () => {
        for (const empty of ["", [], {}]) {
            const result = validatePlatformMetadata(MEDIUM, { title: empty, tags: ["a"] });
            expect(result.errors, JSON.stringify(empty)).toContain(
                "missing required field: title",
            );
        }
        // Zero and false are values, not absences - the backend's check is
        // `is None or == "" or == [] or == {}`, which 0 and false fail.
        expect(validatePlatformMetadata(MEDIUM, { title: 0, tags: ["a"] }).valid).toBe(true);
        expect(validatePlatformMetadata(MEDIUM, { title: false, tags: ["a"] }).valid).toBe(true);
    });

    it("enforces the tag cap only when tags are present", () => {
        expect(
            validatePlatformMetadata(MEDIUM, { title: "T", tags: ["1", "2", "3", "4", "5", "6"] })
                .errors,
        ).toContain("tags exceed platform limit (6 > 5)");
        // No `tags` key at all is a missing-required-field case, not a cap one.
        expect(validatePlatformMetadata(MEDIUM, { title: "T" }).errors).toEqual([
            "missing required field: tags",
        ]);
    });

    it("enforces the character cap on the body", () => {
        const long = "x".repeat(281);
        expect(validatePlatformMetadata(X, { body: long }).errors).toEqual([
            "body exceeds platform limit (281 > 280 chars)",
        ]);
        expect(validatePlatformMetadata(X, { body: "x".repeat(280) }).valid).toBe(true);
    });
});
