/**
 * VISUAL-REGRESSION-SCREENSHOTS-01 — pixel-diff theme regression.
 *
 * Captures 3 critical views across all 6 palettes x light/dark = 36
 * committed baseline PNGs. Playwright's toHaveScreenshot() writes the
 * baseline on first run (--update-snapshots) and pixel-compares on every
 * subsequent run; the per-config tolerance (maxDiffPixelRatio 0.01) +
 * animations:disabled live in playwright.config.ts.
 *
 * A red run is EITHER a real visual regression (fix the bug) OR an
 * intended visual change (regenerate the baseline with
 * `npx playwright test --project=visual --update-snapshots` and commit
 * the new PNGs). Never silence a real regression by blindly updating
 * snapshots — that is the visual-test equivalent of deleting a failing
 * unit test.
 *
 * Views:
 *  1. Dashboard      — seeded with one book + one article
 *  2. BookEditor     — open chapter + chapter sidebar
 *  3. Settings       — Erscheinungsbild (Appearance) tab
 *
 * Themes are applied via the same localStorage keys useTheme reads
 * (`bibliogon-app-theme` = palette id, `bibliogon-theme` = light/dark),
 * set through addInitScript BEFORE the first navigation so the app boots
 * directly in the target theme with no flash-of-default repaint.
 *
 * Desktop viewport (1440x900, fixed in the `visual` project config) is
 * the only baseline for now. Mobile (375x812) is a deliberate follow-up
 * to keep the initial baseline set manageable.
 */

import {test, expect, type Page} from "@playwright/test";

import {resetDb, resetSettings, createBook, createChapter, createArticle} from "../helpers/api";

const PALETTES = [
    "warm-literary",
    "cool-modern",
    "nord",
    "classic",
    "studio",
    "notebook",
] as const;

const MODES = ["light", "dark"] as const;

/**
 * Seed both theme localStorage keys before the app's first paint.
 * addInitScript stacks with the base fixture's donation-onboarding
 * script and re-runs on every navigation, so the theme survives a
 * later page.goto within the same test.
 */
async function applyTheme(page: Page, palette: string, mode: string): Promise<void> {
    await page.addInitScript(
        ({palette, mode}) => {
            try {
                localStorage.setItem("bibliogon-app-theme", palette);
                localStorage.setItem("bibliogon-theme", mode);
                localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            } catch {
                // localStorage unavailable (privacy mode); ignore.
            }
        },
        {palette, mode},
    );
}

/**
 * Wait for the network to go quiet AND web fonts to finish loading
 * before the screenshot. An un-loaded font would otherwise re-flow text
 * mid-capture and flake the diff.
 */
async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
}

test.describe("visual: Dashboard across themes", () => {
    let bookId: string;

    test.beforeEach(async () => {
        await resetDb();
        await resetSettings();
        const book = await createBook("Visual-Regression Buch", "Test Autorin");
        await createChapter(book.id, "Kapitel Eins", "", "chapter");
        await createArticle("Visual-Regression Artikel", "de");
        bookId = book.id;
    });

    for (const palette of PALETTES) {
        for (const mode of MODES) {
            test(`dashboard-${palette}-${mode}`, async ({page}) => {
                await applyTheme(page, palette, mode);
                await page.goto("/");
                await expect(page.getByTestId(`book-card-${bookId}`)).toBeVisible();
                await settle(page);
                await expect(page).toHaveScreenshot(`dashboard-${palette}-${mode}.png`, {
                    fullPage: true,
                });
            });
        }
    }
});

test.describe("visual: BookEditor across themes", () => {
    let bookId: string;

    test.beforeEach(async () => {
        await resetDb();
        await resetSettings();
        const book = await createBook("Visual-Regression Buch", "Test Autorin");
        await createChapter(
            book.id,
            "Kapitel Eins",
            "Ein Absatz Beispieltext fuer die Editor-Ansicht.",
            "chapter",
        );
        bookId = book.id;
    });

    for (const palette of PALETTES) {
        for (const mode of MODES) {
            test(`editor-${palette}-${mode}`, async ({page}) => {
                await applyTheme(page, palette, mode);
                await page.goto(`/book/${bookId}`);
                await expect(page.locator(".ProseMirror")).toBeVisible();
                await settle(page);
                await expect(page).toHaveScreenshot(`editor-${palette}-${mode}.png`, {
                    fullPage: true,
                });
            });
        }
    }
});

test.describe("visual: Settings Appearance tab across themes", () => {
    test.beforeEach(async () => {
        await resetDb();
        await resetSettings();
    });

    for (const palette of PALETTES) {
        for (const mode of MODES) {
            test(`settings-${palette}-${mode}`, async ({page}) => {
                await applyTheme(page, palette, mode);
                await page.goto("/settings?tab=erscheinungsbild");
                await expect(page.getByTestId("erscheinungsbild-settings")).toBeVisible();
                await settle(page);
                await expect(page).toHaveScreenshot(`settings-${palette}-${mode}.png`, {
                    fullPage: true,
                });
            });
        }
    }
});
