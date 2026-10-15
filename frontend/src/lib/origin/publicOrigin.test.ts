import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("publicOrigin under a build that moves the origin", () => {
    /**
     * The module reads `import.meta.env` once, at import time, so each case
     * stubs the environment and re-imports it.
     */
    async function reimport(env: Record<string, string>) {
        vi.resetModules();
        for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
        return import("./publicOrigin");
    }

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("publishes the app at the override origin and path", async () => {
        const mod = await reimport({
            VITE_PUBLIC_ORIGIN: "https://second.test",
            VITE_PUBLIC_APP_PATH: "/",
        });
        expect(mod.PUBLIC_ORIGIN).toBe("https://second.test");
        expect(mod.PUBLIC_HOST).toBe("second.test");
        expect(mod.APP_URL).toBe("https://second.test/");
        expect(mod.publicUrl("og-image.png")).toBe("https://second.test/og-image.png");
    });

    it("leaves the preview share link on the declared origin, where the deploy is", async () => {
        const mod = await reimport({ VITE_PUBLIC_ORIGIN: "https://second.test" });
        expect(mod.PREVIEW_URL.startsWith(config.origin)).toBe(true);
        expect(mod.PREVIEW_URL).not.toContain("second.test");
    });

    it("is the declared config when the build sets nothing", async () => {
        const mod = await reimport({});
        expect(mod.APP_URL).toBe(`${config.origin}${config.appPath}`);
        expect(mod.PREVIEW_URL).toBe(`${config.origin}${config.previewPath}`);
    });
});
