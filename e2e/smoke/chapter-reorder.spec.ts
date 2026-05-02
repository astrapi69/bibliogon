/**
 * Smoke tests for chapter drag-and-drop reorder.
 *
 * Uses the keyboard-based DnD approach (Space to pick up, Arrow to
 * move, Space to drop) because @dnd-kit's KeyboardSensor is more
 * reliable with Playwright than PointerSensor in headless browsers.
 *
 * Verifies that reordering persists after page reload via the API.
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

const API = 'http://localhost:8000/api'

/** Wait for the editor sidebar to render all chapter items. */
async function waitForSidebar(page: import('@playwright/test').Page, expectedCount: number) {
  await expect(page.locator('.tiptap-editor')).toBeVisible({timeout: 5000})
  // Wait for all chapter items to appear in the sidebar
  for (let i = 0; i < expectedCount; i++) {
    await expect(page.getByText(new RegExp(`Chapter ${i + 1}`))).toBeVisible({timeout: 3000})
  }
}

/** Get the ordered list of chapter titles from the sidebar. */
async function getSidebarOrder(page: import('@playwright/test').Page): Promise<string[]> {
  const items = page.locator('[data-testid^="chapter-item-"]')
  const count = await items.count()
  const titles: string[] = []
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).innerText()
    // The item text includes the chapter type label, take just the title part
    titles.push(text.split('\n')[0].trim())
  }
  return titles
}

/** Get chapter order from the API (source of truth). */
async function getApiOrder(request: import('@playwright/test').APIRequestContext, bookId: string): Promise<string[]> {
  const resp = await request.get(`${API}/books/${bookId}`)
  const book = await resp.json()
  const sorted = [...book.chapters].sort(
    (a: {position: number}, b: {position: number}) => a.position - b.position
  )
  return sorted.map((ch: {title: string}) => ch.title)
}

test.describe('Chapter drag-and-drop reorder', () => {
  let bookId: string

  test.beforeEach(async () => {
    const book = await createBook('Reorder Test')
    bookId = book.id
    await createChapter(bookId, 'Chapter 1', '<p>First</p>')
    await createChapter(bookId, 'Chapter 2', '<p>Second</p>')
    await createChapter(bookId, 'Chapter 3', '<p>Third</p>')
  })

  test('reorder via API persists new chapter positions', async ({request}) => {
    // Get current order
    const before = await getApiOrder(request, bookId)
    expect(before).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3'])

    // Get chapter IDs
    const resp = await request.get(`${API}/books/${bookId}`)
    const book = await resp.json()
    const sorted = [...book.chapters].sort(
      (a: {position: number}, b: {position: number}) => a.position - b.position
    )
    const ids = sorted.map((ch: {id: string}) => ch.id)

    // Reorder: move Chapter 1 to position 3 (swap to [2, 3, 1])
    const newOrder = [ids[1], ids[2], ids[0]]
    const reorderResp = await request.put(`${API}/books/${bookId}/chapters/reorder`, {
      data: {chapter_ids: newOrder},
    })
    expect(reorderResp.status()).toBe(200)

    // Verify new order
    const after = await getApiOrder(request, bookId)
    expect(after).toEqual(['Chapter 2', 'Chapter 3', 'Chapter 1'])
  })

  test('reorder persists after page reload', async ({page, request}) => {
    // Get chapter IDs and reorder via API
    const resp = await request.get(`${API}/books/${bookId}`)
    const book = await resp.json()
    const sorted = [...book.chapters].sort(
      (a: {position: number}, b: {position: number}) => a.position - b.position
    )
    const ids = sorted.map((ch: {id: string}) => ch.id)

    // Move Chapter 3 to first position
    const newOrder = [ids[2], ids[0], ids[1]]
    await request.put(`${API}/books/${bookId}/chapters/reorder`, {
      data: {chapter_ids: newOrder},
    })

    // Load the page and verify sidebar shows new order
    await page.goto(`/book/${bookId}`)
    await expect(page.locator('.tiptap-editor')).toBeVisible({timeout: 5000})

    const sidebarOrder = await getSidebarOrder(page)
    expect(sidebarOrder[0]).toBe('Chapter 3')
    expect(sidebarOrder[1]).toBe('Chapter 1')
    expect(sidebarOrder[2]).toBe('Chapter 2')
  })

  test('keyboard DnD moves chapter down in the sidebar', async ({page, request}) => {
    await page.goto(`/book/${bookId}`)
    await waitForSidebar(page, 3)

    // Get the first chapter's drag handle
    const resp = await request.get(`${API}/books/${bookId}`)
    const book = await resp.json()
    const sorted = [...book.chapters].sort(
      (a: {position: number}, b: {position: number}) => a.position - b.position
    )
    const firstId = sorted[0].id

    const handle = page.getByTestId(`drag-handle-${firstId}`)
    await expect(handle).toBeVisible()

    // Focus the drag handle and use keyboard DnD. Brief stabiliser
    // delays around the Space/ArrowDown sequence make @dnd-kit's
    // KeyboardSensor reliable under Playwright; without them the
    // pickup/move/drop events occasionally batch and the drop lands
    // before the move has committed.
    await handle.focus()
    await page.waitForTimeout(50)
    await page.keyboard.press('Space')  // pick up
    await page.waitForTimeout(50)
    await page.keyboard.press('ArrowDown')  // move down one position
    await page.waitForTimeout(50)
    await page.keyboard.press('Space')  // drop

    // Poll API until the new order lands. The server reorder fires
    // asynchronously; a fixed 500ms wait was racy on slower runs.
    await expect.poll(async () => (await getApiOrder(request, bookId)).join(','), {
      timeout: 5000,
    }).toBe('Chapter 2,Chapter 1,Chapter 3')
  })
})
