/**
 * Bulk article export smoke (AR-BULK-PLAYWRIGHT-SMOKE-01).
 *
 * The 2026-05-06 v0.27.0 release shipped without bulk-export-
 * specific Playwright coverage. This spec closes that gap. Keeps
 * to the happy path (selection + bar + ZIP markdown download +
 * filter compose); exhaustive format / failure-path coverage
 * lives in the backend pytest suite (test_articles_bulk_export.py)
 * which already runs all four formats in both modes.
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

async function patchJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
    return res.json()
}

interface ArticleFixture {
    id: string
    title: string
}

async function seedArticle(
    title: string,
    series: string | null,
    tags: string[] = [],
    body: string = "Body text.",
): Promise<ArticleFixture> {
    const a = await postJson<ArticleFixture>("/articles", {title})
    await patchJson(`/articles/${a.id}`, {
        series,
        tags,
        content_json: JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: body}],
                },
            ],
        }),
    })
    return a
}

test.describe("Bulk article export", () => {
    test("checkbox + bulk-action-bar + ZIP markdown download", async ({page}) => {
        const a = await seedArticle("Cosmos: Intro", "Cosmos")
        const b = await seedArticle("Cosmos: Stars", "Cosmos")
        await seedArticle("Other Topic", "Other")

        await page.goto("/articles")
        await expect(page.getByTestId("article-list")).toBeVisible()

        // Per-tile checkboxes exist for all three articles. Click two.
        const checkA = page.getByTestId(`article-bulk-check-${a.id}`)
        const checkB = page.getByTestId(`article-bulk-check-${b.id}`)
        await expect(checkA).toBeVisible()
        await checkA.check()
        await checkB.check()

        // Bulk-action bar appears with count=2 selected.
        const bar = page.getByTestId("article-bulk-action-bar")
        await expect(bar).toBeVisible()
        await expect(page.getByTestId("article-bulk-count")).toContainText(/^2/)

        // Format defaults to markdown, mode defaults to ZIP. Trigger
        // the export and verify the response is downloadable.
        const downloadPromise = page.waitForEvent("download")
        await page.getByTestId("article-bulk-export").click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/articles-.*\.zip$/)
    })

    test("series filter + Select all selects only the filtered articles", async ({
        page,
    }) => {
        const a = await seedArticle("Cosmos: Intro", "Cosmos")
        const b = await seedArticle("Cosmos: Stars", "Cosmos")
        const c = await seedArticle("Other Topic", "Other")

        await page.goto("/articles")
        await expect(page.getByTestId("article-list")).toBeVisible()

        // Apply the series filter; the list narrows to A + B only.
        const seriesFilter = page.getByTestId("article-list-filter-series-trigger")
        await expect(seriesFilter).toBeVisible()
        await seriesFilter.click()
        await page.getByTestId("article-list-filter-series-item-Cosmos").click()
        await expect(page.getByTestId(`article-bulk-check-${c.id}`)).toBeHidden()

        // Click Select-all. Selection count must equal the filtered set
        // size (2), NOT the total article count (3).
        const selectAll = page.getByTestId("article-bulk-select-all")
        await selectAll.check()
        await expect(page.getByTestId("article-bulk-count")).toContainText(/^2/)
        await expect(
            page.getByTestId(`article-bulk-check-${a.id}`),
        ).toBeChecked()
        await expect(
            page.getByTestId(`article-bulk-check-${b.id}`),
        ).toBeChecked()

        // Clear restores empty state.
        await page.getByTestId("article-bulk-clear").click()
        await expect(page.getByTestId("article-bulk-action-bar")).toBeHidden()
    })

    test("filter change clears selection (UX contract)", async ({page}) => {
        const a = await seedArticle("Cosmos: Intro", "Cosmos")
        const b = await seedArticle("Cosmos: Stars", "Cosmos")
        await seedArticle("Other Topic", "Other")

        await page.goto("/articles")
        await expect(page.getByTestId("article-list")).toBeVisible()

        // Select two articles, confirm bar visible, then change a
        // filter; the previously selected articles may now be hidden,
        // so the selection clears automatically and the bar
        // disappears.
        await page.getByTestId(`article-bulk-check-${a.id}`).check()
        await page.getByTestId(`article-bulk-check-${b.id}`).check()
        await expect(page.getByTestId("article-bulk-action-bar")).toBeVisible()

        await page
            .getByTestId("article-list-filter-series-trigger")
            .click()
        await page.getByTestId("article-list-filter-series-item-Other").click()
        await expect(page.getByTestId("article-bulk-action-bar")).toBeHidden()
    })
})
