/**
 * Medium import stores every image locally - measured in the built web
 * app (#882).
 *
 * The browser importer downloads each image while the user imports and
 * rewrites the article to `/api/articles/{id}/assets/file/...`. After the
 * import, showing the article list and opening an article must not send
 * a single request to Medium's CDN: that is the proof that
 * `cdn-images-1.medium.com` left the host table.
 *
 * The CDN is answered locally (a 1x1 PNG), so no real request leaves the
 * test machine. Requests to Medium hosts are recorded per phase: the
 * import phase MUST have them (otherwise nothing was downloaded and the
 * "zero afterwards" would be vacuous), the viewing phase must have none.
 */

import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {test, expect} from "@playwright/test";

const FIXTURE = readFileSync(resolve(__dirname, "..", "fixtures", "minimal-medium-export.zip"));
const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "base64",
);
const MEDIUM_HOST = /(^|\.)medium\.com$/;

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable */
        }
    });
    await context.route(/^https:\/\/([a-z0-9-]+\.)*medium\.com\//, (route) =>
        route.fulfill({status: 200, contentType: "image/png", body: PNG_1X1}),
    );
});

test("imported Medium images are stored locally; viewing never contacts Medium", async ({page}) => {
    let phase: "import" | "view" = "import";
    const mediumRequests: Record<"import" | "view", string[]> = {import: [], view: []};
    page.on("request", (request) => {
        if (MEDIUM_HOST.test(new URL(request.url()).hostname)) {
            mediumRequests[phase].push(request.url());
        }
    });

    await page.goto("/articles/import/medium");
    await page.getByTestId("medium-import-upload-input").setInputFiles({
        name: "minimal-medium-export.zip",
        mimeType: "application/zip",
        buffer: FIXTURE,
    });
    await page.getByTestId("medium-import-start").click();
    await expect(page.getByTestId("medium-import-preview-section")).toBeVisible({timeout: 15_000});
    await page.getByTestId("medium-import-preview-import-btn").click();
    await expect(page.getByTestId("medium-import-result")).toBeVisible({timeout: 30_000});
    await expect(page.getByTestId("medium-import-result-imported-count")).toContainText("2");

    expect(mediumRequests.import.length, "images must be downloaded during the import").toBeGreaterThan(0);

    const stored = await page.evaluate(
        () =>
            new Promise<{ids: string[]; json: string; assetCount: number}>((resolve, reject) => {
                const open = indexedDB.open("bibliogon-offline");
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const tx = open.result.transaction(["articles", "articleAssets"]);
                    const articles = tx.objectStore("articles").getAll();
                    const assets = tx.objectStore("articleAssets").count();
                    tx.oncomplete = () =>
                        resolve({
                            ids: (articles.result as {id: string}[]).map((a) => a.id),
                            json: JSON.stringify(articles.result),
                            assetCount: assets.result as number,
                        });
                };
            }),
    );
    expect(stored.ids).toHaveLength(2);
    expect(stored.assetCount).toBeGreaterThan(0);
    expect(stored.json).not.toContain("medium.com/max");
    expect(stored.json).not.toContain("cdn-images-1.medium.com");
    expect(stored.json).toContain("/api/articles/");

    phase = "view";
    await page.goto("/articles", {waitUntil: "networkidle"});
    await expect(page.getByTestId("article-list-page")).toBeVisible();
    for (const id of stored.ids) {
        await page.goto(`/articles/${id}`, {waitUntil: "networkidle"});
        await page.waitForTimeout(500);
    }
    await page.goto("/articles", {waitUntil: "networkidle"});

    expect(mediumRequests.view, "no request to Medium after the import").toEqual([]);
});
