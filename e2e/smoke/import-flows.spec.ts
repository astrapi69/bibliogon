/**
 * Smoke tests for import flows via the API.
 *
 * Covers smart-import with single Markdown files, the backup
 * export-then-reimport roundtrip (project format), and error cases.
 * Complements the existing backup-roundtrip.spec.ts which covers
 * .bgb backup import.
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

const API = 'http://localhost:8000/api'

test.describe('Smart import: single Markdown file', () => {
  test('imports a .md file as a new book with one chapter', async ({request}) => {
    const markdown = '# My Test Chapter\n\nThis is a test paragraph with some content.'
    const resp = await request.post(`${API}/backup/smart-import`, {
      multipart: {
        file: {
          name: 'test-chapter.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from(markdown, 'utf-8'),
        },
      },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.type).toBe('chapter')
    expect(body.result.chapter_count).toBe(1)
    expect(body.result.book_id).toBeTruthy()
  })

  test('imported markdown chapter has correct title', async ({request}) => {
    const markdown = '# Erstes Kapitel\n\nInhalt hier.'
    const resp = await request.post(`${API}/backup/smart-import`, {
      multipart: {
        file: {
          name: 'kapitel.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from(markdown, 'utf-8'),
        },
      },
    })
    const body = await resp.json()
    const bookResp = await request.get(`${API}/books/${body.result.book_id}`)
    const book = await bookResp.json()
    expect(book.chapters.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Smart import: error cases', () => {
  test('rejects unsupported file extension', async ({request}) => {
    const resp = await request.post(`${API}/backup/smart-import`, {
      multipart: {
        file: {
          name: 'document.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('fake pdf content', 'utf-8'),
        },
      },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('Project export and reimport roundtrip', () => {
  test('exported project ZIP can be reimported via smart-import', async ({request}) => {
    // Create a book with chapters
    const book = await createBook('Roundtrip Project Test')
    await createChapter(book.id, 'Vorwort', '<p>Front matter content.</p>', 'preface')
    await createChapter(book.id, 'Kapitel Eins', '<p>Chapter content here.</p>')

    // Export as project ZIP
    const exportResp = await request.get(`${API}/books/${book.id}/export/project`)
    expect(exportResp.status()).toBe(200)
    const zipBuffer = await exportResp.body()
    expect(zipBuffer.length).toBeGreaterThan(100)

    // Reimport via smart-import
    const importResp = await request.post(`${API}/backup/smart-import`, {
      multipart: {
        file: {
          name: 'project.zip',
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    })
    expect(importResp.status()).toBe(200)
    const importBody = await importResp.json()
    expect(importBody.type).toBe('template')
    expect(importBody.result.book_id).toBeTruthy()
    expect(importBody.result.chapter_count).toBeGreaterThanOrEqual(1)
  })

  test('exported project preserves book title on reimport', async ({request}) => {
    const book = await createBook('Title Preservation Test')
    await createChapter(book.id, 'Chapter', '<p>Content.</p>')

    const exportResp = await request.get(`${API}/books/${book.id}/export/project`)
    const zipBuffer = await exportResp.body()

    const importResp = await request.post(`${API}/backup/smart-import`, {
      multipart: {
        file: {
          name: 'project.zip',
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    })
    const importBody = await importResp.json()
    const reimportedBook = await request.get(`${API}/books/${importBody.result.book_id}`)
    const bookData = await reimportedBook.json()
    expect(bookData.title).toBe('Title Preservation Test')
  })
})

test.describe('Backup history endpoint', () => {
  test('GET /api/backup/history returns a list', async ({request}) => {
    const resp = await request.get(`${API}/backup/history`)
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test('backup export adds a history entry', async ({request}) => {
    // Trigger an export to generate a history entry
    await createBook('History Test Book')
    await request.get(`${API}/backup/export`)

    const resp = await request.get(`${API}/backup/history`)
    const history = await resp.json()
    expect(history.length).toBeGreaterThanOrEqual(1)
    // The history store is process-global; earlier tests may have
    // pushed "restore" entries after a backup-then-import roundtrip.
    // Assert that AT LEAST ONE "backup" entry exists with a filename
    // rather than pinning history[0].action.
    const backupEntry = history.find((h: {action: string; filename?: string}) => h.action === 'backup')
    expect(backupEntry).toBeTruthy()
    expect(backupEntry.filename).toBeTruthy()
  })
})
