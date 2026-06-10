/**
 * Comic-book editor multi-panel layout smoke
 * (PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01, 2026-05-20).
 *
 * Closes Findings #2 (Multi-Panel-Bug) + #4 (Standard-Layouts)
 * from the 4-user-findings audit.
 *
 * The bug this spec pins: prior to Phase 1, every comic page
 * defaulted to the γ-shim single_panel template (1 CSS grid cell).
 * Adding a 2nd panel spilled into an implicit auto-row that
 * collapsed to ~0 height because the panel's intrinsic height is 0
 * (bubbles are position:absolute and contribute no height). The
 * user-visible symptom: "Second panel is too small".
 *
 * The fix shipped in Phase 1: ComicGridTemplatePicker UI in the
 * editor header writes ``Page.layout_config.comic_grid_template``
 * to one of 6 user-facing Standard Layouts. Adding panels under a
 * multi-cell template uses the explicit grid cells, NOT implicit
 * auto-rows. Each panel renders at its full cell-height.
 *
 * Per "Playwright-visible ≠ User-visible" Lessons-Learned: this
 * spec asserts boundingBox.height > 50px (a generous floor; the
 * actual cell height in a 2x2 grid of an ~800×800 canvas is ~400px;
 * the bug rendered the 2nd panel at <10px). The 50px floor
 * differentiates "rendered correctly" from "CSS-collapsed to a
 * strip" without being brittle to slight viewport variations.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book multi-panel layout smoke", () => {
    test("default single_panel: first panel renders at full height", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Single Panel Default",
            "E2E Author",
        );
        await page.goto(`/book/${book.id}`);
        await page
            .getByTestId("comic-book-editor-add-page")
            .click();

        // Default template after Create-First-Page is single_panel.
        await expect(
            page.getByTestId("comic-grid-template-picker-trigger"),
        ).toHaveAttribute("data-value", "single_panel");

        await page.getByTestId("comic-book-editor-add-panel").click();
        const panel = page.locator(
            // Scope to the canvas grid: the bare ``comic-panel-``
            // prefix also matches side-pane controls
            // (comic-panel-tier1-section / -trigger, ~34px tall),
            // which overmatched nth(1) and read as a "collapsed
            // panel". Per LL "Prefix testid selectors match every
            // nested testid that shares the prefix".
            '[data-testid="comic-page-grid"] [data-testid^="comic-panel-"]:not([data-testid*="-bubble-"]):not([data-testid*="-image-"]):not([data-testid*="-upload"])',
        ).first();
        await expect(panel).toBeVisible();
        const bbox = await panel.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(200);
    });

    test("grid_2x2: switching template enables a 4-cell layout with no panel collapse", async ({
        page,
    }) => {
        const book = await createComicBook("2x2 Layout", "E2E Author");
        await page.goto(`/book/${book.id}`);
        await page
            .getByTestId("comic-book-editor-add-page")
            .click();

        // Switch to grid_2x2 BEFORE adding panels.
        const picker = page.getByTestId(
            "comic-grid-template-picker-trigger",
        );
        await picker.click();
    await page.getByTestId("comic-grid-template-picker-item-grid_2x2").click();
        await expect(picker).toHaveAttribute("data-value", "grid_2x2");

        // Confirm the grid root carries the matching data attribute.
        await expect(
            page.getByTestId("comic-page-grid"),
        ).toHaveAttribute("data-grid-template", "grid_2x2");

        // Scope to the canvas grid: the bare ``comic-panel-``
        // prefix also matches side-pane controls
        // (comic-panel-tier1-section / -trigger, ~34px tall),
        // which overmatched nth(1) and read as a "collapsed
        // panel". Per LL "Prefix testid selectors match every
        // nested testid that shares the prefix".
        const panels = page.locator(
            '[data-testid="comic-page-grid"] [data-testid^="comic-panel-"]:not([data-testid*="-bubble-"]):not([data-testid*="-image-"]):not([data-testid*="-upload"])',
        );

        // Add 2 panels into the grid_2x2 layout. Add-panel POSTs +
        // refreshes asynchronously; clicking twice back-to-back drops
        // the second add (the refresh from the first hasn't landed).
        // Wait for each panel to mount before adding the next.
        await page.getByTestId("comic-book-editor-add-panel").click();
        await expect(panels).toHaveCount(1);
        await page.getByTestId("comic-book-editor-add-panel").click();
        await expect(panels).toHaveCount(2);

        // Regression pin for the "Second panel too small" bug: the
        // added panels must render at proper cell height (NOT collapsed
        // to ~0-10px). Assert both added panels render >50px tall.
        await expect(panels.first()).toBeVisible();
        const count = await panels.count();
        expect(count).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < 2; i++) {
            const bbox = await panels.nth(i).boundingBox();
            expect(bbox).not.toBeNull();
            expect(bbox!.height).toBeGreaterThan(50);
        }
    });

    test("layout_picker exposes all 6 user-facing templates", async ({
        page,
    }) => {
        const book = await createComicBook("Picker Options", "E2E Author");
        await page.goto(`/book/${book.id}`);
        await page
            .getByTestId("comic-book-editor-add-page")
            .click();

        // Confirm each of the 6 standard-layout options is in the
        // picker. Per Q4 audit: grid_3x3 is intentionally NOT in
        // the picker (legacy/advanced).
        // RadixSelect renders portal divs (role=option / item testids),
        // NOT native <option> elements, in the browser. Open the
        // dropdown and read the item testids' value suffixes.
        await page.getByTestId("comic-grid-template-picker-trigger").click();
        const items = page.locator(
            '[data-testid^="comic-grid-template-picker-item-"]',
        );
        const optionValues = await items.evaluateAll((els) =>
            els.map((el) =>
                (el.getAttribute("data-testid") ?? "").replace(
                    "comic-grid-template-picker-item-",
                    "",
                ),
            ),
        );
        expect(optionValues).toEqual([
            "single_panel",
            "grid_1x2",
            "grid_2x1",
            "grid_2x2",
            "grid_2x3",
            "grid_3x2",
        ]);
        expect(optionValues).not.toContain("grid_3x3");
        await page.keyboard.press("Escape");
    });

    test("grid_1x2: switching layout updates grid-template attr + persists", async ({
        page,
    }) => {
        const book = await createComicBook("1x2 Layout", "E2E Author");
        await page.goto(`/book/${book.id}`);
        await page
            .getByTestId("comic-book-editor-add-page")
            .click();

        await page.getByTestId("comic-grid-template-picker-trigger").click();
        await page
            .getByTestId("comic-grid-template-picker-item-grid_1x2")
            .click();
        await expect(
            page.getByTestId("comic-page-grid"),
        ).toHaveAttribute("data-grid-template", "grid_1x2");

        // Reload to verify the template persisted server-side.
        await page.reload();
        await expect(
            page.getByTestId("comic-grid-template-picker-trigger"),
        ).toHaveAttribute("data-value", "grid_1x2");
    });
});
