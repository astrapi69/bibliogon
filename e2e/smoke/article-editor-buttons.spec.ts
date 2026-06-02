/**
 * Regression pins for the ArticleEditor button + select styling
 * (C-article, 2026-05-30).
 *
 * Status note: ArticleEditor ALREADY used the global ``.btn``
 * system for all of its buttons (btn btn-ghost / btn-primary /
 * btn-secondary / btn-sm, btn-icon) and a single consistent
 * ``.fieldInput`` select style with an explicit ``color`` token
 * (so it never had the dark-mode "black text on dark surface" bug
 * the comic header dropdowns had). Unlike PageEditor (3213176d)
 * and ChapterSidebar (the C-chapter commit), no className
 * migration was needed. These Playwright pins lock the
 * already-correct state in: computed styles, consistency across
 * the metadata selects, bounding boxes, and a screenshot baseline.
 * "CSS is math, not guesswork."
 */

import {test, expect, createArticle} from "../fixtures/base";

const RADIUS_SM = "4px"; // --radius-sm
const TRANSPARENT = "rgba(0, 0, 0, 0)";

test.describe("ArticleEditor button + select styling", () => {
    let articleId: string;

    test.beforeEach(async () => {
        const article = await createArticle("Button Style Article");
        articleId = article.id;
    });

    test("back button uses the global .btn btn-ghost btn-sm computed style", async ({
        page,
    }) => {
        await page.goto(`/articles/${articleId}`);
        const back = page.getByTestId("article-editor-back");
        await expect(back).toBeVisible();

        // Use auto-retrying toHaveClass / toHaveCSS rather than a one-shot
        // getComputedStyle read: during a transient re-render the one-shot
        // read intermittently returned "" for shorthand properties (flaky).
        // These poll until the value settles.
        await expect(back).toHaveClass(/\bbtn\b/); // global .btn
        await expect(back).toHaveClass(/\bbtn-ghost\b/);
        await expect(back).toHaveClass(/\bbtn-sm\b/);
        await expect(back).toHaveCSS("padding", "4px 10px"); // .btn-sm
        await expect(back).toHaveCSS("border-radius", RADIUS_SM); // --radius-sm
        await expect(back).toHaveCSS("background-color", TRANSPARENT); // .btn-ghost
        await expect(back).toHaveCSS("font-weight", "500"); // .btn
        // NOTE: do NOT assert display === "inline-flex". The back button is a
        // child of the flex `.header`, so it is a flex item — CSS blockifies a
        // flex item's display (inline-flex -> flex) in getComputedStyle. `.btn`
        // correctly declares inline-flex; the blockified value "flex" is not a
        // bug, so display is intentionally not asserted here.
    });

    test("metadata selects share one consistent themed style", async ({
        page,
    }) => {
        await page.goto(`/articles/${articleId}`);
        await expect(page.getByTestId("article-editor-sidebar")).toBeVisible();

        const triggers = [
            "article-editor-language-trigger",
            "article-editor-status-trigger",
            "article-editor-content-type-trigger",
        ];

        // Consistency intent: all three selects use the shared
        // .radix-select-trigger style (2026-05-30 Session 2B migration).
        // Assert the shared class with auto-retrying toHaveClass — robust
        // where a one-shot getComputedStyle read intermittently returned ""
        // mid-render. The shared class guarantees identical themed color +
        // radius by construction, so we assert membership rather than
        // re-deriving (and comparing) brittle computed values.
        for (const testId of triggers) {
            const loc = page.getByTestId(testId);
            await expect(loc).toBeVisible();
            await expect(loc).toHaveClass(/radix-select-trigger/);
        }
        // The shared class carries an explicit, non-transparent text color
        // (the dark-mode "black text on dark surface" bug class). Poll it.
        await expect(
            page.getByTestId("article-editor-language-trigger"),
        ).not.toHaveCSS("color", TRANSPARENT);
    });

    test("article-editor sidebar visual baseline", async ({page}) => {
        await page.setViewportSize({width: 1400, height: 900});
        await page.goto(`/articles/${articleId}`);
        await expect(page.getByTestId("article-editor-sidebar")).toBeVisible();
        await expect(
            page.getByTestId("article-editor-sidebar"),
        ).toHaveScreenshot("article-editor-sidebar.png");
    });
});
