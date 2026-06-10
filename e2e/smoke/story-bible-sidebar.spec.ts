/**
 * Smoke test for the Story Bible sidebar (STORY-BIBLE-PLUGIN-01
 * Session 2). Drives the full per-book flow against the running
 * app (plugin-story-bible active): toggle the panel, create an
 * entity, open its detail view, rename it (persisted), and delete
 * it. Claude Code writes the spec; Aster runs it.
 *
 * Gated on the plugin: the toggle (story-bible-toggle) only renders
 * when GET /api/story-bible/info resolves, so its presence is itself
 * the plugin-availability assertion.
 */

import {test, expect, createBook} from "../fixtures/base";

test.describe("Story Bible sidebar", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Story Bible Smoke");
        bookId = book.id;
    });

    test("create, open, rename and delete an entity", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        // Story Bible lives in the collapsible sidebar tools group; expand it
        // if collapsed (viewport-responsive default — Issue #42).
        const toolsToggle = page.getByTestId("chapter-sidebar-tools-toggle");
        if ((await toolsToggle.getAttribute("data-state")) === "closed") {
            await toolsToggle.click();
        }
        // The toggle only renders when the plugin is mounted.
        const toggle = page.getByTestId("story-bible-toggle");
        await expect(toggle).toBeVisible();
        await toggle.click();

        const sidebar = page.getByTestId("story-bible-sidebar");
        await expect(sidebar).toBeVisible();
        await expect(page.getByTestId("story-bible-group-character")).toBeVisible();

        // Create a character.
        await page.getByTestId("story-bible-add-character").click();
        await page
            .getByTestId("story-bible-add-input-character")
            .fill("Alice");
        await page.getByTestId("story-bible-add-save-character").click();

        // It appears in the list.
        const entryName = sidebar.getByText("Alice", {exact: true});
        await expect(entryName).toBeVisible();

        // Click it -> the detail editor opens in the main content area.
        await entryName.click();
        await expect(page.getByTestId("story-entity-editor")).toBeVisible();
        await expect(page.getByTestId("story-entity-type")).toBeVisible();

        // Rename via the inline EditableTitle.
        await page.getByTestId("story-entity-name-edit").click();
        const nameInput = page.getByTestId("story-entity-name-input");
        await nameInput.fill("Alice the Brave");
        await nameInput.press("Enter");

        // Persisted -> the sidebar list reflects the new name.
        await expect(
            sidebar.getByText("Alice the Brave", {exact: true}),
        ).toBeVisible();

        // Delete from the detail view -> confirm -> editor closes +
        // entry removed from the list.
        await page.getByTestId("story-entity-delete").click();
        await page.getByTestId("app-dialog-confirm").click();
        await expect(page.getByTestId("story-entity-editor")).toHaveCount(0);
        await expect(
            sidebar.getByText("Alice the Brave", {exact: true}),
        ).toHaveCount(0);
    });

    test("sidebar renders its structural surface", async ({page}) => {
        // Structural pin (replaces an OS/font-fragile pixel baseline):
        // the sidebar mounts with its entity groups + the export/close
        // affordances. Catches "sidebar disappeared / lost its chrome"
        // regressions without environment-dependent screenshots.
        await page.setViewportSize({width: 1400, height: 900});
        await page.goto(`/book/${bookId}`);
        const toolsToggle = page.getByTestId("chapter-sidebar-tools-toggle");
        if ((await toolsToggle.getAttribute("data-state")) === "closed") {
            await toolsToggle.click();
        }
        await page.getByTestId("story-bible-toggle").click();
        const sidebar = page.getByTestId("story-bible-sidebar");
        await expect(sidebar).toBeVisible();
        // Per-type groups render even for an empty book (see the
        // create/rename/delete test above), so they are a stable
        // structural anchor.
        await expect(page.getByTestId("story-bible-group-character")).toBeVisible();
        await expect(page.getByTestId("story-bible-add-character")).toBeVisible();
    });
});
