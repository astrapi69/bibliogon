/**
 * Shared UI interaction helpers for E2E smoke specs.
 */

import {expect, type Page} from "@playwright/test";

/**
 * Suppress the one-time onboarding dialogs (donation + AI-setup wizard)
 * whose Radix overlays auto-open on a fresh data dir and intercept
 * subsequent clicks (#441). Mirrors the baseline-normalisation the shared
 * `resetDatabase` fixture applies, for specs that bypass that fixture.
 *
 * Must be called BEFORE the first navigation in the test (registers an
 * init script that runs on every page load in the context).
 */
export async function suppressOnboarding(page: Page): Promise<void> {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
        } catch {
            // localStorage unavailable (privacy mode); ignore.
        }
    });
}

/**
 * Robustly soft-delete an article via its grid-card kebab menu.
 *
 * Waits for the list to settle (networkidle), then retries the
 * open-menu -> click-delete sequence inside an expect().toPass()
 * loop. Under full-suite load a late per-card re-render can detach
 * the open menu's delete item mid-click ("element detached from the
 * DOM") — the kebab re-render race that made several trash/selection
 * specs flaky. Pattern extracted from articles-trash.spec.ts (the
 * canonical green soft-delete flow).
 *
 * Article soft-delete (move-to-trash) does NOT show a confirm dialog
 * (ArticleList.handleDelete deletes immediately), so this helper
 * completes the deletion in one shot. For permanent-delete (which
 * does confirm), drive the menu directly in the spec.
 */
export async function softDeleteArticleViaKebab(
    page: Page,
    articleId: string,
): Promise<void> {
    await page.waitForLoadState("networkidle");
    await expect(async () => {
        await page.getByTestId(`article-card-menu-${articleId}`).click();
        const del = page.getByTestId(`article-card-menu-delete-${articleId}`);
        await expect(del).toBeVisible({timeout: 2000});
        await del.click({timeout: 2000});
    }).toPass({timeout: 15_000});
}

/**
 * Robustly soft-delete a book via its grid-card kebab menu. Same
 * race-robustness rationale as softDeleteArticleViaKebab. Book
 * soft-delete (move-to-trash) also does NOT confirm
 * (Dashboard.handleDelete deletes immediately).
 */
export async function softDeleteBookViaKebab(
    page: Page,
    bookId: string,
): Promise<void> {
    await page.waitForLoadState("networkidle");
    await expect(async () => {
        await page.getByTestId(`book-card-menu-${bookId}`).click();
        const del = page.getByTestId(`book-card-menu-delete-${bookId}`);
        await expect(del).toBeVisible({timeout: 2000});
        await del.click({timeout: 2000});
    }).toPass({timeout: 15_000});
}

/**
 * Click a dropdown menu trigger or item robustly: wait for it to be
 * visible (i.e. the Radix open-animation has settled and the node is
 * rendered) before clicking. Playwright's click then auto-waits for
 * stable+enabled+receives-events. Replaces bare
 * `getByTestId(...).click()` on menu surfaces, which raced against the
 * open-animation and a late re-render — the trash / book-editor-menu
 * flake class (#522, #524).
 *
 * For the grid-kebab case where the OPEN menu's item can DETACH
 * mid-click under full-suite load, use the stronger
 * `softDelete*ViaKebab` toPass loop above, which re-opens the menu on
 * each attempt.
 */
export async function clickMenuItem(page: Page, testId: string): Promise<void> {
    const item = page.getByTestId(testId);
    await expect(item).toBeVisible({timeout: 5000});
    await item.click();
}
