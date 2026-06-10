/**
 * Smoke test for the math typing convention in the TipTap v3 editor.
 *
 * ``$...$`` must become inline math and ``$$...$$`` must become block math,
 * both rendered by KaTeX. This can only be verified in a real browser:
 * TipTap input rules need contentEditable text input, and KaTeX renders into
 * the DOM. The v3 ``@tiptap/extension-mathematics`` ships input rules that
 * use ``$$`` for inline / ``$$$`` for block, so typing ``$E=mc^2$`` stayed
 * plain text; ``InlineMathDollar`` / ``BlockMathDollar`` restore the
 * single-/double-dollar convention. CC writes this spec; Aster runs it per
 * the Pre-Release Gate.
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

async function openEditor(page: import('@playwright/test').Page, bookId: string) {
  await page.goto(`/book/${bookId}`)
  await expect(page.locator('.tiptap-editor')).toBeVisible({timeout: 5000})
}

test.describe('Editor math typing', () => {
  test('typing $E=mc^2$ renders inline KaTeX (dollar signs gone)', async ({
    page,
  }) => {
    const book = await createBook('Inline Math')
    await createChapter(book.id, 'Math Chapter')

    await openEditor(page, book.id)
    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.keyboard.type('Energie: $E=mc^2$')

    // The single-dollar pair converts to an inline math node, rendered by
    // KaTeX. The raw "$E=mc^2$" text must be gone (the input rule fired).
    await expect(editor.locator('.katex')).toBeVisible({timeout: 5000})
    await expect(editor).not.toContainText('$E=mc^2$')
    // The surrounding prose stays.
    await expect(editor).toContainText('Energie:')
  })

  test('typing $$\\int x$$ on its own line renders block KaTeX', async ({
    page,
  }) => {
    const book = await createBook('Block Math')
    await createChapter(book.id, 'Math Chapter')

    await openEditor(page, book.id)
    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    // Double-dollar on an otherwise empty paragraph -> block math.
    await page.keyboard.type('$$\\int_0^1 x\\,dx$$')

    await expect(editor.locator('.katex')).toBeVisible({timeout: 5000})
    await expect(editor).not.toContainText('$$')
  })
})
