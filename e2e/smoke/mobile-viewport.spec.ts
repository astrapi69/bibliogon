/**
 * Mobile-viewport smoke (LAN-MODE-PHASE-1 C5).
 *
 * Phase 1 makes Bibliogon reachable from a phone over the LAN, so the
 * key screens must render usably at a phone width. This walks the main
 * navigational surfaces at 375px and asserts each mounts its primary
 * element AND that the Dashboard has no horizontal overflow (the
 * mobile layout-break class: a stray fixed width pushes a scrollbar
 * and the user can't reach the right edge).
 *
 * Deliberately a happy-path render check, not a deep interaction test;
 * per-feature behaviour is covered by the feature specs. Written by
 * Claude Code; Aster runs it (per the E2E gate).
 */

import {test, expect} from "../fixtures/base";
import {createBook, createChapter} from "../helpers/api";

test.use({viewport: {width: 375, height: 812}});

test.describe("Mobile viewport (375px): key screens render usably", () => {
    test("Dashboard, Articles, Settings and a book editor at phone width", async ({
        page,
        resetDatabase,
    }) => {
        void resetDatabase;
        const book = await createBook("Mobile Smoke Buch");
        await createChapter(book.id, "Kapitel 1");

        // Dashboard. The "new book" split-button is the primary CTA and
        // stays visible at phone width (only its text label is
        // ``hide-mobile``, the button itself is not). The
        // ``articles-nav-btn`` is deliberately ``hide-mobile`` (it lives
        // in the hamburger menu on phones), so it is NOT a valid
        // mobile-visibility anchor.
        await page.goto("/");
        await expect(page.getByTestId("new-book-btn")).toBeVisible();
        // No horizontal overflow at phone width (4px sub-pixel tolerance).
        const overflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(4);

        // Articles list.
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        // Settings > About (hosts the LAN-access card; self-hidden off LAN).
        await page.goto("/settings?tab=about");
        await expect(page.getByTestId("about-settings-root")).toBeVisible();

        // Book editor (BookEditor carries no testid; the TipTap surface is
        // the stable anchor that the chapter mounted).
        await page.goto(`/book/${book.id}`);
        await expect(page.locator(".ProseMirror").first()).toBeVisible();
    });
});
