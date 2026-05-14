/**
 * UX-Full-Audit Surface Group 1: Core Editors walkthrough.
 *
 * Walks ArticleEditor + BookEditor + shared Toolbar via the
 * already-running dev backend (with 198 articles + 11 comments
 * imported from the 209-corpus). Captures DOM state at key
 * stations + screenshots for the audit report.
 *
 * Run with:
 *   cd e2e && npx playwright test audits/ux-walkthrough-group1.spec.ts --headed=false
 *
 * Outputs: docs/audits/ux-full-audit-2026-05-14-screenshots/group1-*.png
 *
 * Not a test in the conventional sense — these specs gather
 * evidence for the audit report. Assertions are minimal (just
 * "page loaded"); the value is the screenshot + DOM inspection.
 */

import {test, expect} from "@playwright/test"
import * as path from "node:path"

const SCREENSHOT_DIR = path.resolve(
    __dirname,
    "../../docs/audits/ux-full-audit-2026-05-14-screenshots",
)

async function snap(page: import("@playwright/test").Page, name: string) {
    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `group1-${name}.png`),
        fullPage: true,
    })
}

test.describe("UX-Audit Group 1: Core Editors", () => {
    test.beforeEach(async ({page}) => {
        // Use the user's running dev instance (5173 + 8000).
        page.setDefaultTimeout(10000)
    })

    test("01 Articles dashboard - state with 198 articles", async ({page}) => {
        await page.goto("http://localhost:5173/articles", {
            waitUntil: "domcontentloaded",
        })
        // Wait for the article grid to render at least one card.
        await page.waitForSelector('[data-testid^="article-bulk-check-"]', {
            timeout: 10000,
        })
        await snap(page, "01-articles-dashboard")

        // Inventory: count visible articles + check for known features.
        const articleCount = await page
            .locator('[data-testid^="article-bulk-check-"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`Articles visible: ${articleCount}`)

        const hasSelectAll = await page
            .locator('[data-testid="article-select-all"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`Select-all affordance: ${hasSelectAll}`)

        const hasTrashToggle = await page
            .locator('[data-testid="article-list-trash-toggle"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`Trash toggle: ${hasTrashToggle}`)
    })

    test("02 ArticleEditor - open first article", async ({page}) => {
        await page.goto("http://localhost:5173/articles", {
            waitUntil: "domcontentloaded",
        })
        await page.waitForSelector('[data-testid^="article-bulk-check-"]', {
            timeout: 10000,
        })

        // Click the FIRST article's title to open the editor.
        // Find the first checkbox testid; the matching link is its parent card.
        const firstCheckbox = page
            .locator('[data-testid^="article-bulk-check-"]')
            .first()
        const id = await firstCheckbox.getAttribute("data-testid")
        const articleId = id?.replace("article-bulk-check-", "") || ""
        // eslint-disable-next-line no-console
        console.log(`First article id: ${articleId}`)

        await page.goto(`http://localhost:5173/articles/${articleId}`, {
            waitUntil: "domcontentloaded",
        })
        // Wait for editor mount.
        await page.waitForSelector(".ProseMirror", {timeout: 10000})
        await snap(page, "02-article-editor-loaded")

        // Inventory: sidebar panels, toolbar, save state, kebab menu.
        const hasToolbar = await page
            .locator('[data-testid="editor-toolbar"]')
            .count()
        const hasKebab = await page
            .locator('[data-testid="article-editor-kebab"]')
            .count()
        const hasSidebarPanels = await page
            .locator('[class*="sidebar"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(
            `Toolbar: ${hasToolbar}, Kebab: ${hasKebab}, Sidebar elements: ${hasSidebarPanels}`,
        )

        // Save-state indicator
        const saveBadgeText = await page
            .locator('[class*="save"], [data-testid*="save"]')
            .first()
            .textContent()
            .catch(() => null)
        // eslint-disable-next-line no-console
        console.log(`Save badge text: ${saveBadgeText}`)
    })

    test("03 ArticleEditor - dark mode", async ({page}) => {
        await page.goto("http://localhost:5173/articles", {
            waitUntil: "domcontentloaded",
        })
        await page.waitForSelector('[data-testid^="article-bulk-check-"]')

        // Toggle to dark mode via localStorage (Bibliogon pattern).
        await page.evaluate(() => {
            document.documentElement.setAttribute("data-theme", "dark")
        })

        const firstCheckbox = page
            .locator('[data-testid^="article-bulk-check-"]')
            .first()
        const id = await firstCheckbox.getAttribute("data-testid")
        const articleId = id?.replace("article-bulk-check-", "") || ""

        await page.goto(`http://localhost:5173/articles/${articleId}`)
        await page.waitForSelector(".ProseMirror")
        await page.evaluate(() => {
            document.documentElement.setAttribute("data-theme", "dark")
        })
        await page.waitForTimeout(500)
        await snap(page, "03-article-editor-dark")
    })

    test("04 BookEditor - open first book", async ({page}) => {
        await page.goto("http://localhost:5173/", {
            waitUntil: "domcontentloaded",
        })
        await page.waitForSelector('[data-testid^="book-card-"]', {
            timeout: 10000,
        })
        await snap(page, "04a-books-dashboard")

        // Click first book card to open BookEditor.
        const firstBookCard = page
            .locator('[data-testid^="book-card-"]:not([data-testid*="menu"]):not([data-testid*="bulk"])')
            .first()
        const bookId = (await firstBookCard.getAttribute("data-testid"))?.replace(
            "book-card-",
            "",
        )
        // eslint-disable-next-line no-console
        console.log(`First book id: ${bookId}`)

        await page.goto(`http://localhost:5173/book/${bookId}`, {
            waitUntil: "domcontentloaded",
        })
        await page.waitForSelector(".ProseMirror", {timeout: 15000})
        await snap(page, "04b-book-editor-loaded")

        // Inventory: chapter sidebar, toolbar, metadata panel toggle.
        const hasChapterSidebar = await page
            .locator('[data-testid="chapter-sidebar"]')
            .count()
        const hasMetadataToggle = await page
            .locator('[data-testid="book-metadata-toggle"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(
            `Chapter sidebar: ${hasChapterSidebar}, Metadata toggle: ${hasMetadataToggle}`,
        )
    })

    test("05 Toolbar - copy split-button + chevron dropdown", async ({page}) => {
        await page.goto("http://localhost:5173/articles", {
            waitUntil: "domcontentloaded",
        })
        await page.waitForSelector('[data-testid^="article-bulk-check-"]')
        const firstCheckbox = page
            .locator('[data-testid^="article-bulk-check-"]')
            .first()
        const id = await firstCheckbox.getAttribute("data-testid")
        const articleId = id?.replace("article-bulk-check-", "") || ""

        await page.goto(`http://localhost:5173/articles/${articleId}`)
        await page.waitForSelector(".ProseMirror")

        // Locate the copy split-button.
        const copyButton = page.locator('[data-testid="toolbar-copy-button"]')
        const copyChevron = page.locator('[data-testid="toolbar-copy-chevron"]')
        const visibleCopy = await copyButton.count()
        const visibleChevron = await copyChevron.count()
        // eslint-disable-next-line no-console
        console.log(
            `Copy button: ${visibleCopy}, Copy chevron: ${visibleChevron}`,
        )
        await snap(page, "05a-toolbar-copy-collapsed")

        // Try opening the chevron dropdown.
        if (visibleChevron > 0) {
            await copyChevron.click()
            await page.waitForTimeout(300)
            await snap(page, "05b-toolbar-copy-dropdown-open")
        }
    })
})
