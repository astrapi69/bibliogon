/**
 * Bug 9 E2E smoke: Books-only Categories + BISAC.
 *
 * Two layers of coverage in a single spec file:
 *
 *  1. Backend round-trip (API-only, no browser). PATCH categories
 *     + bisac_codes via the API, GET to verify they persist. Pins
 *     the JSON-text-storage + decode-on-read contract that the
 *     Vitest-level schema tests assert; the E2E version proves
 *     it holds against a live server with a real SQLite DB
 *     under the hood. Mirrors the existing
 *     ``book-metadata-roundtrip.spec.ts`` pattern.
 *
 *  2. UI integration. Open the Book editor, switch to the
 *     metadata view, switch to the Marketing tab, type a
 *     category + BISAC code via the chip inputs, click save,
 *     reload, verify the chips re-render. Confirms the
 *     wiring is intact end-to-end: chip-input → state →
 *     handleSave payload → PATCH endpoint → DB → GET response
 *     → BookMetadataEditor seed → chip-input render.
 *
 * Per the testid-discipline rule, every testid the spec touches
 * is documented in the component header docstring (CategoryInput,
 * BisacCodeInput, BookMetadataEditor). This spec is the positive-
 * walk that catches namespace drift before it produces a silent
 * G2-F2-style skip.
 */

import {test, expect, createBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

async function getBook(id: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${API}/books/${id}`)
    if (!res.ok) throw new Error(`GET book: ${res.status} ${await res.text()}`)
    return res.json()
}

async function patchBook(
    id: string,
    patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const res = await fetch(`${API}/books/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(patch),
    })
    if (!res.ok) {
        throw new Error(`PATCH book: ${res.status} ${await res.text()}`)
    }
    return res.json()
}

