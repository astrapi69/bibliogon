/**
 * Smoke tests for import flows via the orchestrator API.
 *
 * Covers single Markdown files, the project export-then-reimport
 * roundtrip (WBT format) and error cases. Complements
 * backup-roundtrip.spec.ts which covers .bgb backup import.
 *
 * All imports go through the two-phase orchestrator:
 *   POST /api/import/detect  -> preview + temp_ref
 *   POST /api/import/execute -> commits, returns book_id
 */

import {test, expect, createBook, createChapter} from '../fixtures/base'

const API = 'http://localhost:8000/api'

interface DetectResponse {
  temp_ref: string
  detected: {
    format_name: string
    title?: string
    chapters?: unknown[]
  }
  duplicate?: unknown
}

async function runImport(
  request: import('@playwright/test').APIRequestContext,
  file: {name: string; mimeType: string; buffer: Buffer},
): Promise<{detect: DetectResponse; bookId: string}> {
  const detectResp = await request.post(`${API}/import/detect`, {
    multipart: {files: file},
  })
  expect(detectResp.status()).toBe(200)
  const detect: DetectResponse = await detectResp.json()

  const executeResp = await request.post(`${API}/import/execute`, {
    data: {
      temp_ref: detect.temp_ref,
      overrides: {},
      duplicate_action: 'create',
    },
  })
  expect(executeResp.status()).toBe(200)
  const {book_id} = await executeResp.json()
  return {detect, bookId: book_id}
}

test.describe('Import: single Markdown file', () => {
  test('imports a .md file as a new book with one chapter', async ({request}) => {
    const markdown = '# My Test Chapter\n\nThis is a test paragraph with some content.'
    const {detect, bookId} = await runImport(request, {
      name: 'test-chapter.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(markdown, 'utf-8'),
    })
    expect(detect.detected.format_name).toBe('markdown')
    expect(detect.detected.chapters?.length).toBe(1)
    expect(bookId).toBeTruthy()
  })

  test('imported markdown chapter is accessible', async ({request}) => {
    const markdown = '# Erstes Kapitel\n\nInhalt hier.'
    const {bookId} = await runImport(request, {
      name: 'kapitel.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(markdown, 'utf-8'),
    })
    const bookResp = await request.get(`${API}/books/${bookId}`)
    const book = await bookResp.json()
    expect(book.chapters.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Import: error cases', () => {
  test('rejects unsupported file extension', async ({request}) => {
    const resp = await request.post(`${API}/import/detect`, {
      multipart: {
        files: {
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
  test('exported project ZIP reimports through the WBT handler', async ({request}) => {
    const book = await createBook('Roundtrip Project Test')
    await createChapter(book.id, 'Vorwort', '<p>Front matter content.</p>', 'preface')
    await createChapter(book.id, 'Kapitel Eins', '<p>Chapter content here.</p>')

    const exportResp = await request.get(`${API}/books/${book.id}/export/project`)
    expect(exportResp.status()).toBe(200)
    const zipBuffer = await exportResp.body()
    expect(zipBuffer.length).toBeGreaterThan(100)

    const {detect, bookId} = await runImport(request, {
      name: 'project.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    })
    expect(detect.detected.format_name).toBe('wbt-zip')
    expect(bookId).toBeTruthy()
    expect(detect.detected.chapters?.length).toBeGreaterThanOrEqual(1)
  })

  test('exported project preserves book title on reimport', async ({request}) => {
    const book = await createBook('Title Preservation Test')
    await createChapter(book.id, 'Chapter', '<p>Content.</p>')

    const exportResp = await request.get(`${API}/books/${book.id}/export/project`)
    const zipBuffer = await exportResp.body()

    const {bookId} = await runImport(request, {
      name: 'project.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    })
    const reimportedBook = await request.get(`${API}/books/${bookId}`)
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
    await createBook('History Test Book')
    await request.get(`${API}/backup/export`)

    const resp = await request.get(`${API}/backup/history`)
    const history = await resp.json()
    expect(history.length).toBeGreaterThanOrEqual(1)
    const backupEntry = history.find((h: {action: string; filename?: string}) => h.action === 'backup')
    expect(backupEntry).toBeTruthy()
    expect(backupEntry.filename).toBeTruthy()
  })
})
