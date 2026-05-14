/**
 * Articles trash flow smoke (ARTICLES-TRASH-PLAYWRIGHT-SMOKE-01).
 *
 * Positive regression-pin for the user-reported 2026-05-14 incident
 * where the Articles-Trash Restore button "didn't work" (initially
 * misattributed to a Workbox / Service Worker route issue — the
 * diagnosis was that the SW config is symmetric for books and
 * articles and the "No route found" workbox console message is
 * benign info, not blocking).
 *
 * The books-trash equivalent exists in e2e/smoke/trash.spec.ts;
 * this spec is the parallel coverage for articles. Per the
 * 2026-05-14 test-discipline rule: every reported bug — including
 * ones where the diagnosis points elsewhere — gets an E2E
 * regression-pin so future regressions in the same surface are
 * caught immediately.
 *
 * Pins the full lifecycle:
 *   1. soft-delete an article → it disappears from the live grid
 *      and appears in the trash panel
 *   2. restore from trash → it disappears from trash and reappears
 *      in the live grid
 *   3. backend state matches the UI claims
 */

import {test, expect} from "../fixtures/base"

const API = "http://localhost:8000/api"

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`)
    return res.json()
}

async function getArticles(): Promise<{id: string; title: string}[]> {
    const res = await fetch(`${API}/articles`)
    if (!res.ok) throw new Error(`GET articles: ${res.status}`)
    return res.json()
}

async function getArticlesTrash(): Promise<{id: string; title: string}[]> {
    const res = await fetch(`${API}/articles/trash/list`)
    if (!res.ok) throw new Error(`GET articles trash: ${res.status}`)
    return res.json()
}

interface ArticleFixture {
    id: string
    title: string
}

test.describe("Articles trash - soft-delete + restore round-trip", () => {
    test("restore button returns the article to the live list", async ({page}) => {
        const a = await postJson<ArticleFixture>("/articles", {
            title: "Articles Trash Restore Smoke",
        })

        await page.goto("/articles")
        await expect(page.getByTestId(`article-bulk-check-${a.id}`)).toBeVisible()

        // Soft-delete the article via its row menu.
        await page.getByTestId(`article-card-menu-${a.id}`).click()
        await page.getByTestId(`article-card-menu-delete-${a.id}`).click()

        // Live grid no longer shows the article.
        await expect(page.getByTestId(`article-bulk-check-${a.id}`)).toBeHidden()

        // Open the trash view via the toggle.
        await page.getByTestId("article-list-trash-toggle").click()
        await expect(page.getByTestId("article-trash-panel")).toBeVisible()

        // Restore button addressable. Uses the restore testid which is
        // rendered identically in both grid and list views, so the
        // spec works regardless of the user's preferred view mode.
        const restoreButton = page.getByTestId(`article-trash-restore-${a.id}`)
        await expect(restoreButton).toBeVisible()

        // The load-bearing assertion: clicking restore actually fires
        // the POST /api/articles/trash/{id}/restore call AND the UI
        // reconciles. Pins the user-reported "restore doesn't work"
        // path against future regressions.
        await restoreButton.click()

        // Restore button gone (the trashed entry was removed from
        // the trash view's render).
        await expect(restoreButton).toBeHidden()

        // Leave trash view, confirm article is back in the live grid.
        await page.getByTestId("article-trash-back").click()
        await expect(page.getByTestId(`article-bulk-check-${a.id}`)).toBeVisible()

        // Backend state matches UI claims.
        const live = await getArticles()
        expect(live.find((x) => x.id === a.id)).toBeDefined()
        const trashed = await getArticlesTrash()
        expect(trashed.find((x) => x.id === a.id)).toBeUndefined()
    })
})
