/**
 * Smoke tests for actual file export and download.
 *
 * Unlike the export dialog UI tests (e2e/tests/export.spec.ts) which
 * only verify dialog behavior, these tests trigger real exports and
 * verify the downloaded file exists with the correct content type and
 * non-zero size.
 *
 * Uses the API directly for export verification (the frontend uses
 * window.open which opens a new tab - Playwright can intercept this
 * but direct API calls are more reliable for file verification).
 * The UI flow is tested separately: open dialog -> select format ->
 * click export -> verify popup/download triggers.
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

const API = 'http://localhost:8000/api'

test.describe('Export file download', () => {
  let bookId: string

  test.beforeEach(async () => {
    const book = await createBook('Export Download Test')
    bookId = book.id
    await createChapter(bookId, 'Chapter One', '<p>This is chapter one content for export testing.</p>')
    await createChapter(bookId, 'Chapter Two', '<p>Second chapter with more content.</p>')
  })

  test('EPUB export returns a valid file', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/epub`)
    expect(resp.status()).toBe(200)
    expect(resp.headers()['content-type']).toContain('epub')
    const body = await resp.body()
    expect(body.length).toBeGreaterThan(100)
  })

  test('PDF export returns a valid file', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/pdf`)
    expect(resp.status()).toBe(200)
    const contentType = resp.headers()['content-type'] || ''
    expect(contentType).toMatch(/pdf|octet-stream/)
    const body = await resp.body()
    expect(body.length).toBeGreaterThan(100)
  })

  test('DOCX export returns a valid file', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/docx`)
    expect(resp.status()).toBe(200)
    const body = await resp.body()
    expect(body.length).toBeGreaterThan(100)
  })

  test('HTML export returns a valid file', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/html`)
    expect(resp.status()).toBe(200)
    const body = await resp.body()
    expect(body.length).toBeGreaterThan(50)
  })

  test('Markdown export returns a valid file', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/markdown`)
    expect(resp.status()).toBe(200)
    const body = await resp.body()
    expect(body.length).toBeGreaterThan(50)
  })

  test('project ZIP export returns a valid archive', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/project`)
    expect(resp.status()).toBe(200)
    expect(resp.headers()['content-type']).toContain('zip')
    const body = await resp.body()
    // ZIP magic bytes: PK (0x50, 0x4B)
    expect(body[0]).toBe(0x50)
    expect(body[1]).toBe(0x4B)
  })

  test('batch export returns a ZIP with multiple formats', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/batch`)
    expect(resp.status()).toBe(200)
    expect(resp.headers()['content-type']).toContain('zip')
    const body = await resp.body()
    expect(body[0]).toBe(0x50)
    expect(body[1]).toBe(0x4B)
    expect(body.length).toBeGreaterThan(1000)
  })

  test('unsupported format returns 400', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/xyz`)
    expect(resp.status()).toBe(400)
  })

  test('export nonexistent book returns 404', async ({request}) => {
    const resp = await request.get(`${API}/books/nonexistent-id/export/epub`)
    expect(resp.status()).toBe(404)
  })

  test('audiobook sync route returns 410', async ({request}) => {
    const resp = await request.get(`${API}/books/${bookId}/export/audiobook`)
    expect(resp.status()).toBe(410)
  })
})

test.describe('Export via UI flow', () => {
  let bookId: string

  test.beforeEach(async () => {
    const book = await createBook('UI Export Test')
    bookId = book.id
    await createChapter(bookId, 'Test Chapter', '<p>Content for UI export.</p>')
  })

  test('export dialog triggers download on format click', async ({page, context}) => {
    await page.goto(`/book/${bookId}`)
    await expect(page.locator('.tiptap-editor')).toBeVisible({timeout: 5000})

    // Open export dialog
    await page.getByText(/Exportieren|Export\.\.\./).click()
    await expect(page.getByText(/Export:/)).toBeVisible({timeout: 3000})

    // EPUB should be pre-selected, click the export button
    // This opens a new tab via window.open - capture it
    const popupPromise = context.waitForEvent('page')
    await page.getByRole('button', {name: /EPUB.*exportieren|Export as EPUB/}).click()

    // The popup loads the export URL and triggers a download
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    // The export dialog should close after triggering
    await expect(page.getByText(/Export:/)).not.toBeVisible({timeout: 5000})
  })
})
