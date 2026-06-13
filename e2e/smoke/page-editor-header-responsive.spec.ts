/**
 * Issue #138 regression pin: the picture-book (PageEditor) header toolbar
 * must NOT overflow horizontally on narrow viewports.
 *
 * The dual sidebars + mutual exclusion + canvas were already responsive
 * (see page-editor-sidebars.spec.ts); the header toolbar was a fixed flex
 * row with no wrap, so on a phone-width viewport the back + title +
 * metadata + storyboard + fullscreen + PdfExportControls + theme controls
 * spilled past the edge. The fix adds flex-wrap and hides the
 * metadata/storyboard/fullscreen text labels below sm.
 *
 * jsdom cannot compute layout; this real-browser pin asserts the header
 * (and the document) have no horizontal overflow at 375px. Aster runs it.
 */

import {test, expect, createPictureBook} from "../fixtures/base";

test.describe("PageEditor header responsive (#138)", () => {
    test("header toolbar does not overflow at phone width", async ({page}) => {
        const book = await createPictureBook("Picture Header Responsive");
        await page.setViewportSize({width: 375, height: 667});
        await page.goto(`/book/${book.id}`);
        await expect(page.getByTestId("page-editor-root")).toBeVisible();

        const header = page.getByTestId("page-editor-header");
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
    });
});
