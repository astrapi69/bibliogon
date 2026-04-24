/**
 * Smoke tests for backup export + import roundtrip.
 *
 * This spec verifies data integrity across the full backup cycle:
 *
 *   create books with chapters -> export .bgb -> wipe DB -> import .bgb
 *   -> verify all books, chapters, metadata restored
 *
 * The export/import is done via Playwright's request API (not the
 * file picker UI) because the goal is to pin the data pipeline, not
 * the file-picker interaction. The UI testids (backup-export-btn,
 * import-wizard-btn) exist for future UI-level tests.
 *
 * Uses data-testid selectors exclusively for any UI assertions.
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

const API = 'http://localhost:8000/api'

test.describe('Backup roundtrip', () => {
  test('export then import restores books and chapters', async ({page, request}) => {
    // --- Setup: create two books with chapters ---
    const bookA = await createBook('Roundtrip Alpha', 'Author A')
    await createChapter(bookA.id, 'Chapter 1', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Alpha content"}]}]}')
    await createChapter(bookA.id, 'Foreword', '', 'foreword')

    const bookB = await createBook('Roundtrip Beta', 'Author B')
    await createChapter(bookB.id, 'Introduction', '', 'introduction')

    // Verify setup via API
    const booksBeforeExport = await (await fetch(`${API}/books`)).json()
    expect(booksBeforeExport).toHaveLength(2)

    // --- Export backup via API ---
    const exportResponse = await request.get(`${API}/backup/export`)
    expect(exportResponse.ok()).toBe(true)
    expect(exportResponse.headers()['content-type']).toContain('application/octet-stream')

    const backupBuffer = await exportResponse.body()
    expect(backupBuffer.length).toBeGreaterThan(0)

    // --- Wipe: delete all books ---
    for (const book of booksBeforeExport) {
      await fetch(`${API}/books/${book.id}`, {method: 'DELETE'})
    }
    const booksAfterWipe = await (await fetch(`${API}/books`)).json()
    expect(booksAfterWipe).toHaveLength(0)

    // --- Import the backup via API ---
    const formData = new FormData()
    formData.append('file', new Blob([backupBuffer]), 'backup-test.bgb')

    const importResponse = await fetch(`${API}/backup/import`, {
      method: 'POST',
      body: formData,
    })
    expect(importResponse.ok).toBe(true)
    const importResult = await importResponse.json()
    expect(importResult.imported_books).toBe(2)

    // --- Verify restoration via API ---
    const booksAfterImport = await (await fetch(`${API}/books`)).json()
    expect(booksAfterImport).toHaveLength(2)

    const titles = booksAfterImport.map((b: {title: string}) => b.title).sort()
    expect(titles).toEqual(['Roundtrip Alpha', 'Roundtrip Beta'])

    // Verify chapters on book A
    const restoredA = booksAfterImport.find((b: {title: string}) => b.title === 'Roundtrip Alpha')
    const chaptersA = await (await fetch(`${API}/books/${restoredA.id}/chapters`)).json()
    expect(chaptersA).toHaveLength(2)
    const chapterTitlesA = chaptersA.map((c: {title: string}) => c.title).sort()
    expect(chapterTitlesA).toEqual(['Chapter 1', 'Foreword'])

    // Verify chapter type preserved
    const foreword = chaptersA.find((c: {title: string}) => c.title === 'Foreword')
    expect(foreword.chapter_type).toBe('foreword')

    // Verify chapters on book B
    const restoredB = booksAfterImport.find((b: {title: string}) => b.title === 'Roundtrip Beta')
    const chaptersB = await (await fetch(`${API}/books/${restoredB.id}/chapters`)).json()
    expect(chaptersB).toHaveLength(1)
    expect(chaptersB[0].chapter_type).toBe('introduction')

    // --- Verify UI shows both books ---
    await page.goto('/')
    await expect(page.getByTestId(`book-card-${restoredA.id}`)).toBeVisible()
    await expect(page.getByTestId(`book-card-${restoredB.id}`)).toBeVisible()
  })

  test('backup preserves book metadata', async ({request}) => {
    // Create book with rich metadata
    const book = await createBook('Metadata Book', 'Meta Author')

    // Update metadata via API
    await fetch(`${API}/books/${book.id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        subtitle: 'A Subtitle',
        language: 'en',
        genre: 'Fantasy',
        series: 'Epic Saga',
        series_index: 2,
        isbn_ebook: '978-0-1234-5678-0',
        keywords: '["fantasy", "adventure"]',
      }),
    })

    // Export
    const exportResponse = await request.get(`${API}/backup/export`)
    const backupBuffer = await exportResponse.body()

    // Wipe
    await fetch(`${API}/books/${book.id}`, {method: 'DELETE'})

    // Import
    const formData = new FormData()
    formData.append('file', new Blob([backupBuffer]), 'metadata-test.bgb')
    await fetch(`${API}/backup/import`, {method: 'POST', body: formData})

    // Verify metadata
    const books = await (await fetch(`${API}/books`)).json()
    expect(books).toHaveLength(1)

    const restored = books[0]
    expect(restored.title).toBe('Metadata Book')
    expect(restored.subtitle).toBe('A Subtitle')
    expect(restored.language).toBe('en')
    expect(restored.genre).toBe('Fantasy')
    expect(restored.series).toBe('Epic Saga')
    expect(restored.series_index).toBe(2)
    expect(restored.isbn_ebook).toBe('978-0-1234-5678-0')
    expect(restored.keywords).toEqual(['fantasy', 'adventure'])
  })

  test('import into non-empty DB merges without duplicates', async ({request}) => {
    // Create existing book
    const existing = await createBook('Existing Book', 'Existing Author')

    // Create a different book, export, then delete only that book
    const toBackup = await createBook('Backed Up Book', 'Backup Author')
    await createChapter(toBackup.id, 'Backed Up Chapter')

    const exportResponse = await request.get(`${API}/backup/export`)
    const backupBuffer = await exportResponse.body()

    // Delete only the backed-up book, keep the existing one
    await fetch(`${API}/books/${toBackup.id}`, {method: 'DELETE'})
    const booksAfterDelete = await (await fetch(`${API}/books`)).json()
    expect(booksAfterDelete).toHaveLength(1)

    // Import the backup (contains both books)
    const formData = new FormData()
    formData.append('file', new Blob([backupBuffer]), 'merge-test.bgb')
    const importResponse = await fetch(`${API}/backup/import`, {method: 'POST', body: formData})
    expect(importResponse.ok).toBe(true)

    // Both books should exist, no duplicates
    const booksAfterImport = await (await fetch(`${API}/books`)).json()
    expect(booksAfterImport).toHaveLength(2)
    const titles = booksAfterImport.map((b: {title: string}) => b.title).sort()
    expect(titles).toEqual(['Backed Up Book', 'Existing Book'])
  })

  test('export button is visible on dashboard when books exist', async ({page}) => {
    await createBook('Visible Book')
    await page.goto('/')
    await expect(page.getByTestId('backup-export-btn')).toBeVisible()
    await expect(page.getByTestId('backup-export-btn')).toBeEnabled()
  })

  test('import button is visible on dashboard', async ({page}) => {
    await page.goto('/')
    await expect(page.getByTestId('import-wizard-btn')).toBeVisible()
  })
})
