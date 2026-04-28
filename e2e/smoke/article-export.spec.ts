/**
 * AR editor-parity Phase 3 smoke: ArticleEditor sidebar renders the
 * Export panel and Markdown / HTML buttons trigger a file download.
 * PDF / DOCX paths require Pandoc and are exercised in the backend
 * unit tests; the smoke only covers the always-available formats.
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

test.describe("AR editor-parity Phase 3 export", () => {
    test("sidebar Export panel exposes one button per format", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Export Smoke",
        });
        await page.goto(`/articles/${article.id}`);

        const panel = page.getByTestId("article-editor-export-panel");
        await expect(panel).toBeVisible();
        await expect(page.getByTestId("article-editor-export-markdown")).toBeVisible();
        await expect(page.getByTestId("article-editor-export-html")).toBeVisible();
        await expect(page.getByTestId("article-editor-export-pdf")).toBeVisible();
        await expect(page.getByTestId("article-editor-export-docx")).toBeVisible();
    });

    test("Markdown export triggers a file download", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "Markdown Export",
        });
        await page.goto(`/articles/${article.id}`);

        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("article-editor-export-markdown").click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.md$/);
    });

    test("HTML export triggers a file download", async ({page}) => {
        const article = await postJson<{id: string}>("/articles", {
            title: "HTML Export",
        });
        await page.goto(`/articles/${article.id}`);

        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("article-editor-export-html").click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.html$/);
    });
});
