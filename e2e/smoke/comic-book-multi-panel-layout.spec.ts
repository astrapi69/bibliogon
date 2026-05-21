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
            .getByTestId("comic-book-editor-create-first-page")
            .click();

        // Default template after Create-First-Page is single_panel.
        await expect(
            page.getByTestId("comic-grid-template-picker-select"),
        ).toHaveValue("single_panel");

        await page.getByTestId("comic-book-editor-add-panel").click();
        const panel = page.locator(
            '[data-testid^="comic-panel-"]:not([data-testid*="-bubble-"]):not([data-testid*="-image-"])',
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
            .getByTestId("comic-book-editor-create-first-page")
            .click();

        // Switch to grid_2x2 BEFORE adding panels.
        const picker = page.getByTestId(
            "comic-grid-template-picker-select",
        );
        await picker.selectOption("grid_2x2");
        await expect(picker).toHaveValue("grid_2x2");

        // Confirm the grid root carries the matching data attribute.
        await expect(
            page.getByTestId("comic-page-grid"),
        ).toHaveAttribute("data-grid-template", "grid_2x2");

        // Add 2 panels. Both must render at proper cell height (not
        // collapsed). This is the regression-pin for the user-
        // reported "Second panel too small" bug.
        await page.getByTestId("comic-book-editor-add-panel").click();
        await page.getByTestId("comic-book-editor-add-panel").click();

        const panels = page.locator('[data-testid^="comic-panel-"]');
        await expect(panels).toHaveCount(2);

        // Non-zero-height assertion: each panel must be >50px tall.
        // Pre-Phase-1 bug: 2nd panel collapsed to ~0-10px.
        const heights: number[] = [];
        for (let i = 0; i < 2; i++) {
            const bbox = await panels.nth(i).boundingBox();
            expect(bbox).not.toBeNull();
            heights.push(bbox!.height);
        }
        expect(heights[0]).toBeGreaterThan(50);
        expect(heights[1]).toBeGreaterThan(50);
    });

    test("layout_picker exposes all 6 user-facing templates", async ({
        page,
    }) => {
        const book = await createComicBook("Picker Options", "E2E Author");
        await page.goto(`/book/${book.id}`);
        await page
            .getByTestId("comic-book-editor-create-first-page")
            .click();

        // Confirm each of the 6 standard-layout options is in the
        // picker. Per Q4 audit: grid_3x3 is intentionally NOT in
        // the picker (legacy/advanced).
        const select = page.getByTestId(
            "comic-grid-template-picker-select",
        );
        const optionValues = await select
            .locator("option")
            .evaluateAll((opts) =>
                opts.map((o) => (o as HTMLOptionElement).value),
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
    });

    test("grid_1x2: switching layout updates grid-template attr + persists", async ({
        page,
    }) => {
        const book = await createComicBook("1x2 Layout", "E2E Author");
        await page.goto(`/book/${book.id}`);
        await page
            .getByTestId("comic-book-editor-create-first-page")
            .click();

        await page
            .getByTestId("comic-grid-template-picker-select")
            .selectOption("grid_1x2");
        await expect(
            page.getByTestId("comic-page-grid"),
        ).toHaveAttribute("data-grid-template", "grid_1x2");

        // Reload to verify the template persisted server-side.
        await page.reload();
        await expect(
            page.getByTestId("comic-grid-template-picker-select"),
        ).toHaveValue("grid_1x2");
    });
});
