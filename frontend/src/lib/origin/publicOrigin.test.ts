import { describe, expect, it } from "vitest";

import config from "../../../public-origin.json";
import { APP_URL, PREVIEW_URL, PUBLIC_HOST, PUBLIC_ORIGIN, publicUrl } from "./publicOrigin";

describe("publicOrigin", () => {
    it("reads the origin from the one file that declares it", () => {
        expect(PUBLIC_ORIGIN).toBe(config.origin);
        expect(PUBLIC_ORIGIN.endsWith("/")).toBe(false);
    });

    it("derives the host rather than carrying a second copy of it", () => {
        expect(PUBLIC_HOST).toBe(new URL(config.origin).host);
        expect(PUBLIC_HOST).not.toContain("/");
    });

    it("joins the deploy path onto the origin, with one trailing slash", () => {
        expect(APP_URL).toBe(`${config.origin}${config.appPath}`);
        expect(APP_URL.endsWith("/")).toBe(true);
        expect(APP_URL).not.toMatch(/[^:]\/\//);
    });

    it("keeps the preview deploy a sibling path on the same origin", () => {
        expect(new URL(PREVIEW_URL).origin).toBe(new URL(APP_URL).origin);
        expect(PREVIEW_URL).not.toBe(APP_URL);
    });

    it("joins a file path with exactly one slash, given or not", () => {
        expect(publicUrl("og-image.png")).toBe(`${APP_URL}og-image.png`);
        expect(publicUrl("/og-image.png")).toBe(`${APP_URL}og-image.png`);
        expect(publicUrl("///og-image.png")).toBe(`${APP_URL}og-image.png`);
    });

    it("produces URLs the browser can parse", () => {
        for (const url of [APP_URL, PREVIEW_URL, publicUrl("sitemap.xml")]) {
            expect(() => new URL(url)).not.toThrow();
        }
    });
});
