/**
 * UX-Full-Audit Surface Group 3: Settings walkthrough.
 *
 * Surfaces: 7 Settings tabs (app / ai / author / topics / plugins
 * / comments / support), AI provider panel, plugin enable/disable
 * flow, theme switcher.
 *
 * Testid pre-inspection findings (before this spec runs):
 *
 * - `app`, `author`, `plugins` tab triggers LACK `testId` property
 *   in the tabs-definition array (Settings.tsx:109-115). Only `ai`,
 *   `topics`, `comments`, `support` have explicit testIds.
 *
 * - Plugin tab content has NO `plugin-toggle` / `plugin-row` /
 *   `plugin-enable` testids in production code (grep returns
 *   empty).
 *
 * - AI tab has `ai-api-key-input` + `ai-api-key-external-note`.
 *
 * - Topics tab has `topic-row-{i}`, `topic-add-input`,
 *   `topic-add-btn`, `topic-remove-{i}`, `topics-save-btn`.
 *
 * - App tab has `settings-allow-books-without-author`.
 */

import {test} from "@playwright/test"
import * as path from "node:path"

const SCREENSHOT_DIR = path.resolve(
    __dirname,
    "../../docs/audits/ux-full-audit-2026-05-14-screenshots",
)

async function snap(page: import("@playwright/test").Page, name: string) {
    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `group3-${name}.png`),
        fullPage: true,
    })
}

