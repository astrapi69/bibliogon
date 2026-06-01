/**
 * Smoke test for the editor right-click context menu
 * (EDITOR-CONTEXT-MENU-01).
 *
 * Covers the live Radix ContextMenu that Vitest mocks away (the menu
 * portal + a real TipTap editor are happy-dom-brittle): right-click the
 * chapter editor, assert the menu opens with its always-visible items,
 * and that selecting text reveals the formatting items.
 *
 * Testid namespace: editor-context-menu / ecm-*. data-testid + the
 * ProseMirror content element only.
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

test.describe("Editor context menu", () => {
    test("right-click opens the menu; selection reveals formatting", async ({page}) => {
        const book = await createBook("Context Menu E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")

        await page.goto(`/book/${book.id}`)
        await page.getByTestId(`chapter-item-${ch.id}`).click()

        const prose = page.locator(".ProseMirror").first()
        await expect(prose).toBeVisible()

        // Right-click opens the context menu with the always-visible items.
        await prose.click({button: "right"})
        await expect(page.getByTestId("editor-context-menu")).toBeVisible()
        await expect(page.getByTestId("ecm-select-all")).toBeVisible()

        // Dismiss, then select all text and re-open: formatting items appear.
        await page.keyboard.press("Escape")
        await prose.click()
        await page.keyboard.press("Control+a")
        await prose.click({button: "right"})
        await expect(page.getByTestId("editor-context-menu")).toBeVisible()
        await expect(page.getByTestId("ecm-bold")).toBeVisible()
        await expect(page.getByTestId("ecm-heading-sub")).toBeVisible()
    })
})
