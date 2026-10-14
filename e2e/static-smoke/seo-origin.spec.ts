/**
 * The published URLs, read off the artifact a crawler reads (#1102).
 *
 * `index.html` carries `%PUBLIC_APP_URL%` placeholders and the sitemap and
 * robots.txt are emitted at build time, so every unit-level assertion is
 * about a template or a generator. This one is about the file that ships:
 * an unresolved placeholder, a plugin that stopped running, or a `base`
 * that leaked into the canonical URL all look fine in Vitest and are
 * visible here.
 *
 * The expected value comes from `public-origin.json`, the same source the
 * build reads - which makes this a check that the pipeline RAN, not that
 * somebody typed the same host twice.
 */

import {test, expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const config = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../frontend/public-origin.json", import.meta.url)), "utf-8"),
) as {origin: string; appPath: string};

const APP_URL = `${config.origin}${config.appPath}`;

test("the built page advertises the published address", async ({page}) => {
    await page.goto("/");

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", APP_URL);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", APP_URL);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        `${APP_URL}og-image.png`,
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
        "content",
        `${APP_URL}og-image.png`,
    );

    const jsonLd = await page.locator('script[type="application/ld+json"]').innerText();
    expect(JSON.parse(jsonLd).url).toBe(APP_URL);

    // An unresolved placeholder is the one failure the assertions above
    // would report as a confusing attribute mismatch rather than as what
    // it is.
    const html = await page.content();
    expect(html, "a %PUBLIC_*% placeholder survived the build").not.toContain("%PUBLIC_");
});

test("robots.txt and sitemap.xml ship with the published URL", async ({page, request}) => {
    await page.goto("/");
    const pageUrl = page.url();

    const robots = await request.get(new URL("robots.txt", pageUrl).toString());
    expect(robots.ok(), `robots.txt: HTTP ${robots.status()}`).toBe(true);
    expect(await robots.text()).toContain(`Sitemap: ${APP_URL}sitemap.xml`);

    const sitemap = await request.get(new URL("sitemap.xml", pageUrl).toString());
    expect(sitemap.ok(), `sitemap.xml: HTTP ${sitemap.status()}`).toBe(true);
    const body = await sitemap.text();
    expect(body).toContain(`<loc>${APP_URL}</loc>`);
    expect(body).toContain("<urlset");
});
