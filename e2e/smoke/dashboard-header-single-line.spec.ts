/**
 * MENU-SINGLE-LINE-HAMBURGER-COLLAPSE-01 (2026-06-05) regression pin
 * for the BOOK Dashboard header (sister to article-header-single-line.spec.ts).
 *
 * The header must NEVER wrap to a second line. The two triggers that used to
 * wrap it at a fixed viewport are content-width changes, which a viewport
 * media query cannot see:
 *   1. the active LANGUAGE (German labels are the widest; German is default),
 *   2. the configured DEFAULT BOOK TYPE, whose label drives the SplitButton
 *      primary width (e.g. "Neues Bilderbuch" is wider than "Neues Buch").
 *
 * The fix (useOverflowCollapse) measures actual overflow and collapses the
 * secondary cluster into the hamburger, so the bar stays one line in every
 * locale and for every default-type label. These pins compare the header
 * height at a narrow width against its height at a generous reference width
 * (single-line guaranteed): a wrap adds a full control row (~36px+); a
 * collapse does not. Width-relative (not absolute px) keeps it robust across
 * font stacks.
 *
 * Pre-fix behaviour: at 820px the German bar wrapped to ~2 rows (the
 * `.headerActions` flex-wrap). These height pins FAIL on the pre-fix code.
 */

import {test, expect} from "../fixtures/base";

const REFERENCE_WIDTH = 1440; // wide enough that the cluster is single-line
const NARROW_WIDTH = 820; // inside the wrap window (> 768px breakpoint)
const WRAP_TOLERANCE = 8; // px of control-height jitter allowed before "wrap"

async function headerHeightAt(
    page: import("@playwright/test").Page,
    width: number,
): Promise<number> {
    await page.setViewportSize({width, height: 800});
    await expect(page.getByTestId("new-book-group")).toBeVisible();
    const header = page.getByTestId("dashboard-header");
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    return box!.height;
}

test.describe("MENU-SINGLE-LINE Book Dashboard", () => {
    // Language trigger: German is the active (widest-label) locale, the worst
    // case. The header must stay single-line at a width that wrapped pre-fix.
    test("header stays single-line at 820px (German, widest labels)", async ({
        page,
    }) => {
        await page.goto("/");
        const reference = await headerHeightAt(page, REFERENCE_WIDTH);
        const narrow = await headerHeightAt(page, NARROW_WIDTH);
        expect(narrow).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
    });

    test("header stays single-line at 1024px too", async ({page}) => {
        await page.goto("/");
        const reference = await headerHeightAt(page, REFERENCE_WIDTH);
        const narrow = await headerHeightAt(page, 1024);
        expect(narrow).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
    });

    // Proves the bar COLLAPSED to the hamburger (not wrapped, not clipped):
    // the hamburger trigger is present and an inline-only secondary control is
    // not visible inline.
    test("collapses to the hamburger at 820px, not a second row", async ({
        page,
    }) => {
        await page.setViewportSize({width: NARROW_WIDTH, height: 800});
        await page.goto("/");
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toBeVisible();
        // The inline secondary cluster is collapsed (out of flow).
        await expect(page.getByTestId("backup-export-btn")).toBeHidden();
        // Aster feedback 2026-06-05: the collapsed menu must carry the
        // "Artikel" cross-nav (it was missing). Pin it in the hamburger.
        await page.getByTestId("dashboard-hamburger").click();
        await expect(
            page.getByTestId("dashboard-hamburger-articles"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });

    // Mirror: at a generous width the full inline bar shows and there is no
    // hamburger (proves the bar re-expands).
    test("shows the full inline bar (no hamburger) at 1440px", async ({
        page,
    }) => {
        await page.setViewportSize({width: REFERENCE_WIDTH, height: 800});
        await page.goto("/");
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByTestId("backup-export-btn")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toHaveCount(0);
    });

    // Default-type trigger: changing the default book type widens the
    // SplitButton primary label. The header must still be single-line after
    // the change (proves the content-aware re-measure on the label dep).
    test("stays single-line after the default book type changes", async ({
        page,
    }) => {
        // Set the default book type to picture_book (longer label:
        // "Neues Bilderbuch") via the Verhalten settings deep-link.
        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();
        await page.getByTestId("settings-default-book-type-trigger").click();
        await page
            .getByTestId("settings-default-book-type-item-picture_book")
            .click();
        await page.getByTestId("verhalten-settings-save").click();

        // Back to the dashboard (re-reads the default on mount).
        await page.goto("/");
        const reference = await headerHeightAt(page, REFERENCE_WIDTH);
        const narrow = await headerHeightAt(page, NARROW_WIDTH);
        expect(narrow).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
    });
});
