/**
 * UI smoke for the .bgb import happy path via the core wizard.
 *
 * Complements import-wizard.spec.ts (markdown happy path) by
 * exercising the second format the wizard accepts: Bibliogon
 * backup archives dispatched through BgbImportHandler.
 *
 * Uses the committed minimal-book.bgb fixture (~767 bytes, one
 * chapter, no assets). Regenerate with
 * e2e/fixtures/regen_minimal_bgb.py.
 */

import {test, expect} from "../fixtures/base";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const FIXTURE_PATH = resolve(__dirname, "../fixtures/minimal-book.bgb");

test.describe("Import wizard UI: .bgb", () => {
    test("bgb upload -> preview -> execute -> book on dashboard", async ({page}) => {
        const bgbBytes = readFileSync(FIXTURE_PATH);

        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await expect(page.getByTestId("import-wizard-modal")).toBeVisible();
        await expect(page.getByTestId("upload-step")).toBeVisible();

        await page.getByTestId("upload-input").setInputFiles({
            name: "minimal-book.bgb",
            mimeType: "application/octet-stream",
            buffer: bgbBytes,
        });

        // Detect -> preview with the fixture's declared title.
        await expect(page.getByTestId("preview-step")).toBeVisible({timeout: 10_000});
        await expect(page.getByTestId("preview-title")).toContainText(
            "BGB Smoke Book",
        );
        // No duplicate on a fresh DB: the wizard should not render
        // the banner on first import of this fixture.
        await expect(page.getByTestId("duplicate-banner")).toHaveCount(0);

        await page.getByTestId("preview-confirm").click();
        await expect(page.getByTestId("success-step")).toBeVisible({timeout: 10_000});

        await page.getByTestId("wizard-close").click();
        await expect(
            page.locator("[data-testid^='book-card-']:not([data-testid*='-menu-'])"),
        ).toContainText("BGB Smoke Book");
    });

    test("re-importing the same .bgb shows the duplicate banner", async ({page}) => {
        const bgbBytes = readFileSync(FIXTURE_PATH);

        // First import: straight through success.
        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();
        await page.getByTestId("upload-input").setInputFiles({
            name: "minimal-book.bgb",
            mimeType: "application/octet-stream",
            buffer: bgbBytes,
        });
        await expect(page.getByTestId("preview-step")).toBeVisible({timeout: 10_000});
        await page.getByTestId("preview-confirm").click();
        await expect(page.getByTestId("success-step")).toBeVisible({timeout: 10_000});
        await page.getByTestId("wizard-close").click();

        // Second import: same file, same bytes. detect() looks up
        // BookImportSource by (source_identifier, source_type) and the
        // row from the first import makes the response carry
        // duplicate.found=true. Cancel to avoid a 500 on the .bgb
        // create-on-duplicate path (tracked in
        // backend/tests/test_import_duplicate_flows.py).
        await page.getByTestId("import-wizard-btn").click();
        await page.getByTestId("upload-input").setInputFiles({
            name: "minimal-book.bgb",
            mimeType: "application/octet-stream",
            buffer: bgbBytes,
        });
        await expect(page.getByTestId("preview-step")).toBeVisible({timeout: 10_000});
        await expect(page.getByTestId("duplicate-banner")).toBeVisible();
        await page.getByTestId("wizard-close").click();
    });
});
