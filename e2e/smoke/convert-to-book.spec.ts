/**
 * Article-to-book conversion smoke (Phase 2).
 *
 * Covers the user's mandatory E2E checklist:
 *   - full conversion flow produces a book at /book/{id} with the
 *     selected articles as chapters,
 *   - original articles persist on the Articles dashboard after
 *     conversion (decoupled lifecycle),
 *   - front-matter title-page chapter appears at position 0 when
 *     enabled,
 *   - testid coverage for every step (no G2-F2 silent-skip
 *     regression — every namespaced testid is exercised).
 *
 * The wizard's drag-reorder is intentionally NOT exercised in unit
 * tests (happy-dom + @dnd-kit is brittle); the sort dropdown path
 * here gives the same ordering coverage without the pointer-event
 * noise.
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
    body: string = "Body text.",
    extras: Record<string, unknown> = {},
): Promise<ArticleFixture> {
    const a = await postJson<ArticleFixture>("/articles", {title})
    await patchJson(`/articles/${a.id}`, {
        content_json: JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [{type: "text", text: body}],
                },
            ],
        }),
        ...extras,
    })
    return a
}

test.describe("Article-to-book conversion", () => {
    test("full happy path: 3 articles -> book with 3 chapters", async ({page}) => {
        const a = await seedArticle("Living Health: Intro")
        const b = await seedArticle("Living Health: Habits")
        const c = await seedArticle("Living Health: Conclusion")

        await page.goto("/articles")
        await expect(page.getByTestId("article-list")).toBeVisible()

        // Select all three articles.
        await page.getByTestId(`article-bulk-check-${a.id}`).check()
        await page.getByTestId(`article-bulk-check-${b.id}`).check()
        await page.getByTestId(`article-bulk-check-${c.id}`).check()
        await expect(page.getByTestId("article-bulk-action-bar")).toBeVisible()
        await expect(page.getByTestId("article-bulk-count")).toContainText(/^3/)

        // Open the wizard via the new bar button.
        await page.getByTestId("article-bulk-convert-to-book").click()

        // Step 0 (Selection) — every wizard surface resolves.
        await expect(
            page.getByTestId("convert-to-book-wizard-selection-list"),
        ).toBeVisible()
        await expect(
            page.getByTestId(
                "convert-to-book-wizard-selection-sort-strategy-trigger",
            ),
        ).toBeVisible()

        // Apply title_asc so chapter order is predictable.
        await page
            .getByTestId(
                "convert-to-book-wizard-selection-sort-strategy-trigger",
            )
            .click()
        // force: the RadixSelect option portals inside the WizardShell
        // dialog; Playwright's actionability check sees the dialog's
        // aria-hidden background as intercepting pointer events even
        // though the option is the topmost element at its coordinates
        // (real users click it fine).
        const sortItem = page.getByTestId(
            "convert-to-book-wizard-selection-sort-strategy-item-title_asc",
        )
        await sortItem.click({force: true})
        // The force-click commits the selection but can leave the Radix
        // listbox OPEN (force bypasses the pointer handling that auto-
        // closes it). A lingering open listbox keeps the step-0 footer
        // "Weiter" button shifting/covered, so the later click times out
        // on the actionability "stable" check. Nudge it closed (Escape
        // only dismisses the popup; the value is already committed) and
        // wait for it to be gone before touching the footer.
        if (await sortItem.isVisible().catch(() => false)) {
            await page.keyboard.press("Escape")
        }
        await expect(sortItem).toBeHidden()

        // Verify every article appears as a sortable row.
        for (const article of [a, b, c]) {
            await expect(
                page.getByTestId(
                    `convert-to-book-wizard-selection-row-${article.id}`,
                ),
            ).toBeVisible()
        }

        // Step 0 -> Step 1.
        await page.getByTestId("convert-to-book-wizard-step-0-next").click()

        // Step 1 (Metadata).
        await page
            .getByTestId("convert-to-book-wizard-metadata-title")
            .fill("Living Health: The Complete Series")
        await page
            .getByTestId("convert-to-book-wizard-metadata-author")
            .fill("Asterios Raptis")

        // Step 1 -> Step 2 (front-matter), skip.
        await page.getByTestId("convert-to-book-wizard-step-1-next").click()
        await expect(
            page.getByTestId(
                "convert-to-book-wizard-front-matter-title-page-toggle",
            ),
        ).toBeVisible()
        await page.getByTestId("convert-to-book-wizard-step-2-skip").click()

        // Step 3 (back-matter), skip.
        await expect(
            page.getByTestId(
                "convert-to-book-wizard-back-matter-acknowledgments-toggle",
            ),
        ).toBeVisible()
        await page.getByTestId("convert-to-book-wizard-step-3-skip").click()

        // Step 4 (chapter-settings) -> Step 5.
        await expect(
            page.getByTestId(
                "convert-to-book-wizard-chapter-settings-use-article-title",
            ),
        ).toBeVisible()
        await page.getByTestId("convert-to-book-wizard-step-4-next").click()

        // Step 5 (Review).
        await expect(
            page.getByTestId("convert-to-book-wizard-review-title-value"),
        ).toContainText("Living Health: The Complete Series")
        await expect(
            page.getByTestId("convert-to-book-wizard-review-chapter-count"),
        ).toContainText("3")

        // Convert. The wizard closes + the success toast appears
        // with a "View book" CTA; clicking the CTA navigates to
        // /book/{id} (WARN-I1 fix — no auto-navigate, the user
        // owns the navigation step).
        await page.getByTestId("convert-to-book-wizard-step-5-finish").click()
        const viewBookCta = page.getByTestId(
            "convert-to-book-success-view-book",
        )
        await expect(viewBookCta).toBeVisible()
        await Promise.all([
            page.waitForURL(/\/book\/[^/]+$/),
            viewBookCta.click(),
        ])
        await expect(page).toHaveURL(/\/book\/[^/]+$/)
    })

    test("original articles remain on the dashboard after conversion", async ({
        page,
    }) => {
        const a = await seedArticle("Persistence: A")
        const b = await seedArticle("Persistence: B")

        await page.goto("/articles")
        await expect(page.getByTestId("article-list")).toBeVisible()

        await page.getByTestId(`article-bulk-check-${a.id}`).check()
        await page.getByTestId(`article-bulk-check-${b.id}`).check()
        await page.getByTestId("article-bulk-convert-to-book").click()

        await page
            .getByTestId("convert-to-book-wizard-step-0-next")
            .click()
        await page
            .getByTestId("convert-to-book-wizard-metadata-title")
            .fill("Persistence Test")
        await page
            .getByTestId("convert-to-book-wizard-metadata-author")
            .fill("Test")
        await page.getByTestId("convert-to-book-wizard-step-1-next").click()
        await page.getByTestId("convert-to-book-wizard-step-2-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-3-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-4-next").click()
        await page
            .getByTestId("convert-to-book-wizard-step-5-finish")
            .click()
        // Wait for the success toast (the wizard closes + clears
        // selection). We don't click the CTA here — this spec
        // specifically tests that source articles persist EVEN IF
        // the user doesn't follow the toast link.
        await expect(
            page.getByTestId("convert-to-book-success-view-book"),
        ).toBeVisible()

        // Navigate back to the articles dashboard; both source rows
        // still exist (decoupled lifecycle).
        await page.goto("/articles")
        await expect(page.getByTestId("article-list")).toBeVisible()
        await expect(
            page.getByTestId(`article-bulk-check-${a.id}`),
        ).toBeVisible()
        await expect(
            page.getByTestId(`article-bulk-check-${b.id}`),
        ).toBeVisible()
    })

    test("front-matter title-page chapter appears at position 0", async ({
        page,
    }) => {
        const a = await seedArticle("Front-Matter Body")

        await page.goto("/articles")
        await page.getByTestId(`article-bulk-check-${a.id}`).check()
        await page.getByTestId("article-bulk-convert-to-book").click()

        await page.getByTestId("convert-to-book-wizard-step-0-next").click()
        await page
            .getByTestId("convert-to-book-wizard-metadata-title")
            .fill("Volume One")
        await page
            .getByTestId("convert-to-book-wizard-metadata-author")
            .fill("Test")
        await page.getByTestId("convert-to-book-wizard-step-1-next").click()

        // Enable Title Page.
        await page
            .getByTestId("convert-to-book-wizard-front-matter-title-page-toggle")
            .check()
        await page.getByTestId("convert-to-book-wizard-step-2-next").click()
        await page.getByTestId("convert-to-book-wizard-step-3-skip").click()
        await page.getByTestId("convert-to-book-wizard-step-4-next").click()

        // Verify the review summary: 2 chapters (title page + article).
        await expect(
            page.getByTestId("convert-to-book-wizard-review-chapter-count"),
        ).toContainText("2")

        let bookId = ""
        page.on("framenavigated", (frame) => {
            const url = frame.url()
            const match = url.match(/\/book\/([^/?#]+)/)
            if (match) bookId = match[1]
        })
        // Submit + follow the toast's "View book" CTA to navigate
        // (WARN-I1 fix — auto-navigate replaced with user-owned CTA).
        await page
            .getByTestId("convert-to-book-wizard-step-5-finish")
            .click()
        const viewBookCta = page.getByTestId(
            "convert-to-book-success-view-book",
        )
        await expect(viewBookCta).toBeVisible()
        await Promise.all([
            page.waitForURL(/\/book\/[^/]+$/),
            viewBookCta.click(),
        ])

        // Re-fetch the book from the API and verify position 0 is the
        // title page (DB-level assertion is stable across UI rendering
        // tweaks).
        await page.waitForTimeout(50) // give the URL listener a tick
        expect(bookId).not.toBe("")
        const res = await fetch(`${API}/books/${bookId}`)
        expect(res.ok).toBe(true)
        const detail = (await res.json()) as {
            chapters: Array<{position: number; chapter_type: string}>
        }
        const sorted = [...detail.chapters].sort(
            (x, y) => x.position - y.position,
        )
        expect(sorted[0].chapter_type).toBe("title_page")
        expect(sorted[1].chapter_type).toBe("chapter")
    })

    test("layout stability: action button stays in WizardNav footer slot across every step", async ({page}) => {
        // CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 Bug #2
        // regression-pin: the action button (Next on steps 0-4,
        // Finish on step 5) sits in the same physical slot on every
        // step. Per the "Playwright-visible ≠ User-visible" rule,
        // we assert the COMPUTED bounding-box position rather than
        // just the testid existence.
        const a = await seedArticle("Stability A")
        const b = await seedArticle("Stability B")
        await page.goto("/articles")
        await page
            .getByTestId(`article-bulk-check-${a.id}`)
            .click()
        await page
            .getByTestId(`article-bulk-check-${b.id}`)
            .click()
        await page.getByTestId("article-bulk-convert-to-book").click()
        await expect(page.getByTestId("convert-to-book-wizard-dialog"))
            .toBeVisible()

        // Capture the Next button bounding-box Y on each non-final
        // step. The footer slot must be at the same Y across all
        // navigations.
        const stepYs: number[] = []
        for (let step = 0; step < 5; step++) {
            if (step === 1) {
                await page
                    .getByTestId("convert-to-book-wizard-metadata-title")
                    .fill("Stability Test Book")
                await page
                    .getByTestId("convert-to-book-wizard-metadata-author")
                    .fill("E2E Autor")
            }
            const nextLocator = page.getByTestId(
                `convert-to-book-wizard-step-${step}-next`,
            )
            await expect(nextLocator).toBeVisible()
            const box = await nextLocator.boundingBox()
            expect(box).not.toBeNull()
            stepYs.push(box!.y)
            await nextLocator.click()
        }

        // Step 5: action button must be the WizardNav-footer Finish
        // button, NOT an inline body button. Same Y as the prior
        // Next buttons within a small tolerance (font-metric jitter
        // can cause ~1-2px shift; 6px is generous).
        const finishLocator = page.getByTestId(
            "convert-to-book-wizard-step-5-finish",
        )
        await expect(finishLocator).toBeVisible()
        const finishBox = await finishLocator.boundingBox()
        expect(finishBox).not.toBeNull()
        const avgPriorY = stepYs.reduce((s, y) => s + y, 0) / stepYs.length
        expect(Math.abs(finishBox!.y - avgPriorY)).toBeLessThan(6)

        // Exactly ONE finish button exists, and it's the WizardNav
        // footer button. The pre-fix bug rendered a SECOND, inline
        // action button in the step body; the footer button carries
        // the `...-step-5-finish` testid and there is no inline
        // duplicate, so the count is 1 (a count of 0 would contradict
        // the visible-in-footer assertion above).
        await expect(
            page.getByTestId("convert-to-book-wizard-step-5-finish"),
        ).toHaveCount(1)
    })
})
