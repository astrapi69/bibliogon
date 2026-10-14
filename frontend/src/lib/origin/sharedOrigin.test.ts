/**
 * #991: the shared-origin check decides whether the credential notices
 * are shown, so a wrong answer either hides a real warning or cries wolf
 * on the desktop build.
 */

import { describe, expect, it } from "vitest";

import { isSharedOrigin } from "./sharedOrigin";

describe("isSharedOrigin", () => {
    it("is true for a GitHub Pages host", () => {
        expect(isSharedOrigin("astrapi69.github.io")).toBe(true);
    });

    it("is true for the other path-per-site hosts the app can land on", () => {
        expect(isSharedOrigin("example.gitlab.io")).toBe(true);
        expect(isSharedOrigin("preview.pages.dev")).toBe(true);
        expect(isSharedOrigin("bibliogon.netlify.app")).toBe(true);
    });

    it("is false for the desktop, Docker and LAN builds", () => {
        expect(isSharedOrigin("localhost")).toBe(false);
        expect(isSharedOrigin("127.0.0.1")).toBe(false);
        expect(isSharedOrigin("192.168.1.42")).toBe(false);
    });

    it("is false for a custom domain, which is what actually fixes this", () => {
        expect(isSharedOrigin("bibliogon.app")).toBe(false);
        expect(isSharedOrigin("app.bibliogon.de")).toBe(false);
    });

    it("does not match a domain that merely ends in the same letters", () => {
        // "notgithub.io" is a different registrable domain; only a
        // subdomain of github.io shares the origin.
        expect(isSharedOrigin("notgithub.io")).toBe(false);
    });

    it("matches case-insensitively and ignores surrounding space", () => {
        expect(isSharedOrigin("  Astrapi69.GitHub.IO ")).toBe(true);
    });

    it("is false for an empty hostname", () => {
        expect(isSharedOrigin("")).toBe(false);
    });
});
