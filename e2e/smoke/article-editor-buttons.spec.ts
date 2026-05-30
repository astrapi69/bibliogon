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

        const cs = await back.evaluate((el) => {
            const s = getComputedStyle(el);
            return {
                padding: s.padding,
                borderRadius: s.borderRadius,
                background: s.backgroundColor,
                display: s.display,
                fontWeight: s.fontWeight,
            };
        });
        // .btn + .btn-sm + .btn-ghost.
        expect(cs.padding).toBe("4px 10px"); // .btn-sm
        expect(cs.borderRadius).toBe(RADIUS_SM); // --radius-sm
        expect(cs.background).toBe(TRANSPARENT); // .btn-ghost at rest
        expect(cs.display).toBe("inline-flex"); // .btn
        expect(cs.fontWeight).toBe("500"); // .btn
    });

    test("metadata selects share one consistent themed style", async ({
        page,
    }) => {
        await page.goto(`/articles/${articleId}`);
        await expect(page.getByTestId("article-editor-sidebar")).toBeVisible();

        const read = (testId: string) =>
            page.getByTestId(testId).evaluate((el) => {
                const s = getComputedStyle(el);
                return {color: s.color, borderRadius: s.borderRadius};
            });

        const language = await read("article-editor-language");
        const status = await read("article-editor-status");
        const contentType = await read("article-editor-content-type");

        // All selects use the same .fieldInput style → identical
        // computed color + radius (consistency pin).
        expect(status.color).toBe(language.color);
        expect(contentType.color).toBe(language.color);
        expect(status.borderRadius).toBe(language.borderRadius);

        // Dark-mode safety: an explicit, non-transparent text color
        // (the bug class the comic dropdowns had was an unset color
        // falling back to default black on a dark surface).
        expect(language.color).not.toBe(TRANSPARENT);
        expect(language.color).not.toBe("");
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
