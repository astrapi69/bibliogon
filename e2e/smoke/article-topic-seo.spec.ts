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

        // The save is an async PATCH; the editor reads the topics list
        // fresh on load, so navigating before the PATCH lands races it
        // (the dropdown then shows no topics — the deterministic failure
        // this pins). Wait for the topics to actually persist first.
        await expect
            .poll(async () => {
                const res = await page.request.get(`${API}/settings/app`);
                const cfg = await res.json();
                return (cfg.topics as string[] | undefined) ?? [];
            })
            .toEqual(expect.arrayContaining(["Tech", "Writing"]));

        // Both topics persisted; verify in the editor.
        const article = await postJson<{id: string}>("/articles", {title: "Topic Test"});

        await page.goto(`/articles/${article.id}`);
        await expect(page.getByTestId("article-editor")).toBeVisible();

        const topicSelect = page.getByTestId("article-editor-topic-trigger");
        await expect(topicSelect).toBeEnabled();
        // Open the dropdown; both topics must be present as items.
        await topicSelect.click();
        await expect(
            page.getByTestId("article-editor-topic-item-Tech"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-editor-topic-item-Writing"),
        ).toBeVisible();

        // Pick Tech (closes the menu).
        await page.getByTestId("article-editor-topic-item-Tech").click();
        await page.waitForTimeout(300);

        // Reload and assert persistence via the dropdown's selected value.
        await page.reload();
        await expect(
            page.getByTestId("article-editor-topic-trigger"),
        ).toHaveAttribute("data-value", "Tech");

        // Cleanup: drop the seeded topics so other tests start clean.
        await patchJson("/settings/app", {topics: []});
    });

    test("sidebar renders on the LEFT (BookEditor parity)", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {title: "Layout Test"});
        await page.goto(`/articles/${article.id}`);

        // Wait for the editor shell to mount before measuring layout.
        // Under full-suite load the editor can take >5s; wait for the
        // root, then the sidebar + ProseMirror with a generous budget.
        await expect(page.getByTestId("article-editor")).toBeVisible({
            timeout: 15_000,
        });
        const sidebar = page.getByTestId("article-editor-sidebar");
        // The shared Editor renders ProseMirror inside the pane.
        // Compare its position to the sidebar's to confirm the
        // sidebar is on the left.
        const editor = page.locator(".ProseMirror").first();
        await expect(sidebar).toBeVisible({timeout: 15_000});
        await expect(editor).toBeVisible({timeout: 15_000});

        // Poll the box comparison: boundingBox() can transiently return null
        // right after toBeVisible while the editor is still settling under
        // load (the "missing bounding boxes" flake). Retry until both boxes
        // resolve, then assert the sidebar is left of the editor.
        await expect
            .poll(
                async () => {
                    const s = await sidebar.boundingBox();
                    const e = await editor.boundingBox();
                    return s && e ? s.x < e.x : null;
                },
                {timeout: 10_000},
            )
            .toBe(true);
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
