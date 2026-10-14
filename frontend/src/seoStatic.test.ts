/**
 * Static SEO assets: index.html, robots.txt, sitemap.xml, og-image,
 * manifest (#605).
 *
 * Since #1102 the published URLs are not written into these files: the
 * HTML carries `%PUBLIC_APP_URL%` placeholders and the sitemap and
 * robots.txt are emitted at build time. So this file asserts two things in
 * two different ways - that the template still ASKS for the URL where a
 * crawler needs one, and that the generator PRODUCES the published URL,
 * through the same functions the build runs with the same config.
 *
 * What neither can see is the resolved artifact, because nothing here
 * builds. `e2e/static-smoke/seo-origin.spec.ts` reads it off the real
 * built page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { robotsTxt, sitemapXml } from "../build-plugins/publicOrigin";
import config from "../public-origin.json";
import { APP_URL, publicUrl } from "./lib/origin/publicOrigin";

function resolve(relFromSrc: string): string {
    return fileURLToPath(new URL(relFromSrc, import.meta.url));
}
function read(relFromSrc: string): string {
    return readFileSync(resolve(relFromSrc), "utf-8");
}

describe("index.html SEO tags", () => {
    const html = read("../index.html");

    it("has description / keywords / author / canonical", () => {
        expect(html).toContain('<meta name="description"');
        expect(html).toContain('<meta name="keywords"');
        expect(html).toContain('<meta name="author" content="Asterios Raptis"');
        expect(html).toContain('<link rel="canonical" href="%PUBLIC_APP_URL%"');
    });

    it("has Open Graph + Twitter Card tags incl. og:image", () => {
        expect(html).toContain('<meta property="og:title"');
        expect(html).toContain('<meta property="og:description"');
        expect(html).toContain('<meta property="og:image"');
        expect(html).toContain('<meta property="og:url" content="%PUBLIC_APP_URL%"');
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
        expect(html).toContain('<meta name="twitter:image"');
    });

    it("has a valid WebApplication JSON-LD block", () => {
        const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        expect(m).not.toBeNull();
        const ld = JSON.parse(m![1].split("%PUBLIC_APP_URL%").join(APP_URL));
        expect(ld["@type"]).toBe("WebApplication");
        expect(ld.name).toBe("Bibliogon");
        expect(ld.offers.price).toBe("0");
    });
});

describe("robots.txt, as the build emits it", () => {
    it("allows all + references the sitemap at its published URL", () => {
        const robots = robotsTxt(config);
        expect(robots).toContain("User-agent: *");
        expect(robots).toContain("Allow: /");
        expect(robots).toContain(`Sitemap: ${publicUrl("sitemap.xml")}`);
    });
});

describe("sitemap.xml, as the build emits it", () => {
    it("is a urlset with the published home loc", () => {
        const sm = sitemapXml(config, "2026-10-14");
        expect(sm).toContain("<urlset");
        expect(sm).toContain(`<loc>${APP_URL}</loc>`);
        expect(sm).toContain("<priority>1.0</priority>");
    });
});

describe("og-image", () => {
    it("og-image.svg exists at the 1200x630 social aspect ratio", () => {
        const svg = read("../public/og-image.svg");
        expect(svg).toContain('width="1200"');
        expect(svg).toContain('height="630"');
        expect(svg).toContain("Bibliogon");
    });

    it("og-image.png is a >10KB 1200x630 PNG", () => {
        const buf = readFileSync(resolve("../public/og-image.png"));
        expect(buf.length).toBeGreaterThan(10_000);
        // PNG signature + IHDR width/height (big-endian u32 at offsets 16/20).
        expect(buf.subarray(0, 8).toString("latin1")).toBe("\x89PNG\r\n\x1a\n");
        expect(buf.readUInt32BE(16)).toBe(1200);
        expect(buf.readUInt32BE(20)).toBe(630);
    });

    it("index.html points og:image at the 1200x630 og-image.png", () => {
        const html = read("../index.html");
        expect(html).toContain(
            '<meta property="og:image" content="%PUBLIC_APP_URL%og-image.png"',
        );
        expect(html).toContain('<meta property="og:image:width" content="1200"');
        expect(html).toContain('<meta property="og:image:height" content="630"');
    });
});

describe("PWA manifest (vite-plugin-pwa config)", () => {
    const cfg = read("../vite.config.ts");

    it("has a non-empty description + lang + the SEO categories", () => {
        expect(cfg).toContain('lang: "de"');
        expect(cfg).toContain('categories: ["productivity", "books", "writing"]');
        // description present and not the empty/old placeholder
        expect(cfg).toMatch(/description:\s*\n?\s*"Open-Source-Plattform fuer Autoren/);
    });
});
