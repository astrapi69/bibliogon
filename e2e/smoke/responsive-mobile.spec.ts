/**
 * Smoke tests for the mobile responsive pass (feature/responsive-mobile).
 *
 * Regression-pins the 375px+ layout behaviour that a component test
 * cannot observe (it depends on real CSS cascade + rendered geometry).
 * Two classes of assertion:
 *
 * 1. No horizontal page overflow -- documentElement.scrollWidth must not
 *    exceed the viewport on any covered surface, at 375 (iPhone SE), 390
 *    (iPhone 14) and 768 (iPad portrait).
 * 2. Fixed-grid list views stay reachable -- the BookListView /
 *    ArticleList list-view tables (fixed-pixel column grids) must render
 *    at their full content width inside an overflow-x-auto wrapper
 *    (horizontally scrollable), NOT be clipped to the viewport. Before
 *    the fix the grid sat under overflow:hidden and the right-hand
 *    columns were silently cut off; the width assertion fails on that
 *    pre-fix state.
 *
 * CC must run this spec (Aster) before release per the Pre-Release Gate.
 */

import {
    test,
    expect,
    createBook,
    createChapter,
    createArticle,
} from "../fixtures/base";
import type {Page} from "@playwright/test";

const WIDTHS = [
    {label: "iPhone SE 375", width: 375, height: 667},
    {label: "iPhone 14 390", width: 390, height: 844},
    {label: "iPad portrait 768", width: 768, height: 1024},
];

const LONG_TITLE =
    "Ein außergewöhnlich langer Buchtitel der die Tabellenspalten testet";

/** Pixels the document is allowed to exceed the viewport by (rounding /
 *  sub-pixel layout). A real overflow is many px; 1 is noise. */
const OVERFLOW_TOLERANCE = 1;

async function documentOverflow(page: Page): Promise<number> {
    return page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
    );
}

async function expectNoHorizontalOverflow(page: Page) {
    expect(await documentOverflow(page)).toBeLessThanOrEqual(OVERFLOW_TOLERANCE);
}

test.describe("responsive — no horizontal overflow", () => {
    for (const vp of WIDTHS) {
        test(`dashboard fits at ${vp.label}`, async ({page}) => {
            await createBook(LONG_TITLE);
            await page.setViewportSize({width: vp.width, height: vp.height});
            await page.goto("/");
            await expect(page.getByTestId("dashboard-header")).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test(`article list fits at ${vp.label}`, async ({page}) => {
            await createArticle(LONG_TITLE);
            await page.setViewportSize({width: vp.width, height: vp.height});
            await page.goto("/articles");
            await expect(page.getByTestId("article-list")).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test(`settings fits at ${vp.label}`, async ({page}) => {
            await page.setViewportSize({width: vp.width, height: vp.height});
            await page.goto("/settings");
            await page.waitForLoadState("networkidle");
            await expectNoHorizontalOverflow(page);
        });

        test(`writing history fits at ${vp.label}`, async ({page}) => {
            await page.setViewportSize({width: vp.width, height: vp.height});
            await page.goto("/writing-history");
            await page.waitForLoadState("networkidle");
            await expectNoHorizontalOverflow(page);
        });
    }
});

test.describe("responsive — list-view tables scroll, not clip", () => {
    test("book list view is scrollable at full width on iPhone SE", async ({
        page,
    }) => {
        await createBook(LONG_TITLE);
        await page.setViewportSize({width: 375, height: 667});
        await page.goto("/");
        await page.getByTestId("view-toggle-list").click();

        const table = page.getByTestId("book-list-view");
        await expect(table).toBeVisible();
        const box = await table.boundingBox();
        expect(box).not.toBeNull();
        // Fixed 6/7-column grid (~520px+). Pre-fix it was clipped to the
        // viewport; post-fix it lays out at its min-width and scrolls.
        expect(box!.width).toBeGreaterThan(600);
        // The wide table must not push the page itself wide.
        await expectNoHorizontalOverflow(page);
    });

    test("article list view is scrollable at full width on iPhone SE", async ({
        page,
    }) => {
        await createArticle(LONG_TITLE);
        await page.setViewportSize({width: 375, height: 667});
        await page.goto("/articles");
        await page.getByTestId("view-toggle-list").click();

        const list = page.getByTestId("article-list");
        await expect(list).toBeVisible();
        const box = await list.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(700);
        await expectNoHorizontalOverflow(page);
    });
});

test.describe("responsive — Story Bible sidebar overlays content", () => {
    test("story-bible panel is a fixed overlay below the menu breakpoint", async ({
        page,
    }) => {
        const book = await createBook(LONG_TITLE);
        await createChapter(book.id, "Kapitel 1", "");
        await page.setViewportSize({width: 375, height: 667});
        await page.goto(`/book/${book.id}`);

        // Below the menu breakpoint the chapter sidebar (which hosts the
        // Story-Bible toggle) starts collapsed -- open it first.
        await page.getByTestId("book-editor-sidebar-toggle").click();
        const toggle = page.getByTestId("story-bible-toggle");
        if (!(await toggle.isVisible().catch(() => false))) {
            test.skip(true, "Story Bible plugin not active in this build");
        }
        await toggle.click();

        const sidebar = page.getByTestId("story-bible-sidebar");
        await expect(sidebar).toBeVisible();
        const position = await sidebar.evaluate(
            (el) => getComputedStyle(el).position,
        );
        expect(position).toBe("fixed");
        await expectNoHorizontalOverflow(page);
    });
});
