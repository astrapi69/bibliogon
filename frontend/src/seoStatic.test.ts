/** Static SEO assets: index.html, robots.txt, sitemap.xml, og-image, manifest (#605). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
        expect(html).toContain('<link rel="canonical" href="https://astrapi69.github.io/bibliogon/"');
    });

    it("has Open Graph + Twitter Card tags incl. og:image", () => {
        expect(html).toContain('<meta property="og:title"');
        expect(html).toContain('<meta property="og:description"');
        expect(html).toContain('<meta property="og:image"');
        expect(html).toContain('<meta property="og:url" content="https://astrapi69.github.io/bibliogon/"');
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
        expect(html).toContain('<meta name="twitter:image"');
    });

    it("has a valid WebApplication JSON-LD block", () => {
        const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        expect(m).not.toBeNull();
        const ld = JSON.parse(m![1]);
        expect(ld["@type"]).toBe("WebApplication");
        expect(ld.name).toBe("Bibliogon");
        expect(ld.offers.price).toBe("0");
    });
});

describe("robots.txt", () => {
    it("allows all + references the sitemap", () => {
        const robots = read("../public/robots.txt");
        expect(robots).toContain("User-agent: *");
        expect(robots).toContain("Allow: /");
        expect(robots).toContain("Sitemap: https://astrapi69.github.io/bibliogon/sitemap.xml");
    });
});

describe("sitemap.xml", () => {
    it("is a urlset with the home loc", () => {
        const sm = read("../public/sitemap.xml");
        expect(sm).toContain("<urlset");
        expect(sm).toContain("<loc>https://astrapi69.github.io/bibliogon/</loc>");
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
            '<meta property="og:image" content="https://astrapi69.github.io/bibliogon/og-image.png"',
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
