/**
 * Smoke tests for composition / distraction-free mode
 * (COMPOSITION-DISTRACTION-FREE-MODE-01).
 *
 * The umbrella distraction-free toggle hides the app chrome (chapter
 * sidebar + the editor toolbar bar) via a ``composition-mode`` class
 * on <html>, paints a paper backdrop, and shows a floating exit
 * button. Entering is via the toolbar button or Ctrl+Shift+D;
 * leaving is via the exit button or Escape.
 *
 * These assertions cannot run in Vitest/happy-dom (they depend on
 * real CSS layout + visibility computed from the document-root
 * class), so they live as a Playwright smoke. The toolbar button +
 * handler wiring is pinned separately in Toolbar.test.tsx.
 *
 * data-testid selectors only.
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

async function openEditor(page: import('@playwright/test').Page, bookId: string) {
  await page.goto(`/book/${bookId}`)
  await expect(page.locator('.tiptap-editor')).toBeVisible({timeout: 5000})
}

test.describe('Composition / distraction-free mode', () => {
  let bookId: string

  test.beforeEach(async () => {
    const book = await createBook('Composition Test')
    bookId = book.id
    await createChapter(bookId, 'Composition Chapter', 'Some prose to write in peace.')
  })

  test('toggle hides the chapter sidebar + toolbar and shows the exit button', async ({page}) => {
    await openEditor(page, bookId)

    // Baseline: chrome visible, not in composition.
    await expect(page.getByTestId('book-editor-sidebar')).toBeVisible()
    await expect(page.getByTestId('toolbar-bold')).toBeVisible()
    await expect(page.getByTestId('composition-exit')).toHaveCount(0)

    await page.getByTestId('toolbar-composition').click()

    // The root carries the composition-mode class; chrome is hidden.
    await expect(page.locator('html')).toHaveClass(/composition-mode/)
    await expect(page.getByTestId('book-editor-sidebar')).not.toBeVisible()
    await expect(page.getByTestId('toolbar-bold')).not.toBeVisible()
    await expect(page.getByTestId('composition-exit')).toBeVisible()

    // The writing surface itself stays visible + editable.
    await expect(page.locator('.tiptap-editor')).toBeVisible()
  })

  test('exit button restores the chrome', async ({page}) => {
    await openEditor(page, bookId)
    await page.getByTestId('toolbar-composition').click()
    await expect(page.locator('html')).toHaveClass(/composition-mode/)

    await page.getByTestId('composition-exit').click()

    await expect(page.locator('html')).not.toHaveClass(/composition-mode/)
    await expect(page.getByTestId('book-editor-sidebar')).toBeVisible()
    await expect(page.getByTestId('toolbar-bold')).toBeVisible()
    await expect(page.getByTestId('composition-exit')).toHaveCount(0)
  })

  test('Escape exits composition mode', async ({page}) => {
    await openEditor(page, bookId)
    await page.getByTestId('toolbar-composition').click()
    await expect(page.locator('html')).toHaveClass(/composition-mode/)

    await page.keyboard.press('Escape')

    await expect(page.locator('html')).not.toHaveClass(/composition-mode/)
    await expect(page.getByTestId('toolbar-bold')).toBeVisible()
  })

  test('Ctrl+Shift+D toggles composition mode', async ({page}) => {
    await openEditor(page, bookId)

    await page.keyboard.press('Control+Shift+D')
    await expect(page.locator('html')).toHaveClass(/composition-mode/)

    await page.keyboard.press('Control+Shift+D')
    await expect(page.locator('html')).not.toHaveClass(/composition-mode/)
  })
})
