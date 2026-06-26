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
import {pinServerDates} from "../helpers/pinDates";

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
 * Seed both theme localStorage keys AND freeze the browser clock
 * before the app's first paint. addInitScript stacks with the base
 * fixture's donation-onboarding script and re-runs on every
 * navigation, so the theme + frozen clock survive a later page.goto
 * within the same test.
 *
 * The clock freeze is defensive flake-prevention: the current 3 views
 * render only absolute, server-derived dates (a frozen browser clock
 * does not change them), but a future surface that computes a relative
 * time ("vor 3 Tagen") from `new Date()` / `Date.now()` would otherwise
 * render different text a day after the baseline was taken and flake the
 * diff. Forwarding constructor args to the real Date keeps
 * `new Date(isoString)` parsing (used by formatLocaleDate) intact; only
 * the argument-less `new Date()` and `Date.now()` are pinned.
 */
async function applyTheme(page: Page, palette: string, mode: string): Promise<void> {
    await page.addInitScript(
        ({palette, mode}) => {
            try {
                localStorage.setItem("bibliogon-app-theme", palette);
                localStorage.setItem("bibliogon-theme", mode);
                localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
                localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
                localStorage.setItem("bibliogon-migration-offered", "true");
            } catch {
                // localStorage unavailable (privacy mode); ignore.
            }
            const FIXED_TIME = new Date("2026-06-10T12:00:00Z").getTime();
            const RealDate = Date;
            class FrozenDate extends RealDate {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                constructor(...args: any[]) {
                    if (args.length === 0) {
                        super(FIXED_TIME);
                    } else {
                        // @ts-ignore forward args to the real Date constructor
                        super(...args);
                    }
                }
                static now() {
                    return FIXED_TIME;
                }
            }
            // @ts-ignore install the frozen clock
            globalThis.Date = FrozenDate;
        },
        {palette, mode},
    );
    // The dashboard card renders a server-derived `updated_at`, which the
    // frozen browser clock above cannot pin (it comes from the backend, not
    // `new Date()`). Normalize the dates the renderer sees so the baselines
    // stay stable across days.
    await pinServerDates(page);
}

/**
 * Gate the screenshot on a stable render: web fonts loaded (an
 * un-loaded font would re-flow text mid-capture) plus a short settle
 * after the font swap to catch the final reflow. networkidle is kept as
 * a secondary settle, but the PRIMARY ready signal is the per-view
 * content wait at each call site (a seeded card / the editor's loaded
 * text / the appearance select), which is more deterministic than
 * networkidle's lazy-chunk heuristic.
 */
async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
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
                // Ready signal: the editor is mounted AND the seeded
                // chapter content has loaded into ProseMirror (the empty
                // editor mounts before the chapter fetch resolves).
                await expect(page.locator(".ProseMirror")).toContainText(
                    "Ein Absatz Beispieltext",
                );
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
                // Ready signal: the appearance section root AND the
                // config-driven palette select have rendered (the select
                // hydrates from the async getApp config).
                await expect(page.getByTestId("erscheinungsbild-settings")).toBeVisible();
                await expect(page.getByTestId("palette-select-trigger")).toBeVisible();
                await settle(page);
                await expect(page).toHaveScreenshot(`settings-${palette}-${mode}.png`, {
                    fullPage: true,
                });
            });
        }
    }
});