test.describe("Book Categories + BISAC API round-trip (Bug 9)", () => {
    let bookId: string

    test.beforeEach(async () => {
        const book = await createBook("Bug 9 round-trip")
        bookId = book.id
    })

    test("categories list survives PATCH + GET round-trip", async () => {
        const value = ["Fiction", "Fantasy", "Coming of Age"]
        const patchResp = await patchBook(bookId, {categories: value})
        expect(patchResp.categories).toEqual(value)
        const fresh = await getBook(bookId)
        expect(fresh.categories).toEqual(value)
    })

    test("BISAC codes round-trip with uppercase normalisation", async () => {
        // Lowercase input → server upper-cases to canonical form.
        const patchResp = await patchBook(bookId, {
            bisac_codes: ["fic022020", "BIO000000"],
        })
        expect(patchResp.bisac_codes).toEqual(["FIC022020", "BIO000000"])
        const fresh = await getBook(bookId)
        expect(fresh.bisac_codes).toEqual(["FIC022020", "BIO000000"])
    })

    test("invalid BISAC format returns 422 with the offending code in the detail", async () => {
        const res = await fetch(`${API}/books/${bookId}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({bisac_codes: ["BAD-FORMAT"]}),
        })
        expect(res.status).toBe(422)
        const body = JSON.stringify(await res.json())
        expect(body).toContain("BAD-FORMAT")
        // Confirm the row was NOT mutated — the previous test left
        // BISAC at ["FIC022020", "BIO000000"] when the PATCH failed,
        // BUT this test runs against a fresh book (beforeEach). So
        // the field stays at its default empty list.
        const fresh = await getBook(bookId)
        expect(fresh.bisac_codes).toEqual([])
    })

    test("setting one field does not disturb the other", async () => {
        await patchBook(bookId, {categories: ["Fiction"]})
        await patchBook(bookId, {bisac_codes: ["FIC022020"]})
        const fresh = await getBook(bookId)
        expect(fresh.categories).toEqual(["Fiction"])
        expect(fresh.bisac_codes).toEqual(["FIC022020"])
    })

    test("empty list clears the field", async () => {
        await patchBook(bookId, {
            categories: ["Fiction"],
            bisac_codes: ["FIC022020"],
        })
        await patchBook(bookId, {categories: [], bisac_codes: []})
        const fresh = await getBook(bookId)
        expect(fresh.categories).toEqual([])
        expect(fresh.bisac_codes).toEqual([])
    })
})

test.describe("Book Categories + BISAC UI integration (Bug 9)", () => {
    test("chip inputs render in Marketing tab + categories save round-trip via UI", async ({
        page,
    }) => {
        const book = await createBook("Bug 9 UI round-trip")
        // Navigate to the Book editor in metadata view directly.
        await page.goto(`/book/${book.id}?view=metadata`)
        // Switch to the Marketing tab (Bug 9 chip inputs live here).
        await page.getByTestId("metadata-tab-marketing").click()

        // Both chip-input components present.
        await expect(page.getByTestId("category-input")).toBeVisible()
        await expect(page.getByTestId("bisac-input")).toBeVisible()

        // Type a category and add it via the button.
        await page
            .getByTestId("category-input-add")
            .fill("Fantasy & Adventure")
        await page.getByTestId("category-input-add-button").click()
        await expect(page.getByTestId("category-chip-0")).toContainText(
            "Fantasy & Adventure",
        )

        // Type a BISAC code (lowercase) and add via Enter.
        const bisacInput = page.getByTestId("bisac-input-add")
        await bisacInput.fill("fic022020")
        await bisacInput.press("Enter")
        await expect(page.getByTestId("bisac-chip-0")).toContainText(
            "FIC022020",
        )

        // Save.
        await page.getByTestId("metadata-save").click()

        // Backend verification: the PATCH landed with the expected
        // values. Don't rely on the toast since toasts can be slow
        // to render under happy-dom; the backend is the truth.
        await expect
            .poll(async () => {
                const fresh = await getBook(book.id)
                return fresh.categories
            })
            .toEqual(["Fantasy & Adventure"])
        await expect
            .poll(async () => {
                const fresh = await getBook(book.id)
                return fresh.bisac_codes
            })
            .toEqual(["FIC022020"])

        // Reload and confirm the chips re-render from server state.
        await page.reload()
        await page.getByTestId("metadata-tab-marketing").click()
        await expect(page.getByTestId("category-chip-0")).toContainText(
            "Fantasy & Adventure",
        )
        await expect(page.getByTestId("bisac-chip-0")).toContainText(
            "FIC022020",
        )
    })

    test("inline BISAC format error appears for invalid input + disables Add button", async ({
        page,
    }) => {
        const book = await createBook("Bug 9 inline-error")
        await page.goto(`/book/${book.id}?view=metadata`)
        await page.getByTestId("metadata-tab-marketing").click()

        const input = page.getByTestId("bisac-input-add")
        await input.fill("INVALID")
        await expect(page.getByTestId("bisac-input-format-error")).toBeVisible()
        await expect(page.getByTestId("bisac-input-add-button")).toBeDisabled()

        // Correcting the input clears the error + enables Add.
        await input.fill("")
        await input.fill("FIC022020")
        await expect(
            page.getByTestId("bisac-input-format-error"),
        ).toHaveCount(0)
        await expect(page.getByTestId("bisac-input-add-button")).toBeEnabled()
    })

    test("BISG helper link points at the canonical BISG public page", async ({
        page,
    }) => {
        const book = await createBook("Bug 9 helper-link")
        await page.goto(`/book/${book.id}?view=metadata`)
        await page.getByTestId("metadata-tab-marketing").click()
        const link = page.getByTestId("bisac-input-helper-link")
        await expect(link).toBeVisible()
        const href = await link.getAttribute("href")
        expect(href).toContain("bisg.org")
        expect(href).toContain("bisac-subject-headings")
    })

    // HOTFIX regression pin (Categories+BISAC tab-leak BLOCKER):
    // forceMount on the Marketing Tabs.Content was making Categories
    // + BISAC visible on EVERY tab. This test pins the fix end-to-
    // end in a real browser, covering the round-trip path that
    // jsdom can't (Radix Presence's unmount-via-animationend
    // transition fires reliably only in real browsers).
    test("tab-content-isolation: Categories + BISAC visible ONLY on Marketing tab", async ({page}) => {
        const book = await createBook("Tab-Leak Regression Pin")
        await page.goto(`/book/${book.id}?view=metadata`)

        // Initial: default 'general' tab is active. Categories +
        // BISAC inputs must NOT be visible.
        await expect(page.getByTestId("metadata-tab-general")).toBeVisible()
        await expect(page.getByTestId("metadata-categories-field")).toHaveCount(0)
        await expect(page.getByTestId("metadata-bisac-field")).toHaveCount(0)
        await expect(page.getByTestId("category-input")).toHaveCount(0)
        await expect(page.getByTestId("bisac-input")).toHaveCount(0)

        // Click Marketing → Categories + BISAC appear.
        await page.getByTestId("metadata-tab-marketing").click()
        await expect(page.getByTestId("metadata-categories-field")).toBeVisible()
        await expect(page.getByTestId("metadata-bisac-field")).toBeVisible()
        await expect(page.getByTestId("category-input")).toBeVisible()
        await expect(page.getByTestId("bisac-input")).toBeVisible()

        // Click General → Categories + BISAC disappear again.
        // This is the path Vitest can't cover (jsdom doesn't run
        // CSS animations so Radix Presence stays in
        // 'unmountSuspended'). Playwright runs in a real browser
        // where the animationend event fires and the state machine
        // settles into 'unmounted'.
        await page.getByTestId("metadata-tab-general").click()
        await expect(page.getByTestId("metadata-categories-field")).toHaveCount(0)
        await expect(page.getByTestId("metadata-bisac-field")).toHaveCount(0)

        // Spot-check a few other tabs to confirm none leak.
        await page.getByTestId("metadata-tab-publisher").click()
        await expect(page.getByTestId("metadata-categories-field")).toHaveCount(0)
        await page.getByTestId("metadata-tab-isbn").click()
        await expect(page.getByTestId("metadata-categories-field")).toHaveCount(0)
        await page.getByTestId("metadata-tab-design").click()
        await expect(page.getByTestId("metadata-categories-field")).toHaveCount(0)
    })
})
