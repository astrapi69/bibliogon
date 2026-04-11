/**
 * Smoke tests for the keywords editor in BookEditor > Metadata > Marketing.
 *
 * Converts the 10-step manual smoke test from
 * ``docs/manual-smoke-tests.md`` section 1 into automated coverage.
 * Pins the behaviors that were flagged there as human-only:
 *
 * - Add via Enter
 * - Inline edit via double-click, Enter commit
 * - Inline edit via double-click, Escape revert
 * - Delete via X button shows undo toast
 * - Undo restores at the original position (not at the end)
 * - Counter turns warning at 8+ keywords
 * - Hard limit of 50 disables the input, delete re-enables
 * - Save + reload persistence via GET /api/books/{id}
 *
 * Uses data-testid selectors exclusively (no class or text lookups)
 * so the spec survives i18n changes and style refactors.
 */

import {test, expect, createBook} from "../fixtures/base";
import type {Page} from "@playwright/test";

const KEYWORDS_API = "http://localhost:8000/api";

/** Walks the Marketing tab: /book/{id}?view=metadata opens the
 * editor directly, then click the marketing tab. */
async function openMarketingTab(page: Page, bookId: string) {
    await page.goto(`/book/${bookId}?view=metadata`);
    await page.getByTestId("metadata-tab-marketing").click();
    await expect(page.getByTestId("keyword-add-input")).toBeVisible();
}

async function addKeyword(page: Page, value: string) {
    const input = page.getByTestId("keyword-add-input");
    await input.fill(value);
    await input.press("Enter");
}

/** Fetches the persisted keyword list straight from the API. Used
 * to verify save + reload without depending on UI rehydration
 * timing. */
async function getPersistedKeywords(bookId: string): Promise<string[]> {
    const res = await fetch(`${KEYWORDS_API}/books/${bookId}`);
    if (!res.ok) throw new Error(`GET book: ${res.status}`);
    const body = await res.json();
    return body.keywords ?? [];
}

test.describe("Keywords editor - add and inline edit", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Keywords Smoke Test");
        bookId = book.id;
    });

    test("adds five keywords via Enter", async ({page}) => {
        await openMarketingTab(page, bookId);

        const keywords = ["science fiction", "dystopia", "climate", "near future", "political"];
        for (const kw of keywords) {
            await addKeyword(page, kw);
        }

        for (let i = 0; i < keywords.length; i++) {
            const chip = page.getByTestId(`keyword-chip-${i}`);
            await expect(chip).toContainText(keywords[i]);
        }
    });

    test("double-click + Enter commits an inline edit", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "alpha");
        await addKeyword(page, "beta");
        await addKeyword(page, "gamma");

        await page.getByTestId("keyword-chip-2").dblclick();
        const editInput = page.getByTestId("keyword-chip-2-edit-input");
        await expect(editInput).toBeVisible();
        await editInput.fill("gamma prime");
        await editInput.press("Enter");

        // Edit mode closed, chip shows the new value
        await expect(page.getByTestId("keyword-chip-2-edit-input")).not.toBeVisible();
        await expect(page.getByTestId("keyword-chip-2")).toContainText("gamma prime");
    });

    test("double-click + Escape reverts the inline edit", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "alpha");
        await addKeyword(page, "beta");

        await page.getByTestId("keyword-chip-1").dblclick();
        const editInput = page.getByTestId("keyword-chip-1-edit-input");
        await editInput.fill("throwaway");
        await editInput.press("Escape");

        await expect(page.getByTestId("keyword-chip-1-edit-input")).not.toBeVisible();
        await expect(page.getByTestId("keyword-chip-1")).toContainText("beta");
    });
});

test.describe("Keywords editor - delete and undo", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Keywords Delete Undo");
        bookId = book.id;
    });

    test("X button removes the keyword", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "alpha");
        await addKeyword(page, "beta");
        await addKeyword(page, "gamma");

        await page.getByTestId("keyword-chip-1-delete").click();

        // Chip at index 2 is gone (list shrunk to 2).
        await expect(page.getByTestId("keyword-chip-2")).not.toBeVisible();
        await expect(page.getByTestId("keyword-chip-0")).toContainText("alpha");
        await expect(page.getByTestId("keyword-chip-1")).toContainText("gamma");
    });

    test("undo toast restores the keyword at its original position", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "alpha");
        await addKeyword(page, "beta");
        await addKeyword(page, "gamma");

        await page.getByTestId("keyword-chip-1-delete").click();

        // Undo button lives in the toast, which is portaled to the
        // body. getByTestId is global so it still finds it.
        const undo = page.getByTestId("keyword-undo-button");
        await expect(undo).toBeVisible();
        await undo.click();

        // Order fully preserved
        await expect(page.getByTestId("keyword-chip-0")).toContainText("alpha");
        await expect(page.getByTestId("keyword-chip-1")).toContainText("beta");
        await expect(page.getByTestId("keyword-chip-2")).toContainText("gamma");
    });
});

