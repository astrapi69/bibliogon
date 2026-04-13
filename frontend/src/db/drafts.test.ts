/**
 * Tests for IndexedDB draft storage.
 *
 * Uses fake-indexeddb (provided by Dexie in test environments)
 * to test draft CRUD operations without a real browser IndexedDB.
 */

import {describe, it, expect, beforeEach} from "vitest"
import "fake-indexeddb/auto"
import {
  db,
  hashContent,
  saveDraft,
  deleteDraft,
  getDraft,
  checkForRecovery,
  cleanupOldDrafts,
  deleteBookDrafts,
} from "./drafts"

beforeEach(async () => {
  await db.drafts.clear()
})

describe("hashContent", () => {
  it("returns a string hash", () => {
    const hash = hashContent("hello world")
    expect(typeof hash).toBe("string")
    expect(hash.length).toBeGreaterThan(0)
  })

  it("returns different hashes for different content", () => {
    const hash1 = hashContent("hello")
    const hash2 = hashContent("world")
    expect(hash1).not.toBe(hash2)
  })

  it("returns same hash for same content", () => {
    const hash1 = hashContent("same content")
    const hash2 = hashContent("same content")
    expect(hash1).toBe(hash2)
  })
})

describe("saveDraft / getDraft / deleteDraft", () => {
  it("saves and retrieves a draft", async () => {
    await saveDraft("ch1", "book1", '{"type":"doc"}', "abc123")
    const draft = await getDraft("ch1")
    expect(draft).toBeTruthy()
    expect(draft!.chapterId).toBe("ch1")
    expect(draft!.bookId).toBe("book1")
    expect(draft!.content).toBe('{"type":"doc"}')
    expect(draft!.contentHash).toBe("abc123")
    expect(draft!.savedAt).toBeGreaterThan(0)
  })

  it("overwrites existing draft for same chapter", async () => {
    await saveDraft("ch1", "book1", "old content", "hash1")
    await saveDraft("ch1", "book1", "new content", "hash2")
    const draft = await getDraft("ch1")
    expect(draft!.content).toBe("new content")
  })

  it("deletes a draft", async () => {
    await saveDraft("ch1", "book1", "content", "hash")
    await deleteDraft("ch1")
    const draft = await getDraft("ch1")
    expect(draft).toBeUndefined()
  })

  it("getDraft returns undefined for nonexistent chapter", async () => {
    const draft = await getDraft("nonexistent")
    expect(draft).toBeUndefined()
  })
})

describe("checkForRecovery", () => {
  it("returns draft when newer than server and hash matches", async () => {
    const serverContent = '{"type":"doc","content":[]}'
    const serverHash = hashContent(serverContent)
    const draftContent = '{"type":"doc","content":[{"type":"paragraph"}]}'

    await db.drafts.put({
      chapterId: "ch1",
      bookId: "book1",
      content: draftContent,
      contentHash: serverHash,
      savedAt: Date.now() + 1000, // newer than "now"
    })

    const result = await checkForRecovery("ch1", serverContent, new Date(Date.now() - 5000).toISOString())
    expect(result).toBeTruthy()
    expect(result!.content).toBe(draftContent)
  })

  it("returns null when draft is older than server", async () => {
    const serverContent = "server content"
    const serverHash = hashContent(serverContent)

    await db.drafts.put({
      chapterId: "ch1",
      bookId: "book1",
      content: "draft content",
      contentHash: serverHash,
      savedAt: Date.now() - 10000, // older
    })

    const result = await checkForRecovery("ch1", serverContent, new Date().toISOString())
    expect(result).toBeNull()
  })

  it("returns null when draft content equals server content", async () => {
    const serverContent = "identical content"
    const serverHash = hashContent(serverContent)

    await db.drafts.put({
      chapterId: "ch1",
      bookId: "book1",
      content: serverContent, // same as server
      contentHash: serverHash,
      savedAt: Date.now() + 1000,
    })

    const result = await checkForRecovery("ch1", serverContent, new Date(Date.now() - 5000).toISOString())
    expect(result).toBeNull()
  })

  it("returns null and cleans up when no draft exists", async () => {
    const result = await checkForRecovery("ch1", "content", new Date().toISOString())
    expect(result).toBeNull()
  })
})

describe("cleanupOldDrafts", () => {
  it("deletes drafts older than maxAgeDays", async () => {
    const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000
    await db.drafts.put({chapterId: "old", bookId: "b", content: "", contentHash: "", savedAt: oldTimestamp})
    await db.drafts.put({chapterId: "new", bookId: "b", content: "", contentHash: "", savedAt: Date.now()})

    const deleted = await cleanupOldDrafts(30)
    expect(deleted).toBe(1)
    expect(await getDraft("old")).toBeUndefined()
    expect(await getDraft("new")).toBeTruthy()
  })
})

describe("deleteBookDrafts", () => {
  it("deletes all drafts for a specific book", async () => {
    await saveDraft("ch1", "book1", "a", "h1")
    await saveDraft("ch2", "book1", "b", "h2")
    await saveDraft("ch3", "book2", "c", "h3")

    await deleteBookDrafts("book1")

    expect(await getDraft("ch1")).toBeUndefined()
    expect(await getDraft("ch2")).toBeUndefined()
    expect(await getDraft("ch3")).toBeTruthy()
  })
})
