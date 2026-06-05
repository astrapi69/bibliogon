/**
 * AD-HEADER-SINGLE-LINE-01 (2026-05-30) regression pin.
 *
 * The Article-Dashboard header must stay on a SINGLE LINE at
 * 900px+ viewport width. It wrapped to two lines twice:
 *   1. the original nav-jump (fixed v0.38.0 by folding the
 *      standalone Medium-import button into the Import chevron),
 *   2. again after ARTICLE-TYPES-SSOT-01 C5 (commit 76737700)
 *      replaced the plain "Neuer Artikel" button with a
 *      SplitButton, adding a second chevron to the cluster.
 *
 * The fix folds the standalone "Backup" button into the Import
 * chevron dropdown, making the cluster ~one button narrower than
 * the Book Dashboard (the known-good single-line baseline).
 *
 * This pin detects a wrap by comparing the header height at the
 * target width against its height at a generous reference width
 * (1440px, where the cluster is guaranteed single-line): a header
 * that stays single-line does NOT grow when narrowed, whereas a wrap
 * adds a full control row (~36px+). Comparing widths instead of
 * asserting an absolute pixel height keeps the pin robust across
 * rendering environments — the single-line header is ~56px on the
 * baseline env but ~97px under a different font stack, which the old
 * absolute `< 80px` threshold flagged as a false positive even though
 * the header was a single line at every width.
 *
 * Also pins that Backup moved INTO the Import chevron dropdown
 * (it is no longer a standalone header button).
 */

import {test, expect} from "../fixtures/base";

const REFERENCE_WIDTH = 1440; // wide enough that the cluster is single-line
const WRAP_TOLERANCE = 8; // px of control-height jitter allowed before "wrap"

async function headerHeightAt(
    page: import("@playwright/test").Page,
    width: number,
): Promise<number> {
    await page.setViewportSize({width, height: 800});
    await expect(page.getByTestId("article-list-page")).toBeVisible();
    const header = page.getByTestId("article-list-header");
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    return box!.height;
}

test.describe("AD-HEADER-SINGLE-LINE-01", () => {
    // RESOLVED by MENU-SINGLE-LINE-HAMBURGER-COLLAPSE-01 (2026-06-05).
    // ARTICLE-HEADER-900PX-WRAP-01 used to wrap the German (default,
    // widest-label) header at 900px. The header now NEVER wraps: the
    // secondary cluster collapses into the hamburger (useOverflowCollapse,
    // content-aware so it also fires on the language / default-type label
    // triggers). German is the active locale here, i.e. the worst case, so
    // this is the language-trigger single-line pin. It FAILS on the pre-fix
    // code (the bar wrapped to ~2 rows at 900px) and PASSES after.
    test(
        "Article-Dashboard header stays single-line at 900px",
        async ({page}) => {
            await page.goto("/articles");
            const reference = await headerHeightAt(page, REFERENCE_WIDTH);
            const narrow = await headerHeightAt(page, 900);
            // Single-line: narrowing must not add a wrapped row.
            expect(narrow).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
        },
    );

    // Proves the bar COLLAPSED to the hamburger (rather than wrapped or
    // clipped) at the width where German overflows: the hamburger trigger is
    // present AND the inline secondary cluster is not rendered inline.
    test("collapses to the hamburger at 900px, not a second row", async ({
        page,
    }) => {
        await page.setViewportSize({width: 900, height: 800});
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();
        // Overflow trigger present...
        await expect(
            page.getByTestId("article-list-mobile-menu"),
        ).toBeVisible();
        // ...and the inline secondary cluster is collapsed (out of flow),
        // so a representative inline-only control is not visible inline.
        await expect(page.getByTestId("books-nav-btn")).toBeHidden();
        // The collapsed actions are reachable from the hamburger.
        await page.getByTestId("article-list-mobile-menu").click();
        await expect(
            page.getByTestId("article-list-mobile-menu-books"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });

    // The mirror of the collapse pin: at a generous width the full bar is
    // inline and the hamburger is absent (proves the bar re-expands).
    test("shows the full inline bar (no hamburger) at 1440px", async ({
        page,
    }) => {
        await page.setViewportSize({width: REFERENCE_WIDTH, height: 800});
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();
        await expect(page.getByTestId("books-nav-btn")).toBeVisible();
        await expect(
            page.getByTestId("article-list-mobile-menu"),
        ).toHaveCount(0);
    });

    test("header stays single-line at 1024px too", async ({page}) => {
        await page.goto("/articles");
        const reference = await headerHeightAt(page, REFERENCE_WIDTH);
        const narrow = await headerHeightAt(page, 1024);
        expect(narrow).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
    });

    test("Backup lives in the Import chevron dropdown, not a standalone button", async ({
        page,
    }) => {
        await page.setViewportSize({width: 1024, height: 800});
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        // Open the Import chevron and confirm both import + backup
        // actions are present in the dropdown.
        await page.getByTestId("article-import-chevron").click();
        await expect(
            page.getByTestId("article-medium-import-btn"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-backup-export-btn"),
        ).toBeVisible();

        await page.keyboard.press("Escape");
    });
});
