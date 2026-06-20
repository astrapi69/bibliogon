/**
 * UX-Full-Audit Surface Group 2: Dashboards walkthrough.
 *
 * Surfaces: Articles Dashboard, Books Dashboard, Articles Trash,
 * Books Trash, Comments Admin (in Settings), Medium Import.
 *
 * Same shape as Group 1 spec — minimal assertions, value is the
 * inspection + screenshots + console.log payload that feeds the
 * audit report.
 */

import {test} from "@playwright/test"
import * as path from "node:path"
import {
    resetDb,
    setDashboardView,
    createArticlesBulk,
    seedBooksWithChapters,
} from "../helpers/api"
import {suppressOnboarding} from "../helpers/ui"

const ARTICLE_COUNT = 198

const SCREENSHOT_DIR = path.resolve(
    __dirname,
    "../../docs/audits/ux-full-audit-2026-05-14-screenshots",
)

async function snap(page: import("@playwright/test").Page, name: string) {
    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `group2-${name}.png`),
        fullPage: true,
    })
}

test.describe("UX-Audit Group 2: Dashboards", () => {
    // Seed the audit corpus once (198 articles + 2 books). These specs
    // bypass the auto-reset `resetDatabase` fixture so the seed survives
    // across the group; test 03 plants + restores its own trash item.
    test.beforeAll(async () => {
        await resetDb()
        await setDashboardView("grid")
        await createArticlesBulk(ARTICLE_COUNT)
        await seedBooksWithChapters(2)
    })

    test.beforeEach(async ({page}) => {
        page.setDefaultTimeout(10000)
        await suppressOnboarding(page)
    })

    test("01 Articles dashboard - list view + filter affordances", async ({page}) => {
        await page.goto("http://localhost:5173/articles")
        await page.waitForSelector('[data-testid^="article-bulk-check-"]')
        await snap(page, "01a-articles-default-view")

        const articleCount = await page
            .locator('[data-testid^="article-bulk-check-"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`Articles in default view: ${articleCount}`)

        // Filter affordances — uses the shared DashboardFilterBar
        // testid scheme (filter-bar / filter-search-input /
        // filter-sort-* / filter-reset). The same component is
        // mounted on both Articles + Books dashboards.
        const filters = [
            "filter-bar",
            "filter-search-input",
            "filter-reset",
            "filter-sort-direction",
        ]
        for (const f of filters) {
            const n = await page.locator(`[data-testid="${f}"]`).count()
            // eslint-disable-next-line no-console
            console.log(`  ${f}: ${n}`)
        }

        // List vs grid view toggle (ViewToggle component)
        const viewToggle = await page.locator('[data-testid="view-toggle"]').count()
        const viewToggleGrid = await page
            .locator('[data-testid="view-toggle-grid"]')
            .count()
        const viewToggleList = await page
            .locator('[data-testid="view-toggle-list"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(
            `view toggle root=${viewToggle} grid=${viewToggleGrid} list=${viewToggleList}`,
        )
    })

    test("02 Articles dashboard - filter persistence on navigation", async ({page}) => {
        await page.goto("http://localhost:5173/articles")
        await page.waitForSelector('[data-testid^="article-bulk-check-"]')

        // Open filter sheet if present (mobile-style sheet), else
        // filter-bar is inline.
        const search = page.locator('[data-testid="filter-search-input"]')
        const hasSearch = await search.count()
        // eslint-disable-next-line no-console
        console.log(`filter-search-input on /articles: count=${hasSearch}`)
        if (hasSearch > 0) {
            await search.first().fill("Phylax")
            await page.waitForTimeout(500)
            const filteredCount = await page
                .locator('[data-testid^="article-bulk-check-"]')
                .count()
            // eslint-disable-next-line no-console
            console.log(`After typing "Phylax": ${filteredCount} articles visible`)
            await snap(page, "02a-articles-filtered-search")

            // Verify URL reflects filter (useArticleFilters is URL-synced
            // per the codebase comment in useArticleSelection.ts).
            const urlAfterFilter = page.url()
            // eslint-disable-next-line no-console
            console.log(`URL after filter applied: ${urlAfterFilter}`)

            // Navigate away to books, then back.
            await page.goto("http://localhost:5173/")
            await page.waitForTimeout(500)
            await page.goto("http://localhost:5173/articles")
            await page.waitForTimeout(1000)

            const searchAfter = await page
                .locator('[data-testid="filter-search-input"]')
                .first()
                .inputValue()
                .catch(() => "<not found>")
            // eslint-disable-next-line no-console
            console.log(`Search value after round-trip: "${searchAfter}"`)
            const urlAfter = page.url()
            // eslint-disable-next-line no-console
            console.log(`URL after round-trip: ${urlAfter}`)
        }
    })

    test("03 Articles trash view - empty + populated", async ({page}) => {
        await page.goto("http://localhost:5173/articles")
        await page.waitForSelector('[data-testid="article-list-trash-toggle"]')
        await page.getByTestId("article-list-trash-toggle").click()
        await page.waitForTimeout(500)
        await snap(page, "03a-articles-trash-empty")

        const emptyState = await page
            .locator('[data-testid="article-trash-empty"], [data-testid="article-trash-grid"], [data-testid="article-trash-list"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`Trash view markup count: ${emptyState}`)

        // Plant one trash item via API for screenshot evidence
        const articles = await page.evaluate(async () => {
            const r = await fetch("/api/articles")
            return await r.json()
        })
        if (articles.length > 0) {
            const id = articles[0].id
            await page.evaluate(async (articleId) => {
                await fetch(`/api/articles/${articleId}`, {method: "DELETE"})
            }, id)

            // Refresh trash
            await page.reload()
            await page.waitForSelector('[data-testid="article-list-trash-toggle"]')
            await page.getByTestId("article-list-trash-toggle").click()
            await page.waitForTimeout(500)
            await snap(page, "03b-articles-trash-with-one-item")

            // Restore it back via API
            await page.evaluate(async (articleId) => {
                await fetch(`/api/articles/trash/${articleId}/restore`, {method: "POST"})
            }, id)
        }
    })

    test("04 Books dashboard - default view", async ({page}) => {
        await page.goto("http://localhost:5173/")
        await page.waitForSelector('[data-testid^="book-card-"]')
        await snap(page, "04a-books-dashboard")

        // Books-card-root testids only (exclude menu / placeholder /
        // bulk-check subtestids).
        const cards = await page
            .locator('[data-testid^="book-card-"]:not([data-testid*="-menu-"]):not([data-testid*="-placeholder-"]):not([data-testid*="-bulk-"])')
            .all()
        // eslint-disable-next-line no-console
        console.log(`Books cards (excluding sub-testids): ${cards.length}`)

        // Same shared-filter testids as Articles dashboard.
        const filters = [
            "filter-bar",
            "filter-search-input",
            "filter-reset",
            "filter-sort-direction",
        ]
        for (const f of filters) {
            const n = await page.locator(`[data-testid="${f}"]`).count()
            // eslint-disable-next-line no-console
            console.log(`  ${f}: ${n}`)
        }
    })

    test("05 Comments Admin - in Settings", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForSelector('[data-testid="settings-tab-comments"]', {timeout: 5000})
        await page.getByTestId("settings-tab-comments").click()
        await page.waitForTimeout(800)
        await snap(page, "05-comments-admin-tab")

        // Correct testid pattern: comments-admin-row-{id}
        const commentRows = await page
            .locator('[data-testid^="comments-admin-row-"]:not([data-testid*="-orphan"])')
            .count()
        // eslint-disable-next-line no-console
        console.log(`Comments admin rows visible: ${commentRows}`)

        const tableExists = await page
            .locator('[data-testid="comments-admin-table"]')
            .count()
        const emptyState = await page
            .locator('[data-testid="comments-admin-empty"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`table: ${tableExists}, empty: ${emptyState}`)
    })

    test("06 Medium Import page", async ({page}) => {
        await page.goto("http://localhost:5173/articles/import/medium")
        await page.waitForTimeout(1000)
        await snap(page, "06-medium-import-page")

        const fileInput = await page.locator('input[type="file"]').count()
        const backBtn = await page
            .locator('[data-testid="medium-import-back"]')
            .count()
        const homeBtn = await page
            .locator('[data-testid="medium-import-home-btn"]')
            .count()
        const startBtn = await page
            .locator('[data-testid="medium-import-start"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(
            `Medium import: file-input=${fileInput} back=${backBtn} home=${homeBtn} start=${startBtn}`,
        )
    })

    test("07 Dark mode - all dashboards", async ({page}) => {
        const dark = `() => document.documentElement.setAttribute("data-theme", "dark")`

        // Articles
        await page.goto("http://localhost:5173/articles")
        await page.waitForSelector('[data-testid^="article-bulk-check-"]')
        await page.evaluate(dark)
        await page.waitForTimeout(300)
        await snap(page, "07a-articles-dark")

        // Books
        await page.goto("http://localhost:5173/")
        await page.waitForSelector('[data-testid^="book-card-"]')
        await page.evaluate(dark)
        await page.waitForTimeout(300)
        await snap(page, "07b-books-dark")

        // Comments admin
        await page.goto("http://localhost:5173/settings")
        await page.waitForSelector('[data-testid="settings-tab-comments"]')
        await page.getByTestId("settings-tab-comments").click()
        await page.evaluate(dark)
        await page.waitForTimeout(300)
        await snap(page, "07c-comments-admin-dark")
    })
})
