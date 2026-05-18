/**
 * Editor fullscreen affordances smoke
 * (EDITOR-FULLSCREEN-NATIVE-01 C6).
 *
 * Pins the browser-native fullscreen toggle across the 3
 * integration points landed in C2 - C4:
 *
 * 1. Editor.tsx Toolbar (testid ``toolbar-fullscreen``) -
 *    covers ArticleEditor + BookEditor (both compose
 *    Editor.tsx).
 * 2. PageEditor header (testid ``page-editor-fullscreen``) -
 *    Picture-Book per-page editor.
 * 3. ComicBookEditor header (testid
 *    ``comic-book-editor-fullscreen``) - plugin-comics
 *    Session 1 placeholder; Session 2 inherits the button.
 *
 * The spec asserts the buttons render with the correct
 * aria-keyshortcuts attribute. Asserting the actual Fullscreen
 * API state change is unreliable in headless Playwright -
 * Chromium may reject ``requestFullscreen()`` outside a real
 * user gesture flow, AND ``document.fullscreenElement`` is
 * tracked by the browser process not the page DOM. The hook's
 * Vitest cases (useFullscreenToggle.test.ts) already pin the
 * state machine.
 *
 * Per PLUGIN-COMICS-E2E-SMOKE-01 precedent: this spec runs
 * against a live uvicorn + vite dev server. Bibliogon's
 * convention is Claude Code writes specs, Aster runs them.
 */

import {test, expect} from "../fixtures/base";

test.describe("Editor fullscreen toggles (EDITOR-FULLSCREEN-NATIVE-01)", () => {
    test("Editor.tsx Toolbar renders toolbar-fullscreen with ARIA shortcuts", async ({
        page,
    }) => {
        // Pick any existing book + chapter so Editor.tsx mounts.
        // The first book in the dashboard list is sufficient.
        await page.goto("/");
        const firstCard = page.locator('[data-testid^="book-card-"]').first();
        await firstCard.click();

        const fsButton = page.getByTestId("toolbar-fullscreen");
        // Editor.tsx may take a moment to mount the toolbar after
        // chapter load.
        await expect(fsButton).toBeVisible({timeout: 8000});
        await expect(fsButton).toHaveAttribute(
            "aria-keyshortcuts",
            "F11 Control+Shift+F",
        );
        await expect(fsButton).toHaveAttribute("aria-pressed", "false");
    });

    test("PageEditor renders page-editor-fullscreen with ARIA shortcuts", async ({
        page,
    }) => {
        // Picture-book editor mounts when the user opens a book
        // with book_type === "picture_book". The smoke fixture
        // does not guarantee one exists; the test creates one
        // via the dashboard split-button's picture-book menu
        // item.
        await page.goto("/");
        const chevron = page.getByTestId("new-book-chevron");
        if (!(await chevron.isVisible())) {
            test.skip(true, "split-button chevron not available in fixture");
            return;
        }
        await chevron.click();
        await page.getByTestId("new-book-menu-item-picture-book").click();
        // Fill the create-book modal minimum, submit, land in
        // PageEditor. Use whatever title input is canonical in
        // the modal.
        const titleInput = page.locator(
            '[data-testid="create-book-title"]',
        );
        await titleInput.fill(`fullscreen-spec ${Date.now()}`);
        await page.getByTestId("create-book-submit").click();

        const fsButton = page.getByTestId("page-editor-fullscreen");
        await expect(fsButton).toBeVisible({timeout: 8000});
        await expect(fsButton).toHaveAttribute(
            "aria-keyshortcuts",
            "F11 Control+Shift+F",
        );
        await expect(fsButton).toHaveAttribute("aria-pressed", "false");
    });

    test("ComicBookEditor renders comic-book-editor-fullscreen with ARIA shortcuts", async ({
        page,
    }) => {
        await page.goto("/");
        const chevron = page.getByTestId("new-book-chevron");
        if (!(await chevron.isVisible())) {
            test.skip(true, "split-button chevron not available in fixture");
            return;
        }
        await chevron.click();
        const comicItem = page.getByTestId("new-book-menu-item-comic-book");
        if (!(await comicItem.isVisible())) {
            test.skip(true, "comic-book menu item not registered in this build");
            return;
        }
        await comicItem.click();
        const titleInput = page.locator('[data-testid="create-book-title"]');
        await titleInput.fill(`comic-fs-spec ${Date.now()}`);
        await page.getByTestId("create-book-submit").click();

        const fsButton = page.getByTestId("comic-book-editor-fullscreen");
        await expect(fsButton).toBeVisible({timeout: 8000});
        await expect(fsButton).toHaveAttribute(
            "aria-keyshortcuts",
            "F11 Control+Shift+F",
        );
        await expect(fsButton).toHaveAttribute("aria-pressed", "false");
    });
});
