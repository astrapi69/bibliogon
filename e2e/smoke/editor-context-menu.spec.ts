/**
 * Smoke test for the editor right-click context menu
 * (EDITOR-CONTEXT-MENU-01 + EDITOR-CONTEXT-MENU-ALL-TOOLBAR-01, #370).
 *
 * Covers the live Radix ContextMenu that Vitest mocks away (the menu
 * portal + a real TipTap editor are happy-dom-brittle). The menu now
 * mirrors the full toolbar via grouped submenus; these four cases match
 * the required test scenarios from #370:
 *   1. the menu renders all groups,
 *   2. a formatting command applied through the menu changes the doc,
 *   3. without a selection the insert options are reachable,
 *   4. with a selection an active format is highlighted (data-active).
 *
 * Testid namespace: editor-context-menu / ecm-*. data-testid + the
 * ProseMirror content element only.
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

test.describe("Editor context menu", () => {
    test("right-click renders all groups", async ({page}) => {
        const book = await createBook("Context Menu Groups E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")

        await page.goto(`/book/${book.id}`)
        await page.getByTestId(`chapter-item-${ch.id}`).click()

        const prose = page.locator(".ProseMirror").first()
        await expect(prose).toBeVisible()

        await prose.click({button: "right"})
        await expect(page.getByTestId("editor-context-menu")).toBeVisible()

        // Top-level items + every group submenu trigger.
        await expect(page.getByTestId("ecm-undo")).toBeVisible()
        await expect(page.getByTestId("ecm-select-all")).toBeVisible()
        await expect(page.getByTestId("ecm-formatting-sub")).toBeVisible()
        await expect(page.getByTestId("ecm-insert-sub")).toBeVisible()
        await expect(page.getByTestId("ecm-heading-sub")).toBeVisible()
        await expect(page.getByTestId("ecm-alignment-sub")).toBeVisible()
        await expect(page.getByTestId("ecm-list-sub")).toBeVisible()
        await expect(page.getByTestId("ecm-blockquote")).toBeVisible()
        await expect(page.getByTestId("ecm-word-count")).toBeVisible()
    })

    test("applies bold formatting through the menu", async ({page}) => {
        const book = await createBook("Context Menu Apply E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")

        await page.goto(`/book/${book.id}`)
        await page.getByTestId(`chapter-item-${ch.id}`).click()

        const prose = page.locator(".ProseMirror").first()
        await expect(prose).toBeVisible()

        await prose.click()
        await page.keyboard.press("Control+a")
        await prose.click({button: "right"})
        await page.getByTestId("ecm-formatting-sub").hover()
        await page.getByTestId("ecm-bold").click()

        await expect(prose.locator("strong")).toHaveCount(1)
    })

    test("without a selection the insert options are reachable", async ({page}) => {
        const book = await createBook("Context Menu Insert E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")

        await page.goto(`/book/${book.id}`)
        await page.getByTestId(`chapter-item-${ch.id}`).click()

        const prose = page.locator(".ProseMirror").first()
        await expect(prose).toBeVisible()

        // Place the caret without selecting, then open the menu.
        await prose.click()
        await prose.click({button: "right"})
        await page.getByTestId("ecm-insert-sub").hover()
        await expect(page.getByTestId("ecm-link")).toBeVisible()
        await expect(page.getByTestId("ecm-formula")).toBeVisible()
    })

    test("with a selection an applied format is highlighted as active", async ({page}) => {
        const book = await createBook("Context Menu Active E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")

        await page.goto(`/book/${book.id}`)
        await page.getByTestId(`chapter-item-${ch.id}`).click()

        const prose = page.locator(".ProseMirror").first()
        await expect(prose).toBeVisible()

        // Make the whole paragraph bold, then re-select and re-open: the
        // Bold menu item reports itself active.
        await prose.click()
        await page.keyboard.press("Control+a")
        await page.keyboard.press("Control+b")
        await page.keyboard.press("Control+a")
        await prose.click({button: "right"})
        await page.getByTestId("ecm-formatting-sub").hover()
        await expect(page.getByTestId("ecm-bold")).toHaveAttribute("data-active", "true")
    })
})
