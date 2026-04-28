/**
 * AR-02 Phase 2.1 smoke: Settings → Topics manages a list of topics
 * that the ArticleEditor consumes via a settings-managed dropdown.
 * Also verifies the metadata sidebar renders on the LEFT (mirroring
 * BookEditor) and that SEO Title / SEO Description fields persist.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return res.json();
}

async function patchJson(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${API}${path}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`);
}

test.describe("AR-02 Phase 2.1 topic + SEO", () => {
    test("topics round-trip through Settings into the editor dropdown", async ({page}) => {
        await page.goto("/settings");
        await page.getByTestId("settings-tab-topics").click();

        await page.getByTestId("topic-add-input").fill("Tech");
        await page.getByTestId("topic-add-btn").click();
        await page.getByTestId("topic-add-input").fill("Writing");
        await page.getByTestId("topic-add-btn").click();
        await page.getByTestId("topics-save-btn").click();

        // Reset back to a stable state for other tests by patching via API.
        // Both topics persisted; verify in the editor.
        const article = await postJson<{id: string}>("/articles", {title: "Topic Test"});

        await page.goto(`/articles/${article.id}`);
        await expect(page.getByTestId("article-editor")).toBeVisible();

        const topicSelect = page.getByTestId("article-editor-topic");
        await expect(topicSelect).toBeEnabled();
        // Both topics must be present as options.
        await expect(topicSelect.locator("option", {hasText: "Tech"})).toHaveCount(1);
        await expect(topicSelect.locator("option", {hasText: "Writing"})).toHaveCount(1);

        await topicSelect.selectOption("Tech");
        await page.waitForTimeout(300);

        // Reload and assert persistence via the dropdown's selected value.
        await page.reload();
        await expect(page.getByTestId("article-editor-topic")).toHaveValue("Tech");

        // Cleanup: drop the seeded topics so other tests start clean.
        await patchJson("/settings/app", {topics: []});
    });

    test("sidebar renders on the LEFT (BookEditor parity)", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {title: "Layout Test"});
        await page.goto(`/articles/${article.id}`);

        const sidebar = page.getByTestId("article-editor-sidebar");
        // The shared Editor renders ProseMirror inside the pane.
        // Compare its position to the sidebar's to confirm the
        // sidebar is on the left.
        const editor = page.locator(".ProseMirror").first();
        await expect(sidebar).toBeVisible();
        await expect(editor).toBeVisible();

        const sidebarBox = await sidebar.boundingBox();
        const editorBox = await editor.boundingBox();
        if (!sidebarBox || !editorBox) throw new Error("missing bounding boxes");
        expect(sidebarBox.x).toBeLessThan(editorBox.x);
    });

    test("SEO Title and SEO Description persist", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {title: "SEO Test"});
        await page.goto(`/articles/${article.id}`);

        await page.getByTestId("article-editor-seo-title").fill("Custom SEO Headline");
        await page.getByTestId("article-editor-seo-title").blur();
        await page.getByTestId("article-editor-seo-description").fill("Snippet for search.");
        await page.getByTestId("article-editor-seo-description").blur();
        await page.waitForTimeout(300);

        await page.reload();
        await expect(page.getByTestId("article-editor-seo-title")).toHaveValue("Custom SEO Headline");
        await expect(page.getByTestId("article-editor-seo-description")).toHaveValue("Snippet for search.");
    });
});
