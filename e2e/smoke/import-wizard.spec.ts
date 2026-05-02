/**
 * UI smoke for the core import wizard (CIO-01..05).
 *
 * Drives the full wizard in the browser: open it from the
 * Dashboard, feed a .md file via the hidden file input, wait
 * for the preview, click Import, land on SuccessStep, and
 * confirm the new book appears on the Dashboard.
 *
 * Data-testid selectors only. The import-flows.spec.ts in the
 * same directory covers the API-level detect/execute path;
 * this spec exists to catch wizard state-machine regressions
 * that API tests cannot see (e.g. a broken onInputSelected
 * handler or a step-order bug in the modal shell).
 */

import {test, expect} from "../fixtures/base";

async function setUploadInput(page: import("@playwright/test").Page, content: string, filename: string) {
    await page.getByTestId("upload-input").setInputFiles({
        name: filename,
        mimeType: "text/markdown",
        buffer: Buffer.from(content, "utf-8"),
    });
}

test.describe("Import wizard UI", () => {
    test("single .md file: upload -> preview -> success", async ({page}) => {
        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await expect(page.getByTestId("import-wizard-modal")).toBeVisible();
        await expect(page.getByTestId("upload-step")).toBeVisible();

        await setUploadInput(
            page,
            "# Wizard Smoke Book\n\nA single markdown file flows through the wizard.\n",
            "wizard-smoke.md",
        );

        // CIO-06 wedged a "Detection complete" Summary step (Schritt 2)
        // between Upload and Preview. Advance through it.
        await expect(page.getByTestId("summary-step")).toBeVisible({timeout: 10_000});
        await page.getByTestId("summary-next").click();

        await expect(page.getByTestId("preview-step")).toBeVisible({timeout: 10_000});
        // CIO-06 rework: preview title is an editable input, not a heading.
        await expect(page.getByTestId("preview-field-title")).toHaveValue(
            "Wizard Smoke Book",
        );

        await page.getByTestId("preview-confirm").click();
        await expect(page.getByTestId("success-step")).toBeVisible({timeout: 10_000});

        // Close the wizard and assert the new book shows on the Dashboard.
        await page.getByTestId("wizard-close").click();
        await expect(
            page.locator(
                "[data-testid^='book-card-']:not([data-testid*='-menu-']):not([data-testid*='-placeholder-'])",
            ),
        ).toContainText("Wizard Smoke Book");
    });

    test("unsupported format lands on the error step", async ({page}) => {
        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await page.getByTestId("upload-input").setInputFiles({
            name: "random.xyz",
            mimeType: "application/octet-stream",
            buffer: Buffer.from("not a supported file"),
        });

        // UploadStep rejects unsupported extensions client-side before
        // ever POSTing to /api/import/detect. The user gets a visible
        // error banner in step 1 rather than being dropped into the
        // orchestrator's 415 response.
        await expect(page.getByTestId("upload-error")).toBeVisible();
    });

    test("wizard button is visible on an empty dashboard", async ({page}) => {
        await page.goto("/");
        await expect(page.getByTestId("import-wizard-btn")).toBeVisible();
    });
});
