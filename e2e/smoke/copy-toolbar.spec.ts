/**
 * v0.32.0 F3 E2E smoke: toolbar Copy split-button.
 *
 * Covers the chevron-dropdown interaction layer that happy-dom
 * can't reach reliably (Radix portal + focus-scope):
 *
 *   1. The Copy button + chevron appear in the editor toolbar
 *   2. Clicking the chevron opens a menu with the two items
 *   3. Picking "Copy as plain text" surfaces a success toast
 *
 * Clipboard read-back across the Playwright permission boundary
 * is finicky in CI, so this smoke validates the UX surface (button
 * + menu + toast); the underlying conversion is exhaustively
 * unit-tested in utils/tiptap-markdown.test.ts.
 */

import type {Page} from "@playwright/test";

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

/**
 * Open the Copy split-button's Radix menu, retrying the chevron click.
 *
 * The editor must be mounted first (a mid-hydration click is lost when the
 * toolbar re-renders on editor load). Even after that, under sustained
 * full-suite load the Radix portal occasionally drops the opening click, so
 * re-click until the menu items render - `toPass` retries the whole block.
 */
async function openCopyMenu(page: Page): Promise<void> {
    await expect(page.locator(".ProseMirror")).toBeVisible();
    const markdownItem = page.getByTestId("toolbar-copy-markdown-item");
    await expect(async () => {
        // Click the chevron only when the menu is not already open. The
        // chevron TOGGLES the Radix menu, so a blind re-click on retry could
        // close an already-open menu and leave it shut when this helper
        // returns. Guarding on visibility makes the retry idempotent
        // (open-or-stay-open, never open-then-close).
        if (!(await markdownItem.isVisible())) {
            await page.getByTestId("toolbar-copy-chevron").click();
        }
        await expect(markdownItem).toBeVisible({timeout: 1500});
    }).toPass({timeout: 15000});
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

test.describe("Toolbar Copy split-button (F3)", () => {
    test("Copy button + chevron render in the article editor toolbar", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Copy smoke article",
        });
        await page.goto(`/articles/${article.id}`);

        await expect(page.getByTestId("toolbar-copy-markdown")).toBeVisible();
        await expect(page.getByTestId("toolbar-copy-chevron")).toBeVisible();
    });

    test("chevron opens a menu with Markdown + plain-text items", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Copy menu article",
        });
        await page.goto(`/articles/${article.id}`);

        await openCopyMenu(page);

        await expect(
            page.getByTestId("toolbar-copy-markdown-item"),
        ).toBeVisible();
        await expect(
            page.getByTestId("toolbar-copy-plain-item"),
        ).toBeVisible();
    });

    test("picking 'Copy as plain text' shows a success toast", async ({page, context}) => {
        // Clipboard write needs an explicit permission grant in
        // Chromium; granting it before the action so the toast path
        // exercises the success branch.
        await context.grantPermissions(["clipboard-write"]);

        const article = await postJson<{id: string}>("/articles", {
            title: "Copy plain-text article",
        });
        await page.goto(`/articles/${article.id}`);

        await openCopyMenu(page);
        await page.getByTestId("toolbar-copy-plain-item").click();

        // react-toastify renders the toast outside the main app tree;
        // match on the toast container role + the i18n fallback.
        await expect(page.getByText(/Copied as plain text/i)).toBeVisible({
            timeout: 5000,
        });
    });
});
