/**
 * UNIVERSAL-AI-TEMPLATE-02 Session 2 smoke: covers the external
 * YAML round-trip workflow (Workflow C) end-to-end on the
 * Article side.
 *
 * No LLM required - this spec exercises:
 *   1. AI Template panel renders in the article editor sidebar
 *      with all three first-class buttons.
 *   2. "Export template" triggers a .biblio.yaml download.
 *   3. "Import filled template" opens a dialog containing the
 *      drop zone + force toggle.
 *   4. New-from-template button on the Articles dashboard opens
 *      the two-step (download empty / upload filled) dialog.
 *   5. Bulk action bar exposes the AI dropdown trigger (the
 *      menu's open gesture requires pointer events that
 *      happy-dom doesn't reproduce, so the unit test pins the
 *      prop-threading invariant; here we just verify the
 *      trigger is reachable in the live UI).
 *
 * Workflows A (built-in AI) and B (custom endpoint) need a
 * real or mocked LLM endpoint and live in separate suites
 * once the test infrastructure carries the right route mocks
 * across sessions; this smoke is intentionally LLM-free.
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

test.describe("AI-template Workflow C (external YAML round-trip)", () => {
    test("article editor sidebar mounts the AI Template panel with three buttons", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "AI Template Sidebar Smoke",
        });
        await page.goto(`/articles/${article.id}`);

        await expect(page.getByTestId("article-editor-sidebar")).toBeVisible();
        const panel = page.getByTestId("ai-template-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("ai-template-fill")).toBeVisible();
        await expect(panel.getByTestId("ai-template-export")).toBeVisible();
        await expect(panel.getByTestId("ai-template-import")).toBeVisible();
        // The panel's data-kind attribute reflects the article variant.
        await expect(panel).toHaveAttribute("data-kind", "article");
    });

    test("Export template downloads a .biblio.yaml", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Export AI Template",
        });
        await page.goto(`/articles/${article.id}`);

        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("ai-template-export").click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.biblio\.yaml$/);
    });

    test("Import filled template opens a dialog with the drop zone", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Import AI Template",
        });
        await page.goto(`/articles/${article.id}`);

        // Idempotent open: click the trigger only while the dialog isn't
        // shown, retrying via toPass. Under sustained full-suite load the
        // Radix dialog occasionally drops the opening click; a blind single
        // click + assert then fails both attempts and reds the run. Guarding
        // on the dialog's visibility makes the open retry-safe.
        const importDialog = page.getByTestId("ai-template-import-dialog");
        await expect(async () => {
            if (!(await importDialog.isVisible())) {
                await page.getByTestId("ai-template-import").click();
            }
            await expect(importDialog).toBeVisible({timeout: 1500});
        }).toPass({timeout: 15000});
        await expect(page.getByTestId("template-import-dropzone")).toBeVisible();
        await expect(page.getByTestId("ai-template-import-force")).toBeVisible();
        await expect(
            page.getByTestId("ai-template-import-submit"),
        ).toBeDisabled();
    });

    test("Articles dashboard exposes the New from template button", async ({page}) => {
        await page.goto("/articles");

        await expect(
            page.getByTestId("article-list-new-from-template"),
        ).toBeVisible();
        await page.getByTestId("article-list-new-from-template").click();
        await expect(
            page.getByTestId("new-from-template-dialog"),
        ).toBeVisible();
        // Two-step dialog: language picker + download button + drop zone.
        await expect(
            page.getByTestId("new-from-template-language-trigger"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-from-template-download"),
        ).toBeVisible();
        await expect(
            page.getByTestId("template-import-dropzone"),
        ).toBeVisible();
    });

    test("Articles bulk-action bar exposes the AI dropdown when 1+ selected", async ({page}) => {
        // Seed at least two articles so the bulk bar has something to
        // chew on. The selection model is filter-aware; the action
        // bar appears once a checkbox is ticked.
        const a1 = await postJson<{id: string}>("/articles", {
            title: "Bulk AI A",
        });
        const a2 = await postJson<{id: string}>("/articles", {
            title: "Bulk AI B",
        });

        await page.goto("/articles");
        // Per-card selection checkbox testid is article-bulk-check-{id}
        // (see frontend/src/pages/ArticleList.tsx). Earlier comment
        // here said "article-select-" which was a typo — the
        // bulk-delete commit actually shipped article-bulk-check-.
        // The sibling article-bulk-export.spec.ts has used the
        // correct testid since the bulk-delete commit; only this
        // spec drifted.
        await page.locator(`[data-testid="article-bulk-check-${a1.id}"]`).click();
        await page.locator(`[data-testid="article-bulk-check-${a2.id}"]`).click();

        await expect(
            page.getByTestId("article-bulk-action-bar"),
        ).toBeVisible();
        const trigger = page.getByTestId("article-bulk-ai-menu");
        await expect(trigger).toBeVisible();
        await expect(trigger).toBeEnabled();
    });
});
