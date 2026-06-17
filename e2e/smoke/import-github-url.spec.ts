/**
 * GitHub + URL import smoke (#353). Drives the unified offline import dialog's
 * new tabs in Dexie/offline mode (where the client-side OfflineImportDialog
 * mounts), with the external GitHub REST API + raw download host + the URL
 * host mocked via `page.route` so the test is deterministic and hits no real
 * network. Both sources import through the storage seam, so no `/api` fires.
 *
 * Run by Aster (Pre-Release Gate).
 */

import { test, expect } from "../fixtures/base";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon.storage_mode", "dexie");
        } catch {
            /* ignore */
        }
    });
});

test.describe("GitHub + URL import (Dexie mode)", () => {
    test("the import dialog exposes File / GitHub / URL tabs", async ({ page }) => {
        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await expect(page.getByTestId("offline-import-dialog")).toBeVisible();
        await expect(page.getByTestId("offline-import-tab-file")).toBeVisible();
        await expect(page.getByTestId("offline-import-tab-github")).toBeVisible();
        await expect(page.getByTestId("offline-import-tab-url")).toBeVisible();
    });

    test("GitHub import: load a repo, pick a file, import it", async ({ page }) => {
        // Mock the GitHub contents API: one markdown file at the repo root.
        await page.route(/api\.github\.com\/repos\/octo\/demo\/contents\//, (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: { "access-control-allow-origin": "*" },
                body: JSON.stringify([
                    {
                        name: "intro.md",
                        path: "intro.md",
                        type: "file",
                        size: 24,
                        download_url: "https://raw.example.test/octo/demo/intro.md",
                        sha: "abc",
                    },
                ]),
            }),
        );
        // Mock the raw download.
        await page.route("https://raw.example.test/octo/demo/intro.md", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/markdown",
                headers: { "access-control-allow-origin": "*" },
                body: "# Imported From GitHub\n\nChapter body from the repo.",
            }),
        );

        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await page.getByTestId("offline-import-tab-github").click();

        await page.getByTestId("github-import-url").fill("https://github.com/octo/demo");
        await page.getByTestId("github-import-load").click();

        const checkbox = page.getByTestId("github-import-file-intro.md");
        await expect(checkbox).toBeVisible();
        await checkbox.check();
        await page.getByTestId("github-import-confirm").click();

        await expect(page.getByTestId("github-import-summary")).toBeVisible();
        await page.getByTestId("github-import-done").click();

        // The book created from the repo file is read back from Dexie.
        await expect(page.getByText("Imported From GitHub").first()).toBeVisible();
    });

    test("URL import: fetch a markdown document and import it", async ({ page }) => {
        await page.route("https://docs.example.test/guide.md", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/markdown",
                headers: { "access-control-allow-origin": "*" },
                body: "# Imported From URL\n\nBody fetched over the network.",
            }),
        );

        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await page.getByTestId("offline-import-tab-url").click();

        await page.getByTestId("url-import-url").fill("https://docs.example.test/guide.md");
        await page.getByTestId("url-import-confirm").click();

        await expect(page.getByTestId("offline-import-dialog")).toHaveCount(0);
        await expect(page.getByText("Imported From URL").first()).toBeVisible();
    });
});