test.describe("UX-Audit Group 3: Settings", () => {
    test.beforeEach(async ({page}) => {
        page.setDefaultTimeout(10000)
    })

    test("01 Settings page - default tab + tab inventory", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForTimeout(500)
        await snap(page, "01-settings-default")

        // Per Settings.tsx:109-115, 7 tabs (4 with testIds, 3 without)
        const tabTestids = [
            "settings-tab-ai",
            "settings-tab-topics",
            "settings-tab-comments",
            "settings-tab-support",
        ]
        for (const t of tabTestids) {
            const n = await page.locator(`[data-testid="${t}"]`).count()
            // eslint-disable-next-line no-console
            console.log(`  ${t}: ${n}`)
        }

        // SETT-PHASE-2 removed the "Allgemein" catch-all tab and
        // split it into Erscheinungsbild / Verhalten / Erweitert
        // (each with its own testid). Author + Plugins tabs still
        // lack testIds; count their labels instead.
        const labels = ["Autor", "Plugins"]
        for (const l of labels) {
            const n = await page
                .locator(`button:has-text("${l}")`)
                .count()
            // eslint-disable-next-line no-console
            console.log(`  label="${l}": ${n}`)
        }

        // Mobile tabs menu trigger
        const mobileTrigger = await page
            .locator('[data-testid="settings-tabs-mobile-trigger"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`mobile-tabs-trigger: ${mobileTrigger}`)
    })

    test("02 Tab: verhalten (was: app/general)", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForTimeout(500)

        // SETT-PHASE-2 moved settings-allow-books-without-author
        // into the Verhalten tab.
        await page.getByTestId("settings-tab-verhalten").click()
        await page.waitForTimeout(500)
        await snap(page, "02a-tab-verhalten")

        const allowBooksWithoutAuthor = await page
            .locator('[data-testid="settings-allow-books-without-author"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`settings-allow-books-without-author: ${allowBooksWithoutAuthor}`)

        // Theme toggle should be reachable from the page chrome
        const themeToggle = await page
            .locator('[data-testid="theme-toggle"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`theme-toggle reachable: ${themeToggle}`)
    })

    test("03 Tab: ai (KI-Assistent)", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForSelector('[data-testid="settings-tab-ai"]')
        await page.getByTestId("settings-tab-ai").click()
        await page.waitForTimeout(500)
        await snap(page, "03a-tab-ai")

        const aiApiKey = await page
            .locator('[data-testid="ai-api-key-input"]')
            .count()
        const aiNote = await page
            .locator('[data-testid="ai-api-key-external-note"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`ai-api-key-input: ${aiApiKey}, ai-api-key-external-note: ${aiNote}`)
    })

    test("04 Tab: author", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForTimeout(500)
        await page.locator('button:has-text("Autor")').first().click()
        await page.waitForTimeout(500)
        await snap(page, "04-tab-author")

        // What testids does the author tab have?
        const allTestidsOnPage = await page
            .evaluate(() =>
                Array.from(document.querySelectorAll("[data-testid]"))
                    .map((el) => el.getAttribute("data-testid"))
                    .filter((t) => t && (t.includes("author") || t.includes("biography")))
            )
        // eslint-disable-next-line no-console
        console.log(`Author tab testids: ${JSON.stringify(allTestidsOnPage)}`)
    })

    test("05 Tab: topics", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForSelector('[data-testid="settings-tab-topics"]')
        await page.getByTestId("settings-tab-topics").click()
        await page.waitForTimeout(500)
        await snap(page, "05-tab-topics")

        const topicRows = await page
            .locator('[data-testid^="topic-row-"]')
            .count()
        const addInput = await page
            .locator('[data-testid="topic-add-input"]')
            .count()
        const addBtn = await page
            .locator('[data-testid="topic-add-btn"]')
            .count()
        const saveBtn = await page
            .locator('[data-testid="topics-save-btn"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(
            `topics: rows=${topicRows} add-input=${addInput} add-btn=${addBtn} save-btn=${saveBtn}`,
        )
    })

    test("06 Tab: plugins", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForTimeout(500)
        await page.locator('button:has-text("Plugins")').first().click()
        await page.waitForTimeout(800)
        await snap(page, "06-tab-plugins")

        // What testids does the plugins tab actually surface?
        const pluginRelatedIds = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-testid]"))
                .map((el) => el.getAttribute("data-testid"))
                .filter((t) => t && t.toLowerCase().includes("plugin"))
        )
        // eslint-disable-next-line no-console
        console.log(`Plugin tab testids: ${JSON.stringify(pluginRelatedIds)}`)

        // Count likely affordances even without testids: rows + checkboxes.
        const rowCount = await page
            .locator('input[type="checkbox"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`checkboxes on plugin tab: ${rowCount}`)
    })

    test("07 Tab: comments", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForSelector('[data-testid="settings-tab-comments"]')
        await page.getByTestId("settings-tab-comments").click()
        await page.waitForTimeout(500)
        await snap(page, "07-tab-comments")

        const adminSection = await page
            .locator('[data-testid="comments-admin-section"]')
            .count()
        const filters = await page
            .locator('[data-testid="comments-admin-filters"]')
            .count()
        const rows = await page
            .locator('[data-testid^="comments-admin-row-"]:not([data-testid*="orphan"])')
            .count()
        // eslint-disable-next-line no-console
        console.log(
            `comments: section=${adminSection} filters=${filters} rows=${rows}`,
        )
    })

    test("08 Tab: support (conditional)", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForTimeout(500)
        const supportTab = await page
            .locator('[data-testid="settings-tab-support"]')
            .count()
        // eslint-disable-next-line no-console
        console.log(`settings-tab-support visible: ${supportTab}`)
        if (supportTab > 0) {
            await page.getByTestId("settings-tab-support").click()
            await page.waitForTimeout(500)
            await snap(page, "08-tab-support")
        } else {
            // eslint-disable-next-line no-console
            console.log("Support tab not currently rendered (donations toggle off?)")
        }
    })

    test("09 Theme switcher behaviour", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForSelector('[data-testid="theme-toggle"]')
        // Before
        const before = await page.evaluate(() =>
            document.documentElement.getAttribute("data-theme"),
        )
        // eslint-disable-next-line no-console
        console.log(`Theme before toggle: ${before}`)
        await snap(page, "09a-settings-theme-before")

        await page.getByTestId("theme-toggle").click()
        await page.waitForTimeout(300)
        const after = await page.evaluate(() =>
            document.documentElement.getAttribute("data-theme"),
        )
        // eslint-disable-next-line no-console
        console.log(`Theme after toggle: ${after}`)
        await snap(page, "09b-settings-theme-after")

        // Restore the original theme so other specs don't inherit.
        if (after !== before) {
            await page.getByTestId("theme-toggle").click()
        }
    })

    test("10 Keyboard navigation: Tab through Settings page", async ({page}) => {
        await page.goto("http://localhost:5173/settings")
        await page.waitForTimeout(500)

        // Tab through and capture the focus chain (first 12 stops).
        const focusChain: string[] = []
        for (let i = 0; i < 12; i++) {
            await page.keyboard.press("Tab")
            const focused = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                if (!el) return "<null>"
                const testid = el.getAttribute("data-testid")
                const tag = el.tagName.toLowerCase()
                const text = (el.textContent || "").trim().slice(0, 30)
                return `${tag}${testid ? "[" + testid + "]" : ""}${text ? " '" + text + "'" : ""}`
            })
            focusChain.push(focused)
        }
        // eslint-disable-next-line no-console
        console.log(`Focus chain: ${JSON.stringify(focusChain, null, 2)}`)
    })
})
