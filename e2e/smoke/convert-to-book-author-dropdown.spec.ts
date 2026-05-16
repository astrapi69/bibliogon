/**
 * Bug 8 Phase 2 E2E smoke: Wizard Author-Dropdown.
 *
 * Covers the Phase 2 mandatory checklist:
 *
 *   1. Single article with author → wizard pre-fills author field.
 *   2. Multiple articles same author → pre-fill works.
 *   3. Multiple articles different authors → empty + datalist
 *      surfaces every distinct author as a suggestion option.
 *   4. Type new author + checkbox checked → Author is created in
 *      the global Authors-Database (verified via GET /api/authors).
 *   5. Type new author + checkbox unchecked → Author NOT created;
 *      book still creates with the typed name as free-text.
 *   6. Type a name already in the DB → checkbox hides; no
 *      duplicate Author row is created on submit.
 *
 * Testid namespace pinned: ``convert-to-book-wizard-author-*``.
 * The component header docstring documents the namespace contract
 * per the testid-discipline lessons-learned rule; this spec is the
 * positive-coverage walk that prevents G2-F2-style silent skips.
 */

import {test, expect} from "../fixtures/base"

const API = "http://localhost:8000/api"

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        throw new Error(`POST ${path}: ${res.status} ${await res.text()}`)
    }
    return res.json()
}

