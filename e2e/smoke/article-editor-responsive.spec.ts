/**
 * Issue #135 regression pin: the ArticleEditor header toolbar must NOT
 * overflow horizontally on narrow viewports.
 *
 * Before the fix, ``layout.header`` was a fixed flex row with no wrap, so
 * on a phone-width viewport the toggle + back + dashboard + title + save +
 * actions + theme controls spilled past the edge and forced a horizontal
 * scroll. The fix adds ``flex-wrap`` and hides the back/dashboard text
 * labels below ``sm``.
 *
 * jsdom cannot compute layout, so this real-browser pin asserts the header
 * (and the document) have no horizontal overflow at 375px. The metadata
 * sidebar collapse was already implemented (commit 285652e7); a wide
 * viewport keeps it expanded by default, a narrow one collapses it.
 */

import {test, expect, createArticle} from "../fixtures/base";

const SIDEBAR_KEY = "bibliogon-article-editor-sidebar";

test.describe("ArticleEditor responsive (#135)", () => {
    test("narrow viewport: header does not overflow, sidebar collapsed", async ({
        page,
    }) => {
        const article = await createArticle("Responsive Header Article");
        // Clear any persisted sidebar preference so the viewport-default
        // (collapsed below 1200px) is deterministic.
        await page.addInitScript((key) => {
            try {
                localStorage.removeItem(key);
            } catch {
                /* ignore */
            }
        }, SIDEBAR_KEY);
        await page.setViewportSize({width: 375, height: 720});
        await page.goto(`/articles/${article.id}`);

        const wrapper = page.getByTestId("article-editor-sidebar-wrapper");
        await expect(wrapper).toHaveAttribute("data-sidebar-open", "false");

        const header = page.locator("header").first();
        await expect(header).toBeVisible();
        const headerOverflow = await header.evaluate(
            (el) => el.scrollWidth - el.clientWidth,
        );
        expect(headerOverflow).toBeLessThanOrEqual(1);

        const docOverflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        );
        expect(docOverflow).toBeLessThanOrEqual(1);

        await expect(
            page.getByTestId("article-editor-sidebar-toggle"),
        ).toBeVisible();
    });

    test("wide viewport: metadata sidebar expanded by default", async ({
        page,
    }) => {
        const article = await createArticle("Responsive Wide Article");
        await page.addInitScript((key) => {
            try {
                localStorage.removeItem(key);
            } catch {
                /* ignore */
            }
        }, SIDEBAR_KEY);
        await page.setViewportSize({width: 1300, height: 900});
        await page.goto(`/articles/${article.id}`);

        await expect(
            page.getByTestId("article-editor-sidebar-wrapper"),
        ).toHaveAttribute("data-sidebar-open", "true");
        await expect(page.getByTestId("article-editor-sidebar")).toBeVisible();
    });
});