test.describe("Keywords editor - soft warning and hard limit", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Keywords Limits");
        bookId = book.id;
    });

    test("counter does not warn at exactly 7 keywords", async ({page}) => {
        await openMarketingTab(page, bookId);
        for (let i = 0; i < 7; i++) {
            await addKeyword(page, `kw${i}`);
        }
        const counter = page.getByTestId("keyword-counter");
        await expect(counter).toHaveAttribute("data-over-recommended", "false");
        await expect(counter).toHaveAttribute("data-at-hard-limit", "false");
    });

    test("counter flips to warning past 7 keywords", async ({page}) => {
        await openMarketingTab(page, bookId);
        for (let i = 0; i < 8; i++) {
            await addKeyword(page, `kw${i}`);
        }
        const counter = page.getByTestId("keyword-counter");
        await expect(counter).toHaveAttribute("data-over-recommended", "true");
        await expect(counter).toHaveAttribute("data-at-hard-limit", "false");
    });

    test("input goes disabled at the hard limit of 50", async ({page}) => {
        await openMarketingTab(page, bookId);
        // 50 is the spec cap. Adding via Enter is the happy path
        // the spec tests. This takes a few seconds but stays well
        // under the 30s test timeout.
        for (let i = 0; i < 50; i++) {
            await addKeyword(page, `kw${i}`);
        }
        const counter = page.getByTestId("keyword-counter");
        await expect(counter).toHaveAttribute("data-at-hard-limit", "true");
        await expect(page.getByTestId("keyword-add-input")).toBeDisabled();
    });

    test("deleting a keyword at the hard limit re-enables the input", async ({page}) => {
        await openMarketingTab(page, bookId);
        for (let i = 0; i < 50; i++) {
            await addKeyword(page, `kw${i}`);
        }
        await expect(page.getByTestId("keyword-add-input")).toBeDisabled();

        await page.getByTestId("keyword-chip-0-delete").click();

        await expect(page.getByTestId("keyword-add-input")).toBeEnabled();
        await expect(page.getByTestId("keyword-counter")).toHaveAttribute(
            "data-at-hard-limit",
            "false",
        );
    });
});

test.describe("Keywords editor - persistence round-trip", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Keywords Persistence");
        bookId = book.id;
    });

    test("Save persists the current keyword list to the backend", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "alpha");
        await addKeyword(page, "beta");
        await addKeyword(page, "gamma");

        await page.getByTestId("metadata-save").click();
        // The save button flips its label to "Speichert..." / "Saving..."
        // during the request; wait until it is back to idle by
        // checking the button is enabled again.
        await expect(page.getByTestId("metadata-save")).toBeEnabled();

        // Verify straight from the API rather than waiting for toast
        // timing.
        const persisted = await getPersistedKeywords(bookId);
        expect(persisted).toEqual(["alpha", "beta", "gamma"]);
    });

    test("Reload after Save rehydrates the same keyword list", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "one");
        await addKeyword(page, "two");
        await addKeyword(page, "three");
        await page.getByTestId("metadata-save").click();
        await expect(page.getByTestId("metadata-save")).toBeEnabled();

        // Reload the page entirely - URL reopens the metadata view
        // via the ?view=metadata query param.
        await page.reload();
        await page.getByTestId("metadata-tab-marketing").click();

        await expect(page.getByTestId("keyword-chip-0")).toContainText("one");
        await expect(page.getByTestId("keyword-chip-1")).toContainText("two");
        await expect(page.getByTestId("keyword-chip-2")).toContainText("three");
    });

    test("Edit then Save persists the modified value, not the original", async ({page}) => {
        await openMarketingTab(page, bookId);
        await addKeyword(page, "original");
        await page.getByTestId("metadata-save").click();
        await expect(page.getByTestId("metadata-save")).toBeEnabled();

        await page.getByTestId("keyword-chip-0").dblclick();
        const editInput = page.getByTestId("keyword-chip-0-edit-input");
        await editInput.fill("edited");
        await editInput.press("Enter");

        await page.getByTestId("metadata-save").click();
        await expect(page.getByTestId("metadata-save")).toBeEnabled();

        const persisted = await getPersistedKeywords(bookId);
        expect(persisted).toEqual(["edited"]);
    });
});
