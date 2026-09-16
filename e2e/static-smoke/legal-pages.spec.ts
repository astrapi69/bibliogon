/**
 * Legal pages gate (#876): Impressum / Datenschutz are static HTML files
 * next to the SPA. Two things can swallow them: the 404.html redirect
 * (does not apply, the files exist) and the service worker's
 * navigateFallback, which would answer a navigation to /impressum.html
 * with the app shell. This spec proves each page opens directly, survives
 * a reload, never shows the app root, links to its siblings, is reachable
 * from the app footer, and that the built sw.js carries the denylist.
 *
 * Like static-smoke.spec.ts, the SW registration is aborted (preview
 * artifact); the denylist is checked in the generated sw.js text instead,
 * fetched through the request context, which the route abort does not touch.
 */

import {test, expect} from "@playwright/test";

const PAGES = [
    {path: "/impressum.html", root: "legal-page-impressum", sibling: "/datenschutz.html"},
    {path: "/datenschutz.html", root: "legal-page-datenschutz", sibling: "/impressum.html"},
    {path: "/imprint.html", root: "legal-page-imprint", sibling: "/privacy.html"},
    {path: "/privacy.html", root: "legal-page-privacy", sibling: "/imprint.html"},
] as const;

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) =>
        route.abort(),
    );
    // Same baseline as fixtures/base.ts: the onboarding dialogs that open
    // on a fresh profile lay a Radix overlay over the whole page, which
    // intercepts the footer click below. Context-wide, per lessons-learned.
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable: the dialogs may show; the test then reports it */
        }
    });
});

for (const page_ of PAGES) {
    test(`${page_.path} opens directly, survives a reload, and is not the app`, async ({page}) => {
        await page.goto(page_.path);
        await expect(page.getByTestId(page_.root)).toBeVisible();
        await expect(page.getByTestId("new-book-group")).toHaveCount(0);
        await page.reload();
        await expect(page.getByTestId(page_.root)).toBeVisible();
        await expect(page.getByTestId("legal-link-app")).toHaveAttribute("href", "./");
        const siblingLink = page.locator(`a[href="./${page_.sibling.slice(1)}"]`).first();
        await expect(siblingLink).toBeVisible();
    });
}

test("the privacy pages carry a visible draft notice until the review is done", async ({page}) => {
    for (const path of ["/datenschutz.html", "/privacy.html"]) {
        await page.goto(path);
        await expect(page.getByTestId("legal-draft-notice")).toBeVisible();
    }
});

test("the built service worker excludes the legal pages from the SPA fallback", async ({page}) => {
    const response = await page.request.get("/sw.js");
    expect(response.ok(), "sw.js must be served by the preview").toBe(true);
    const source = await response.text();
    expect(source).toContain("impressum|datenschutz|imprint|privacy");
});

test("the app footer links to the legal pages in the UI language", async ({page}) => {
    await page.goto("/");
    await expect(page.getByTestId("new-book-group")).toBeVisible({timeout: 20_000});
    const imprint = page.getByTestId("legal-footer-imprint");
    await expect(imprint).toBeVisible();
    await imprint.click();
    await expect(page.getByTestId("legal-page-impressum").or(page.getByTestId("legal-page-imprint"))).toBeVisible();
    await expect(page.getByTestId("new-book-group")).toHaveCount(0);
});
