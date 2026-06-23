/**
 * VISUAL-REGRESSION-VIEWPORTS-01 — Phase 1 responsive pixel-diff baselines.
 *
 * The sibling theme-regression.spec.ts captures the 6 palettes x light/dark
 * at the desktop viewport. This file is the documented "Mobile is a
 * deliberate follow-up" companion: the critical surfaces in the DEFAULT
 * theme across three viewports (desktop / tablet / mobile), so responsive
 * layout regressions (collapsed headers, sidebar overlays, wrapping
 * toolbars) are caught by pixel diff.
 *
 * Baselines are written on the first `--update-snapshots` run and committed
 * (linux PNGs); every later run pixel-compares with the shared tolerance
 * from playwright.config.ts (maxDiffPixelRatio 0.01, animations disabled).
 *
 * A red run is EITHER a real regression (fix it) OR an intended layout
 * change (regenerate the baseline with `make test-visual-update` and commit
 * the new PNGs). Never blind-update to silence a real regression.
 *
 * Bootstrap (no baseline yet -> the run "fails" writing them):
 *   make test-visual-update
 *   git add e2e/visual/viewport-regression.spec.ts-snapshots/
 *
 * Run: `make test-visual` (alias for `--project=visual`).
 */

import {test, expect, type Page} from "@playwright/test";

import {
    resetDb,
    resetSettings,
    createBook,
    createChapter,
    createArticle,
} from "../helpers/api";
import {pinServerDates} from "../helpers/pinDates";

const VIEWPORTS = [
    {name: "desktop", width: 1920, height: 1080},
    {name: "tablet", width: 768, height: 1024},
    {name: "mobile", width: 375, height: 667},
] as const;

/** Freeze theme + clock before first paint (same rationale as the theme
 *  spec): default palette/light, donation-onboarding suppressed, and a
 *  pinned clock so any relative-time surface stays stable across days. */
async function prep(page: Page): Promise<void> {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-app-theme", "warm-literary");
            localStorage.setItem("bibliogon-theme", "light");
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
        } catch {
            /* ignore */
        }
        const FIXED_TIME = new Date("2026-06-10T12:00:00Z").getTime();
        const RealDate = Date;
        class FrozenDate extends RealDate {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            constructor(...args: any[]) {
                if (args.length === 0) super(FIXED_TIME);
                // @ts-ignore forward to real Date
                else super(...args);
            }
            static now() {
                return FIXED_TIME;
            }
        }
        // @ts-ignore install frozen clock
        globalThis.Date = FrozenDate;
    });
    // Pin server-derived card dates (updated_at) so the baselines never
    // drift across days; the frozen browser clock above cannot fix a
    // value that the backend stamped at seed time.
    await pinServerDates(page);
}

async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
}

for (const vp of VIEWPORTS) {
    test.describe(`visual viewports: ${vp.name}`, () => {
        test.use({viewport: {width: vp.width, height: vp.height}});

        test(`bd-empty-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            await prep(page);
            await page.goto("/");
            await expect(page.getByTestId("dashboard-empty-state")).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`bd-empty-${vp.name}.png`, {fullPage: true});
        });

        test(`bd-populated-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            await createBook("Visual Buch Eins", "Autorin A");
            await createBook("Visual Buch Zwei", "Autorin B");
            await createBook("Visual Buch Drei", "Autorin C");
            await prep(page);
            await page.goto("/");
            await expect(page.getByText("Visual Buch Eins").first()).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`bd-populated-${vp.name}.png`, {fullPage: true});
        });

        test(`ad-empty-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            await prep(page);
            await page.goto("/articles");
            await expect(page.getByTestId("article-list-empty-cta")).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`ad-empty-${vp.name}.png`, {fullPage: true});
        });

        test(`editor-book-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            const book = await createBook("Visual Editor Buch", "Autorin");
            await createChapter(
                book.id,
                "Kapitel Eins",
                "Ein Absatz Beispieltext fuer die Editor-Ansicht.",
                "chapter",
            );
            await prep(page);
            await page.goto(`/book/${book.id}`);
            await expect(page.locator(".ProseMirror")).toContainText("Ein Absatz Beispieltext");
            await settle(page);
            await expect(page).toHaveScreenshot(`editor-book-${vp.name}.png`, {fullPage: true});
        });

        test(`metadata-general-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            const book = await createBook("Visual Metadaten Buch", "Autorin");
            await createChapter(book.id, "Kapitel Eins", "Text.", "chapter");
            await prep(page);
            await page.goto(`/book/${book.id}?view=metadata`);
            await expect(page.getByTestId("metadata-tab-general")).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`metadata-general-${vp.name}.png`, {fullPage: true});
        });

        test(`metadata-quality-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            const book = await createBook("Visual Qualitaet Buch", "Autorin");
            await createChapter(
                book.id,
                "Kapitel Eins",
                "Das ist ein einfacher Satz. Hier folgt ein zweiter Satz mit etwas mehr Text.",
                "chapter",
            );
            await prep(page);
            await page.goto(`/book/${book.id}?view=metadata`);
            await page.getByTestId("metadata-tab-quality").click();
            await expect(page.getByTestId("quality-table")).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`metadata-quality-${vp.name}.png`, {fullPage: true});
        });

        test(`settings-data-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            await prep(page);
            await page.goto("/settings?tab=daten");
            await expect(page.getByTestId("data-maintenance-section")).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`settings-data-${vp.name}.png`, {fullPage: true});
        });

        test(`settings-authors-${vp.name}`, async ({page}) => {
            await resetDb();
            await resetSettings();
            await createArticle("Visual Artikel", "de");
            await prep(page);
            await page.goto("/settings?tab=autoren");
            await expect(page.getByTestId("authors-database-section")).toBeVisible();
            await settle(page);
            await expect(page).toHaveScreenshot(`settings-authors-${vp.name}.png`, {fullPage: true});
        });
    });
}
