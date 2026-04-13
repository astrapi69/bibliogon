/**
 * IndexedDB-based draft storage for crash recovery.
 *
 * Saves editor content locally so that unsaved changes survive
 * tab crashes, accidental closes, and browser restarts. Drafts
 * are cleaned up on successful server save and after 30 days.
 *
 * Uses Dexie.js as IndexedDB wrapper for a clean async API.
 */

import Dexie, {type Table} from "dexie"

export interface ChapterDraft {
  chapterId: string
  bookId: string
  content: string       // TipTap JSON string
  contentHash: string   // hash of the server-known content at save time
  savedAt: number       // Date.now() timestamp
}

class BibliogonDB extends Dexie {
  drafts!: Table<ChapterDraft, string>

  constructor() {
    super("bibliogon")
    this.version(1).stores({
      drafts: "chapterId, bookId, savedAt",
    })
  }
}

export const db = new BibliogonDB()

/** Simple string hash for content comparison (not cryptographic). */
export function hashContent(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString(36)
}

/** Save a draft to IndexedDB. */
export async function saveDraft(
  chapterId: string,
  bookId: string,
  content: string,
  serverContentHash: string,
): Promise<void> {
  try {
    await db.drafts.put({
      chapterId,
      bookId,
      content,
      contentHash: serverContentHash,
      savedAt: Date.now(),
    })
  } catch {
    // IndexedDB unavailable (private browsing, quota) - fail silently
  }
}

/** Delete a draft after successful server save. */
export async function deleteDraft(chapterId: string): Promise<void> {
  try {
    await db.drafts.delete(chapterId)
  } catch {
    // Fail silently
  }
}

/** Get a draft if one exists and is newer than the server version. */
export async function getDraft(chapterId: string): Promise<ChapterDraft | undefined> {
  try {
    return await db.drafts.get(chapterId)
  } catch {
    return undefined
  }
}

/** Check if a recovery-worthy draft exists for a chapter. */
export async function checkForRecovery(
  chapterId: string,
  serverContent: string,
  serverUpdatedAt: string,
): Promise<ChapterDraft | null> {
  const draft = await getDraft(chapterId)
  if (!draft) return null

  const serverTime = new Date(serverUpdatedAt).getTime()
  const serverHash = hashContent(serverContent)

  // Draft must be newer than server AND based on the same server state
  if (draft.savedAt > serverTime && draft.contentHash === serverHash) {
    // Draft content must actually differ from server
    if (draft.content !== serverContent) {
      return draft
    }
  }

  // Stale or identical draft - clean up
  await deleteDraft(chapterId)
  return null
}

/** Delete drafts older than maxAgeDays. */
export async function cleanupOldDrafts(maxAgeDays: number = 30): Promise<number> {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    const old = await db.drafts.where("savedAt").below(cutoff).toArray()
    if (old.length > 0) {
      await db.drafts.bulkDelete(old.map((d) => d.chapterId))
    }
    return old.length
  } catch {
    return 0
  }
}

/** Delete all drafts for a book (e.g., on book delete). */
export async function deleteBookDrafts(bookId: string): Promise<void> {
  try {
    await db.drafts.where("bookId").equals(bookId).delete()
  } catch {
    // Fail silently
  }
}
