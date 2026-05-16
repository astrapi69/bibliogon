/**
 * Bug 6 regression pin: kebab menu must close BEFORE the dialog
 * opens, never linger behind/around it.
 *
 * The bug was caused by ``e.preventDefault()`` inside Radix
 * DropdownMenu.Item's ``onSelect`` handler, which suppressed
 * Radix's default close-on-select. Fix (commit 02fc66b) removed
 * the preventDefault from every menu-item that triggers a dialog.
 *
 * Two surfaces pinned here:
 *  1. ArticleCard's "Endgültig löschen" → AppDialog confirm.
 *  2. BookCard's "Endgültig löschen" → AppDialog confirm.
 *
 * The other affected surfaces (BookListView, ArticleEditor
 * reclassify, Toolbar copy items, Dashboard theme toggle) follow
 * the same Radix pattern; pinning the two card variants is the
 * minimum to catch a regression in the family. If a future
 * surface diverges, add a sibling test here.
 *
 * The Vitest layer's Radix DropdownMenu + happy-dom limitation
 * (per the established lessons-learned rule) is why this lives
 * in E2E rather than as a unit pin.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

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

test.describe("Bug 6: menu auto-closes before dialog opens", () => {
    test("ArticleCard kebab: permanent-delete closes menu before AppDialog", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Menu-close regression target",
            author: "Asterios",
        });

        await page.goto("/articles");
        // The Permanent-Delete menu item only renders when the parent
        // passes the onDeletePermanent prop, which the live list does
        // (ArticleList.tsx:932). Trigger the menu via the live card's
        // kebab; the menu surface is the same shape regardless of
        // trash vs live (per ArticleCard.tsx's single DropdownMenu).
        const kebab = page.getByTestId(`article-card-menu-${article.id}`);
        await expect(kebab).toBeVisible({timeout: 5000});
        await kebab.click();

        const permanentItem = page.getByTestId(
            `article-card-menu-delete-permanent-${article.id}`,
        );
        await expect(permanentItem).toBeVisible({timeout: 3000});
        await permanentItem.click();

        // AppDialog confirm appears.
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({timeout: 3000});

        // CRITICAL Bug 6 assertion: the menu's CONTENT must be gone.
        await expect(permanentItem).not.toBeVisible({timeout: 3000});

        // Cancel out so the test fixture stays clean.
        await dialog
            .getByRole("button", {name: /Abbrechen|Cancel/i})
            .click()
            .catch(() => page.keyboard.press("Escape"));
    });

    test("BookCard kebab: move-to-trash closes menu cleanly", async ({page}) => {
        const book = await postJson<{id: string}>("/books", {
            title: "Menu-close regression book",
            author: "Asterios",
        });

        await page.goto("/");
        const card = page.getByTestId(`book-card-${book.id}`);
        await expect(card).toBeVisible({timeout: 5000});

        // Open the kebab menu.
        await page.getByTestId(`book-card-menu-${book.id}`).click();

        // The menu's items are now visible.
        const trashItem = page.getByTestId(`book-card-menu-delete-${book.id}`);
        await expect(trashItem).toBeVisible({timeout: 3000});

        // Click "In den Papierkorb" → triggers an AppDialog confirm
        // (Dashboard.handleDelete).
        await trashItem.click();

        // The AppDialog confirm appears.
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({timeout: 3000});

        // CRITICAL Bug 6 assertion: the menu's CONTENT must be gone.
        // Before commit 02fc66b, the menu lingered alongside the
        // dialog. Now Radix auto-closes the menu on item-select.
        await expect(trashItem).not.toBeVisible({timeout: 3000});

        // Cancel out of the confirm to leave the test fixture clean.
        await dialog
            .getByRole("button", {name: /Abbrechen|Cancel/i})
            .click()
            .catch(() => {
                // Some AppDialog variants close via Escape instead.
                return page.keyboard.press("Escape");
            });
    });

    test("ArticleEditor reclassify menu: menu closes before confirm dialog", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Reclassify-menu regression target",
            author: "Asterios",
        });
        await page.goto(`/articles/${article.id}`);

        await expect(page.getByTestId("article-editor-actions-menu")).toBeVisible({
            timeout: 5000,
        });
        await page.getByTestId("article-editor-actions-menu").click();

        const reclassifyItem = page.getByTestId("article-editor-menu-reclassify");
        await expect(reclassifyItem).toBeVisible({timeout: 3000});
        await reclassifyItem.click();

        // AppDialog confirm appears.
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({timeout: 3000});

        // Menu item must be gone (auto-closed).
        await expect(reclassifyItem).not.toBeVisible({timeout: 3000});

        // Cancel out.
        await dialog
            .getByRole("button", {name: /Abbrechen|Cancel/i})
            .click()
            .catch(() => page.keyboard.press("Escape"));
    });
});
