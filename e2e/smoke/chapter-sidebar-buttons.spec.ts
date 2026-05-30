/**
 * Visual + behavioural regression pins for the C-chapter button
 * unification (2026-05-30): ChapterSidebar's 12 buttons migrated
 * from per-editor CSS-module classes to the global
 * ``.btn-sidebar-icon`` / ``.btn-sidebar-block`` sidebar button
 * system. "CSS is math, not guesswork" — these assert the computed
 * styles, bounding boxes, hover-reveal opacity and a screenshot
 * baseline so a future refactor can't silently regress the look.
 *
 * Critical pin: the delete button's hover-reveal. Before this
 * migration ``.deleteBtn`` had ``opacity: 0`` with NO reveal rule
 * anywhere in the module CSS — the delete affordance was
 * permanently invisible (clickable but unseeable). The migration
 * added the ``.item:hover / :focus-within .deleteReveal`` rule; the
 * opacity-0-at-rest → opacity-1-on-hover assertion locks it in.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";

const RADIUS_SM = "4px"; // --radius-sm
const TRANSPARENT = "rgba(0, 0, 0, 0)";

test.describe("ChapterSidebar button unification", () => {
    let bookId: string;
    let chapterId: string;

    test.beforeEach(async () => {
        const book = await createBook("Sidebar Button Test");
        const chapter = await createChapter(book.id, "Kapitel 1", "");
        bookId = book.id;
        chapterId = chapter.id;
    });

    test("icon buttons use the global .btn-sidebar-icon computed style", async ({
        page,
    }) => {
        await page.goto(`/book/${bookId}`);
        await expect(page.getByTestId("chapter-sidebar-list")).toBeVisible();

        const back = page.getByTestId("chapter-sidebar-back");
        const cs = await back.evaluate((el) => {
            const s = getComputedStyle(el);
            return {
                padding: s.padding,
                borderRadius: s.borderRadius,
                background: s.backgroundColor,
                display: s.display,
            };
        });
        // .btn-sidebar-icon: padding 6px, --radius-sm radius,
        // transparent at rest, inline-flex.
        expect(cs.padding).toBe("6px");
        expect(cs.borderRadius).toBe(RADIUS_SM);
        expect(cs.background).toBe(TRANSPARENT);
        expect(cs.display).toBe("inline-flex");

        // The sidebar back button shares the sidebar text color with
        // the rest of the sidebar chrome (same --text-sidebar token).
        const backColor = await back.evaluate(
            (el) => getComputedStyle(el).color,
        );
        const footerColor = await page
            .getByTestId("chapter-sidebar-footer")
            .evaluate((el) => getComputedStyle(el).color);
        expect(backColor).toBe(footerColor);
    });

    test("footer actions use the full-width .btn-sidebar-block", async ({
        page,
    }) => {
        await page.goto(`/book/${bookId}`);
        await expect(page.getByTestId("chapter-sidebar-footer")).toBeVisible();

        const button = page.getByTestId("sidebar-save-as-template");
        const cs = await button.evaluate((el) => {
            const s = getComputedStyle(el);
            return {borderRadius: s.borderRadius, fontWeight: s.fontWeight};
        });
        expect(cs.borderRadius).toBe(RADIUS_SM);
        expect(cs.fontWeight).toBe("500");

        const box = await button.boundingBox();
        const footerBox = await page
            .getByTestId("chapter-sidebar-footer")
            .boundingBox();
        expect(box).not.toBeNull();
        expect(footerBox).not.toBeNull();
        // Not collapsed, and effectively full-width inside the footer
        // (footer has 16px horizontal padding → ~32px total).
        expect(box!.height).toBeGreaterThan(24);
        expect(box!.width).toBeGreaterThanOrEqual(footerBox!.width - 40);
    });

    test("delete button is hidden at rest and revealed on row hover", async ({
        page,
    }) => {
        await page.goto(`/book/${bookId}`);
        const row = page.getByTestId(`chapter-item-${chapterId}`);
        await expect(row).toBeVisible();

        const del = page.getByTestId(`chapter-delete-${chapterId}`);
        // At rest: opacity 0 (the reveal-rule fix — was permanently
        // 0 before, with nothing to raise it on hover).
        expect(await del.evaluate((el) => getComputedStyle(el).opacity)).toBe(
            "0",
        );

        // Hover the row → opacity transitions to 1.
        await row.hover();
        await expect
            .poll(async () =>
                del.evaluate((el) => getComputedStyle(el).opacity),
            )
            .toBe("1");

        // It has a real, clickable hit area once revealed.
        const box = await del.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
    });

    test("sidebar header + footer visual baseline", async ({page}) => {
        await page.setViewportSize({width: 1400, height: 900});
        await page.goto(`/book/${bookId}`);
        await expect(page.getByTestId("chapter-sidebar-list")).toBeVisible();

        await expect(page.getByTestId("chapter-sidebar-header")).toHaveScreenshot(
            "chapter-sidebar-header.png",
        );
        await expect(page.getByTestId("chapter-sidebar-footer")).toHaveScreenshot(
            "chapter-sidebar-footer.png",
        );
    });
});
