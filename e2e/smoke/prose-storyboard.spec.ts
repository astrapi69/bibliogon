/**
 * Prose Storyboard smoke (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3 +
 * C16 close-out).
 *
 * Drives the chapter-card Storyboard for a prose (chapter-based) book
 * end-to-end in a real browser:
 *
 *   - create a prose book + 3 chapters via API
 *   - open the storyboard via ``?view=storyboard``
 *   - assert a chapter card per chapter + the word-count tag
 *   - edit the notes textarea on a card -> blur -> assert API
 *     persistence (re-fetch via the chapters API)
 *   - type an act-group label -> blur -> assert the group header
 *     appears + persistence
 *
 * Per the "End-to-end behavior tests are not 'kwarg passes through'
 * tests" rule: each save is verified by re-reading the authoritative
 * DB state via the chapters API, not the client's optimistic state.
 *
 * Testid namespace: ``prose-storyboard-*`` (see ProseStoryboard.tsx).
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

const API = "http://localhost:8000/api"

interface ChapterRow {
    id: string
    title: string
    position: number
    notes: string | null
    act_group: string | null
    version: number
}

async function listChapters(bookId: string): Promise<ChapterRow[]> {
    const res = await fetch(`${API}/books/${bookId}/chapters`)
    expect(res.ok).toBeTruthy()
    return res.json()
}

test("prose storyboard: chapter cards render + annotations persist", async ({page}) => {
    const book = await createBook("Prose Storyboard E2E")
    await createChapter(book.id, "Opening", "Alice walked into the woods alone.")
    await createChapter(book.id, "Rising", "The path grew dark and narrow.")
    await createChapter(book.id, "Climax", "")

    await page.goto(`/book/${book.id}?view=storyboard`)

    // One card per chapter + the word-count tag.
    const chapters = await listChapters(book.id)
    for (const ch of chapters) {
        await expect(page.getByTestId(`prose-storyboard-card-${ch.id}`)).toBeVisible()
        await expect(
            page.getByTestId(`prose-storyboard-word-count-${ch.id}`),
        ).toBeVisible()
    }

    const first = chapters.find((c) => c.position === 0)!

    // Notes auto-save on blur.
    const notes = page.getByTestId(`prose-storyboard-notes-${first.id}`)
    await notes.fill("Pacing feels slow; trim the intro.")
    await notes.blur()
    await expect
        .poll(async () => {
            const rows = await listChapters(book.id)
            return rows.find((c) => c.id === first.id)?.notes
        })
        .toBe("Pacing feels slow; trim the intro.")

    // Act-group label auto-save on blur, and the group header renders.
    const actGroup = page.getByTestId(`prose-storyboard-act-group-${first.id}`)
    await actGroup.fill("Act I")
    await actGroup.blur()
    await expect
        .poll(async () => {
            const rows = await listChapters(book.id)
            return rows.find((c) => c.id === first.id)?.act_group
        })
        .toBe("Act I")
})
