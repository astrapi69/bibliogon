/**
 * Comic-book editor full Add/Delete CRUD cycle smoke (Session 3
 * close: PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 + perception-lag
 * follow-up).
 *
 * Closes the test-gap that made the user-report "Add panel button
 * geht nicht" uncatchable by CI. The bug turned out to be a
 * perception-lag class (newly-created panel is visually subtle on
 * empty grid) — addressed by the auto-select follow-up. This spec
 * pins the underlying functional contract: clicking each of the
 * four action buttons (Add Panel, Add Bubble, Delete Bubble,
 * Delete Panel) actually mutates DOM state.
 *
 * The Session-2 predecessor (which only covered the "no pages
 * yet" degraded state) is replaced here; that state is closed by
 * the Create-First-Page button covered in comic-book-editor.spec.ts.
 *
 * Cycle exercised:
 *   1. Create-First-Page → page nav appears
 *   2. Add Panel        → panel count 0 → 1
 *   3. Click the panel  → selectedPanelId set (panel-click is a
 *                         no-op when the panel is already auto-
 *                         selected post-C2; required pre-C2 to
 *                         enable Add-Bubble)
 *   4. Add Bubble       → bubble count 0 → 1
 *   5. Click the bubble → selectedBubbleId set (same idempotent
 *                         shape as the panel click)
 *   6. Delete Bubble    → bubble count 1 → 0
 *   7. Delete Panel     → panel count 1 → 0
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book editor full Add/Delete CRUD cycle", () => {
    test("Add Panel + Add Bubble + Delete Bubble + Delete Panel round-trip", async ({
        page,
    }) => {
        const book = await createComicBook("CRUD Cycle Test", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Step 1: Create first page (closes the empty state).
        // Post-MULTI-PAGE-NAVIGATION-01 C1: sidebar add-page button
        // replaces the prior dedicated create-first-page button;
        // sidebar page-list replaces the prior chip-nav.
        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();

        // Step 2: Add Panel — panel count goes 0 → 1.
        const panels = page.locator('[data-testid^="comic-panel-"]');
        await expect(panels).toHaveCount(0);
        await page.getByTestId("comic-book-editor-add-panel").click();
        await expect(panels).toHaveCount(1);

        // Step 3: select the panel so Add-Bubble enables. Idempotent
        // when the panel is already selected (post-C2 auto-select)
        // because onPanelClick is set-not-toggle.
        await panels.first().click();
        await expect(
            page.getByTestId("comic-book-editor-add-bubble"),
        ).toBeEnabled();

        // Step 4: Add Bubble — bubble count goes 0 → 1.
        // Selector scoped to the canvas grid because
        // LayoutConfigComicBubble's inner controls (in the side-pane)
        // share the ``comic-bubble-*`` testid prefix; a bare
        // ``[data-testid^="comic-bubble-"]`` would overmatch 30+
        // slider/fieldset/radio elements once the side-pane mounts
        // via auto-select. Documented anti-pattern: "Prefix testid
        // selectors match every nested testid that shares the prefix."
        const bubbles = page.locator(
            '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-"]',
        );
        await expect(bubbles).toHaveCount(0);
        await page.getByTestId("comic-book-editor-add-bubble").click();
        await expect(bubbles).toHaveCount(1);

        // Step 5: select the bubble so Delete-Bubble enables.
        // Idempotent the same way as the panel click.
        await bubbles.first().click();
        await expect(
            page.getByTestId("comic-book-editor-delete-bubble"),
        ).toBeEnabled();

        // Step 6: Delete Bubble — bubble count goes 1 → 0.
        await page.getByTestId("comic-book-editor-delete-bubble").click();
        await expect(bubbles).toHaveCount(0);

        // Step 7: Delete Panel — panel count goes 1 → 0. After
        // delete-bubble the selectedPanelId stays set (only the
        // bubble was deselected), so Delete Panel is enabled.
        await expect(
            page.getByTestId("comic-book-editor-delete-panel"),
        ).toBeEnabled();
        await page.getByTestId("comic-book-editor-delete-panel").click();
        await expect(panels).toHaveCount(0);
    });

    test("PDF format dropdown carries the 5 KDP options", async ({page}) => {
        const book = await createComicBook(
            "PDF Dropdown Test",
            "E2E Author",
        );
        await page.goto(`/book/${book.id}`);

        // Reuse-of-picture-book-formats decision (Q4 a) is the
        // contract: comic-book PDFs use the same 5 KDP trim sizes
        // as picture-books. If a future commit narrows the set
        // for comic-book without updating the spec, this assertion
        // fires.
        const select = page.getByTestId(
            "comic-book-editor-pdf-format-trigger",
        );
        await expect(select).toBeVisible();
        // RadixSelect renders portal divs (role=option), NOT native
        // <option> elements, in the browser. Open the dropdown and
        // count the rendered options.
        await select.click();
        const options = await page.getByRole("option").allTextContents();
        expect(options.length).toBeGreaterThanOrEqual(5);
        await page.keyboard.press("Escape");
    });
});
