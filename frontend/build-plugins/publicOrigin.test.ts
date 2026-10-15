import { describe, expect, it } from "vitest";

import {
    applyPlaceholders,
    configFromEnv,
    isoDate,
    placeholders,
    robotsTxt,
    sitemapXml,
    type PublicOriginConfig,
} from "./publicOrigin";

const CONFIG: PublicOriginConfig = {
    origin: "https://example.test",
    appPath: "/app/",
    previewPath: "/app-preview/",
};

describe("applyPlaceholders", () => {
    it("resolves the app URL where the HTML asks for it", () => {
        const html = '<link rel="canonical" href="%PUBLIC_APP_URL%"/>';
        expect(applyPlaceholders(html, CONFIG)).toBe(
            '<link rel="canonical" href="https://example.test/app/"/>',
        );
    });

    it("resolves every occurrence, not just the first", () => {
        const html = "%PUBLIC_APP_URL% %PUBLIC_APP_URL% %PUBLIC_APP_URL%";
        const out = applyPlaceholders(html, CONFIG);
        expect(out.split("https://example.test/app/")).toHaveLength(4);
        expect(out).not.toContain("%PUBLIC_APP_URL%");
    });

    it("resolves the bare origin separately from the app URL", () => {
        expect(applyPlaceholders("%PUBLIC_ORIGIN%", CONFIG)).toBe("https://example.test");
    });

    it("leaves text it does not know alone", () => {
        // Vite replaces its own %VITE_*% tokens; eating them here would
        // break whatever reads them.
        expect(applyPlaceholders("%VITE_SOMETHING% 100%", CONFIG)).toBe(
            "%VITE_SOMETHING% 100%",
        );
    });

    it("declares a placeholder for each thing the HTML needs", () => {
        expect(Object.keys(placeholders(CONFIG)).sort()).toEqual([
            "%PUBLIC_APP_URL%",
            "%PUBLIC_ORIGIN%",
        ]);
    });
});

describe("robotsTxt", () => {
    it("points crawlers at the published sitemap, not a relative path", () => {
        const robots = robotsTxt(CONFIG);
        expect(robots).toContain("User-agent: *");
        expect(robots).toContain("Allow: /");
        expect(robots).toContain("Sitemap: https://example.test/app/sitemap.xml");
    });
});

describe("sitemapXml", () => {
    it("declares the app's home page as the published URL", () => {
        const sitemap = sitemapXml(CONFIG, "2026-10-14");
        expect(sitemap).toContain("<loc>https://example.test/app/</loc>");
        expect(sitemap).toContain("<lastmod>2026-10-14</lastmod>");
        expect(sitemap).toContain("<priority>1.0</priority>");
    });

    it("is parseable XML with one urlset root", () => {
        const sitemap = sitemapXml(CONFIG, "2026-10-14");
        expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(sitemap.match(/<urlset/g)).toHaveLength(1);
        expect(sitemap).toContain("</urlset>");
    });
});

describe("isoDate", () => {
    it("is the date alone, which is what lastmod takes", () => {
        expect(isoDate(new Date("2026-10-14T23:59:59Z"))).toBe("2026-10-14");
    });
});

describe("configFromEnv", () => {
    it("is the declared config when the environment says nothing", () => {
        expect(configFromEnv(CONFIG, {})).toMatchObject(CONFIG);
    });

    it("publishes the same bundle at an override origin, served at the root", () => {
        const resolved = configFromEnv(CONFIG, {
            VITE_PUBLIC_ORIGIN: "https://bibliogon.app",
            VITE_PUBLIC_APP_PATH: "/",
        });
        expect(resolved.origin).toBe("https://bibliogon.app");
        expect(resolved.appPath).toBe("/");
        expect(applyPlaceholders("%PUBLIC_APP_URL%", resolved)).toBe("https://bibliogon.app/");
        expect(robotsTxt(resolved)).toContain("Sitemap: https://bibliogon.app/sitemap.xml");
        expect(sitemapXml(resolved, "2026-10-15")).toContain("<loc>https://bibliogon.app/</loc>");
    });

    it("fails the build on an origin that cannot carry a URL, not the artifact", () => {
        expect(() => configFromEnv(CONFIG, { VITE_PUBLIC_ORIGIN: "bibliogon.app" })).toThrow(
            /absolute/i,
        );
        expect(() =>
            configFromEnv(CONFIG, { VITE_PUBLIC_ORIGIN: "https://bibliogon.app/app" }),
        ).toThrow(/appPath/);
    });
});
