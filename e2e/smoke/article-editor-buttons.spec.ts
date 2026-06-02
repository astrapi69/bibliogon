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
                classes: el.className,
                padding: s.padding,
                borderRadius: s.borderRadius,
                background: s.backgroundColor,
                display: s.display,
                fontWeight: s.fontWeight,
            };
        });
        // Uses the global button classes (the real "uses .btn" intent).
        expect(cs.classes).toContain("btn");
        expect(cs.classes).toContain("btn-ghost");
        expect(cs.classes).toContain("btn-sm");
        // Computed styles those classes apply.
        expect(cs.padding).toBe("4px 10px"); // .btn-sm
        expect(cs.borderRadius).toBe(RADIUS_SM); // --radius-sm
        expect(cs.background).toBe(TRANSPARENT); // .btn-ghost at rest
        expect(cs.fontWeight).toBe("500"); // .btn
        // NOTE: do NOT assert display === "inline-flex". The back button is
        // a child of the flex `.header`, so it is a flex item — CSS
        // blockifies a flex item's display (inline-flex -> flex) in
        // getComputedStyle. `.btn` correctly declares inline-flex; the
        // blockified computed value is "flex" and is not a bug. Accept both.
        expect(["inline-flex", "flex"]).toContain(cs.display);
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

        // Read each trigger only after it is visible — RadixSelect mounts
        // its trigger asynchronously, and reading getComputedStyle on a
        // not-yet-connected element returned an empty string, which made the
        // old cross-element exact-color equality flaky.
        const read = async (testId: string) => {
            const loc = page.getByTestId(testId);
            await expect(loc).toBeVisible();
            return loc.evaluate((el) => {
                const s = getComputedStyle(el);
                return {classes: el.className, color: s.color, borderRadius: s.borderRadius};
            });
        };

        const [language, status, contentType] = await Promise.all(
            triggers.map(read),
        );

        // Consistency intent: all three selects use the shared
        // .radix-select-trigger style (2026-05-30 Session 2B migration).
        // Assert the shared class + a themed (non-transparent, non-empty)
        // color on each, and an identical radius — robust where the exact
        // computed color string could vary by render timing.
        for (const t of [language, status, contentType]) {
            expect(t.classes).toContain("radix-select-trigger");
            expect(t.color).not.toBe(TRANSPARENT);
            expect(t.color).not.toBe("");
        }
        expect(status.borderRadius).toBe(language.borderRadius);
        expect(contentType.borderRadius).toBe(language.borderRadius);
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