async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`)
    if (!res.ok) {
        throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
    }
    return res.json()
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
    }
    return res.json()
}

interface ArticleFixture {
    id: string
    title: string
}

async function seedArticle(
    title: string,
    author: string | null,
    body: string = "Body text.",
): Promise<ArticleFixture> {
    const a = await postJson<ArticleFixture>("/articles", {title, author})
    await patchJson(`/articles/${a.id}`, {
        content_json: JSON.stringify({
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: body}]},
            ],
        }),
    })
    return a
}

async function clearAuthors(): Promise<void> {
    const existing = await getJson<Array<{id: string}>>("/authors")
    for (const a of existing) {
        const res = await fetch(`${API}/authors/${a.id}`, {method: "DELETE"})
        if (!res.ok) {
            throw new Error(`cleanup: DELETE /authors/${a.id}: ${res.status}`)
        }
    }
}

async function openWizard(page: import("@playwright/test").Page, ids: string[]) {
    await page.goto("/articles")
    await expect(page.getByTestId("article-list")).toBeVisible()
    for (const id of ids) {
        await page.getByTestId(`article-bulk-check-${id}`).check()
    }
    await page.getByTestId("article-bulk-convert-to-book").click()
    // Step 0 (selection) → Step 1 (metadata).
    await expect(
        page.getByTestId("convert-to-book-wizard-selection-list"),
    ).toBeVisible()
    await page.getByTestId("convert-to-book-wizard-step-0-next").click()
}

test.describe("Wizard Author-Dropdown (Bug 8 Phase 2)", () => {
    test.beforeEach(async () => {
        await clearAuthors()
    })

    test("single article with author pre-fills the wizard input", async ({page}) => {
        const a = await seedArticle("Solo article", "Asterios Raptis")
        await openWizard(page, [a.id])
        const input = page.getByTestId(
            "convert-to-book-wizard-metadata-author",
        )
        await expect(input).toHaveValue("Asterios Raptis")
    })

    test("multiple articles sharing one author pre-fill the wizard input", async ({page}) => {
        const a = await seedArticle("Article A", "Bruce Dickinson")
        const b = await seedArticle("Article B", "Bruce Dickinson")
        const c = await seedArticle("Article C", "Bruce Dickinson")
        await openWizard(page, [a.id, b.id, c.id])
        const input = page.getByTestId(
            "convert-to-book-wizard-metadata-author",
        )
        await expect(input).toHaveValue("Bruce Dickinson")
    })

    test("multiple articles with different authors leaves the input empty and surfaces every option", async ({
        page,
    }) => {
        const a = await seedArticle("By Alice", "Alice")
        const b = await seedArticle("By Bob", "Bob")
        const c = await seedArticle("By Carol", "Carol")
        await openWizard(page, [a.id, b.id, c.id])
        const input = page.getByTestId(
            "convert-to-book-wizard-metadata-author",
        )
        await expect(input).toHaveValue("")
        // Verify the datalist options match the article author set.
        const datalist = page.getByTestId(
            "convert-to-book-wizard-author-datalist",
        )
        const values = await datalist
            .locator("option")
            .evaluateAll((nodes) =>
                nodes.map((n) => (n as HTMLOptionElement).value),
            )
        expect(values).toEqual(["Alice", "Bob", "Carol"])
    })

    test("typing a new name with checkbox CHECKED creates the Author in the DB", async ({
        page,
    }) => {
        const a = await seedArticle("Article", null)
        await openWizard(page, [a.id])
        await page
            .getByTestId("convert-to-book-wizard-metadata-title")
            .fill("New Book From Article")
        const newName = `Brand New Person ${Date.now()}`
        await page
            .getByTestId("convert-to-book-wizard-metadata-author")
            .fill(newName)
        // Checkbox visible + checked by default.
        const cb = page.getByTestId(
            "convert-to-book-wizard-add-to-authors-checkbox",
        )
        await expect(cb).toBeVisible()
        await expect(cb).toBeChecked()
        // Skip the rest of the wizard and submit.
        await page.getByTestId("convert-to-book-wizard-step-1-next").click()
        await page.getByTestId("convert-to-book-wizard-step-2-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-3-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-4-next").click()
        await page.getByTestId("convert-to-book-wizard-review-confirm").click()
        // Wait for the success toast.
        await expect(
            page.getByTestId("convert-to-book-success-view-book"),
        ).toBeVisible()
        // Verify the Author landed in the DB.
        const authors = await getJson<Array<{id: string; name: string}>>(
            "/authors",
        )
        expect(authors.some((a) => a.name === newName)).toBe(true)
    })

    test("typing a new name with checkbox UNCHECKED does NOT create the Author", async ({
        page,
    }) => {
        const a = await seedArticle("Article", null)
        await openWizard(page, [a.id])
        await page
            .getByTestId("convert-to-book-wizard-metadata-title")
            .fill("Another Book")
        const newName = `Skipped Author ${Date.now()}`
        await page
            .getByTestId("convert-to-book-wizard-metadata-author")
            .fill(newName)
        // Uncheck the checkbox.
        const cb = page.getByTestId(
            "convert-to-book-wizard-add-to-authors-checkbox",
        )
        await expect(cb).toBeVisible()
        await cb.uncheck()
        await expect(cb).not.toBeChecked()
        // Submit.
        await page.getByTestId("convert-to-book-wizard-step-1-next").click()
        await page.getByTestId("convert-to-book-wizard-step-2-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-3-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-4-next").click()
        await page.getByTestId("convert-to-book-wizard-review-confirm").click()
        await expect(
            page.getByTestId("convert-to-book-success-view-book"),
        ).toBeVisible()
        // Author NOT in the DB.
        const authors = await getJson<Array<{id: string; name: string}>>(
            "/authors",
        )
        expect(authors.some((a) => a.name === newName)).toBe(false)
    })

    test("typing a name already in the DB hides the checkbox + does not duplicate", async ({
        page,
    }) => {
        // Seed an existing DB author.
        const existing = await postJson<{id: string; name: string}>(
            "/authors",
            {name: "Existing Author"},
        )
        const a = await seedArticle("Article", null)
        await openWizard(page, [a.id])
        await page
            .getByTestId("convert-to-book-wizard-metadata-title")
            .fill("Book by Existing")
        await page
            .getByTestId("convert-to-book-wizard-metadata-author")
            .fill("Existing Author")
        // Checkbox should be hidden because the name matches the DB.
        await expect(
            page.getByTestId("convert-to-book-wizard-add-to-authors-checkbox"),
        ).toHaveCount(0)
        // Submit.
        await page.getByTestId("convert-to-book-wizard-step-1-next").click()
        await page.getByTestId("convert-to-book-wizard-step-2-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-3-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-4-next").click()
        await page.getByTestId("convert-to-book-wizard-review-confirm").click()
        await expect(
            page.getByTestId("convert-to-book-success-view-book"),
        ).toBeVisible()
        // Authors-DB still has exactly one row with that name (no duplicate).
        const authors = await getJson<Array<{id: string; name: string}>>(
            "/authors",
        )
        const matches = authors.filter((a) => a.name === "Existing Author")
        expect(matches).toHaveLength(1)
        expect(matches[0].id).toBe(existing.id)
    })
})
