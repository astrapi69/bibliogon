import { describe, expect, it } from "vitest";

import { assertUsableOrigin, resolveOriginConfig, type OriginConfig } from "./originConfig";

/**
 * A neutral declared config.
 *
 * These are normalisation rules; they have nothing to do with where
 * Bibliogon happens to be published, and the guard scan in this folder
 * flags the real host in a test file - rightly, since a fixture is one
 * more copy to update.
 */

const DECLARED: OriginConfig = {
    origin: "https://declared.test",
    appPath: "/app/",
    previewPath: "/app-preview/",
};

describe("resolveOriginConfig", () => {
    it("is the declared config when nothing overrides it", () => {
        expect(resolveOriginConfig(DECLARED)).toMatchObject(DECLARED);
    });

    it("takes an override origin, without its trailing slash", () => {
        const resolved = resolveOriginConfig(DECLARED, { origin: "https://bibliogon.app/" });
        expect(resolved.origin).toBe("https://bibliogon.app");
    });

    it("takes an override path and gives it both slashes", () => {
        expect(resolveOriginConfig(DECLARED, { appPath: "other" }).appPath).toBe("/other/");
        expect(resolveOriginConfig(DECLARED, { appPath: "/other" }).appPath).toBe("/other/");
        expect(resolveOriginConfig(DECLARED, { appPath: "other/" }).appPath).toBe("/other/");
    });

    it("keeps a root deploy's path a single slash, the case a path-based deploy never had", () => {
        expect(resolveOriginConfig(DECLARED, { appPath: "/" }).appPath).toBe("/");
        expect(resolveOriginConfig(DECLARED, { appPath: "" }).appPath).toBe("/app/");
    });

    it("ignores an override that is only whitespace, as an unset env-var arrives", () => {
        const resolved = resolveOriginConfig(DECLARED, { origin: "   ", appPath: "\t" });
        expect(resolved).toMatchObject(DECLARED);
    });

    it("leaves the preview path on the declared origin, not the override", () => {
        const resolved = resolveOriginConfig(DECLARED, { origin: "https://bibliogon.app" });
        expect(resolved.previewOrigin).toBe(DECLARED.origin);
        expect(resolved.previewPath).toBe(DECLARED.previewPath);
    });

    it("reports the declared origin as the preview origin even unoverridden", () => {
        expect(resolveOriginConfig(DECLARED).previewOrigin).toBe(DECLARED.origin);
    });
});

describe("assertUsableOrigin", () => {
    it("accepts an absolute https origin", () => {
        expect(() => assertUsableOrigin(DECLARED)).not.toThrow();
    });

    it("rejects an origin that is not absolute, before it bakes into a bundle", () => {
        expect(() => assertUsableOrigin({ ...DECLARED, origin: "bibliogon.app" })).toThrow(
            /absolute/i,
        );
    });

    it("rejects an origin carrying a path, query or fragment", () => {
        for (const origin of [
            "https://bibliogon.app/app",
            "https://bibliogon.app?x=1",
            "https://bibliogon.app#a",
        ]) {
            expect(() => assertUsableOrigin({ ...DECLARED, origin })).toThrow(/origin/i);
        }
    });

    it("names the offending value, so a failed build says what to fix", () => {
        expect(() => assertUsableOrigin({ ...DECLARED, origin: "ftp://x.test" })).toThrow(
            /ftp:\/\/x\.test/,
        );
    });
});
