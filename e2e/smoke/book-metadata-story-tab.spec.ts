/**
 * Story-tab metadata smoke
 * (EXPOSE-BUCHIDEE-METADATA-01 C3).
 *
 * Exercises the new author-design metadata fields end-to-end:
 *   - create a prose book via API
 *   - open BookMetadataEditor
 *   - navigate to the new Story tab
 *   - fill both book_idea + expose with multi-paragraph + UTF-8
 *     umlaut content
 *   - save + reload + verify persistence (regression-pin per LL
 *     "End-to-end behavior tests are not 'kwarg passes through'
 *     tests": asserts on the OBSERVABLE OUTPUT through the full
 *     chain — UI write → API → DB → API → UI re-render)
 *
 * Bounding-box-dimension assertion per LL "Playwright-visible !=
 * User-visible": the Story tab content body must render at non-
 * zero height (> 100px) so the user can actually interact with
 * the fields.
 *
 * Currently picture_book + comic_book authors cannot reach the
 * Story tab — the ComicBookEditor has no metadata-button and
 * PageEditor's button only landed for picture_book (PB-PHASE4
 * Session 5). Prose is the canonical access path for v1.
 */

import {test, expect, createBook} from "../fixtures/base";

test.describe("Book-metadata Story tab smoke", () => {
    test("Story tab is visible + has non-zero height in BookMetadataEditor", async ({
        page,
    }) => {
        const book = await createBook("Story Tab Visibility", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        // Wait for editor to mount. The chapter-based prose editor
        // exposes the Metadata view via ChapterSidebar's "Metadaten"
        // button OR the URL query param above.
        const storyTab = page.getByTestId("metadata-tab-story");
        await expect(storyTab).toBeVisible({timeout: 10000});

        // Activate Story tab (Radix Tabs activates on mouseDown per LL).
        await storyTab.click();
        const storyContent = page.getByTestId("metadata-story-content");
        await expect(storyContent).toBeVisible();

        // Bounding-box-dimension assertion: content body must be
        // user-perceivable. Two stacked Field components plus a
        // multi-paragraph expose-Field is well above 100px.
        const bbox = await storyContent.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(100);
    });

    test("fill + save + reload round-trips book_idea + expose", async ({
        page,
    }) => {
        const book = await createBook("Story Roundtrip Book", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        await page.getByTestId("metadata-tab-story").click();
        await expect(
            page.getByTestId("metadata-story-content"),
        ).toBeVisible();

        // Field components render their inputs as textarea elements
        // (multiline). Locate by role + accessible name (label text).
        // Use first() because the Field wrapping may surface multiple
        // accessible labels through aria-labelledby chains.
        const ideaInput = page.getByRole("textbox", {name: /Buchidee|Book Idea/}).first();
        const exposeInput = page.getByRole("textbox", {name: /Exposé/}).first();

        const ideaValue = "Ein Junge findet ein Drachenei.";
        const exposeValue = [
            "PLOT: Liam, 12, findet im Wald ein leuchtendes Drachenei.",
            "",
            "CHARACTERS:",
            "- Liam (12, neugierig, mutig)",
            "- Sköll (junger Drache, ängstlich)",
            "",
            "SETTING: Mittelalterliches Norwegen, Herbst.",
        ].join("\n");

        await ideaInput.fill(ideaValue);
        await exposeInput.fill(exposeValue);

        // Trigger save.
        await page.getByTestId("metadata-save").click();

        // Reload from URL — the editor reads fresh data from
        // /api/books/{id} on mount.
        await page.reload();

        await page.getByTestId("metadata-tab-story").click();
        const ideaAfter = page.getByRole("textbox", {name: /Buchidee|Book Idea/}).first();
        const exposeAfter = page.getByRole("textbox", {name: /Exposé/}).first();

        await expect(ideaAfter).toHaveValue(ideaValue);
        // Use partial match for the long expose body — the round-trip
        // must preserve the UTF-8 umlaut "Sköll" and the multi-line
        // structure (newlines preserved by Text column storage).
        await expect(exposeAfter).toContainText("Sköll");
        await expect(exposeAfter).toContainText("PLOT: Liam");
    });

    test("description (existing field) lives in General tab, not Story tab", async ({
        page,
    }) => {
        // Regression-pin: Q4 semantic separation. ``description`` is
        // the short blurb in the General tab; Story tab carries the
        // distinct author-design fields. A future refactor that moves
        // description into Story (or duplicates it) breaks this
        // contract.
        const book = await createBook("Tab Separation Book", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        // General tab is active by default. Description Field is
        // visible there.
        const description = page.getByLabel(/Beschreibung|Description/).first();
        await expect(description).toBeVisible();

        // Switch to Story tab.
        await page.getByTestId("metadata-tab-story").click();
        const storyContent = page.getByTestId("metadata-story-content");
        await expect(storyContent).toBeVisible();

        // Description label is NOT in the Story subtree.
        const descInStory = storyContent.getByLabel(
            /Beschreibung|Description/,
        );
        await expect(descInStory).toHaveCount(0);
    });
});
