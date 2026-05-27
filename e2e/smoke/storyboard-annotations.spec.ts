/**
 * Storyboard annotations smoke (PICTURE-BOOK-STORYBOARD-VIEW-01
 * Session 2 C6).
 *
 * Drives the inline-annotation flow end-to-end in a real browser:
 *
 *   - create a picture_book + 3 pages via API
 *   - open the storyboard via ``?view=storyboard`` query-param
 *     (shipped Session 1 C5)
 *   - edit the notes textarea on a card → blur → assert API
 *     persistence (re-fetch via api.pages.list)
 *   - select a story-beat via native <select> → assert badge
 *     + data-story-beat attribute + persistence
 *   - click a mood-color swatch → assert border indicator +
 *     data-mood-color attribute + persistence
 *   - type an act-group label → blur → assert group header
 *     appears + persistence
 *
 * Per the "End-to-end behavior tests are not 'kwarg passes
 * through' tests" rule: every save is verified by re-reading the
 * authoritative DB state via the pages API, not just by the
 * client's optimistic local state.
 */

import {test, expect, createPictureBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

interface PageRow {
    id: string
    position: number
    layout: string
    notes: string | null
    story_beat: string | null
    mood_color: string | null
    act_group: string | null
}

async function listPages(bookId: string): Promise<PageRow[]> {
    const res = await fetch(`${API}/books/${bookId}/pages`)
    if (!res.ok) throw new Error(`GET pages ${bookId}: ${res.status}`)
    return res.json()
}

async function createPage(bookId: string, layout = "speech_bubble"): Promise<PageRow> {
    const res = await fetch(`${API}/books/${bookId}/pages`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({layout}),
    })
    if (!res.ok) throw new Error(`POST page: ${res.status}`)
    return res.json()
}

test.describe("Storyboard annotations smoke", () => {
    test("notes / beat / mood / act-group round-trip end-to-end", async ({
        page,
    }) => {
        const book = await createPictureBook("Storyboard Anno Book", "E2E")
        const [p1, p2, p3] = await Promise.all([
            createPage(book.id),
            createPage(book.id),
            createPage(book.id),
        ])

        // Open the storyboard via the query-param flip.
        await page.goto(`/book/${book.id}?view=storyboard`)
        await expect(page.getByTestId("storyboard")).toBeVisible()
        await expect(
            page.getByTestId(`storyboard-card-${p1.id}`),
        ).toBeVisible()
        await expect(
            page.getByTestId(`storyboard-card-${p2.id}`),
        ).toBeVisible()
        await expect(
            page.getByTestId(`storyboard-card-${p3.id}`),
        ).toBeVisible()

        // --- Notes (C1) ---
        const notesP2 = page.getByTestId(`storyboard-notes-${p2.id}`)
        await notesP2.fill("Pacing feels slow here.")
        await notesP2.blur()
        // Wait for the PATCH round-trip + state-replace; the local
        // optimistic state is updated immediately so we re-fetch
        // the authoritative DB state to verify persistence.
        await expect
            .poll(async () => (await listPages(book.id))[1].notes, {
                timeout: 5000,
            })
            .toBe("Pacing feels slow here.")

        // --- Story-beat (C2) ---
        const beatP1 = page.getByTestId(`storyboard-beat-select-${p1.id}`)
        await beatP1.selectOption("climax")
        // Beat badge above the selector renders the new value.
        await expect(
            page.getByTestId(`storyboard-beat-tag-${p1.id}`),
        ).toBeVisible()
        // data-story-beat attribute on the card.
        await expect(
            page.getByTestId(`storyboard-card-${p1.id}`),
        ).toHaveAttribute("data-story-beat", "climax")
        await expect
            .poll(async () => (await listPages(book.id))[0].story_beat, {
                timeout: 5000,
            })
            .toBe("climax")

        // --- Mood color (C3) ---
        const swatch = page.getByTestId(
            `storyboard-mood-swatch-passionate-${p3.id}`,
        )
        await swatch.click()
        // Swatch carries data-selected="true" after click.
        await expect(swatch).toHaveAttribute("data-selected", "true")
        // Card's data-mood-color attribute matches the hex.
        await expect(
            page.getByTestId(`storyboard-card-${p3.id}`),
        ).toHaveAttribute("data-mood-color", "#FF6B6B")
        // Clear button now mounts (was absent before any color was set).
        await expect(
            page.getByTestId(`storyboard-mood-clear-${p3.id}`),
        ).toBeVisible()
        await expect
            .poll(async () => (await listPages(book.id))[2].mood_color, {
                timeout: 5000,
            })
            .toBe("#FF6B6B")

        // --- Act group (C4) ---
        const actP1 = page.getByTestId(`storyboard-act-group-${p1.id}`)
        await actP1.fill("Act I")
        await actP1.blur()
        await expect
            .poll(async () => (await listPages(book.id))[0].act_group, {
                timeout: 5000,
            })
            .toBe("Act I")
        // A group header now exists for "Act I".
        await expect(
            page.locator('[data-testid="storyboard-act-group"][data-act-group="Act I"]'),
        ).toBeVisible()
    })

    test("clearing notes via empty blur persists as null", async ({page}) => {
        const book = await createPictureBook("Storyboard Clear Notes", "E2E")
        const created = await createPage(book.id)
        // Seed notes via API so we have something to clear.
        await fetch(`${API}/books/${book.id}/pages/${created.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({notes: "Initial note"}),
        })

        await page.goto(`/book/${book.id}?view=storyboard`)
        const textarea = page.getByTestId(`storyboard-notes-${created.id}`)
        await expect(textarea).toHaveValue("Initial note")

        await textarea.fill("")
        await textarea.blur()

        await expect
            .poll(async () => (await listPages(book.id))[0].notes, {
                timeout: 5000,
            })
            .toBe(null)
    })

    test("clicking selected swatch toggles mood_color back to null", async ({
        page,
    }) => {
        const book = await createPictureBook("Storyboard Toggle Mood", "E2E")
        const created = await createPage(book.id)
        // Seed a color via API.
        await fetch(`${API}/books/${book.id}/pages/${created.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({mood_color: "#4ECDC4"}),
        })

        await page.goto(`/book/${book.id}?view=storyboard`)
        const swatch = page.getByTestId(
            `storyboard-mood-swatch-calm-${created.id}`,
        )
        await expect(swatch).toHaveAttribute("data-selected", "true")
        // Click the selected swatch to toggle it off.
        await swatch.click()
        await expect(swatch).toHaveAttribute("data-selected", "false")

        await expect
            .poll(async () => (await listPages(book.id))[0].mood_color, {
                timeout: 5000,
            })
            .toBe(null)
    })
})
