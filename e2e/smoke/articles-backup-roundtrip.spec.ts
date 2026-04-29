/**
 * Smoke tests for the articles segment of the backup pipeline.
 *
 * Mirrors the books-side ``backup-roundtrip.spec.ts`` for the
 * articles authoring path:
 *
 *   create articles -> export .bgb -> wipe articles -> import via
 *   CIO upload (POST /api/import/detect + execute)
 *   -> verify articles restored.
 *
 * Routes through the orchestrator (the user-flow path) rather than
 * the legacy /api/backup/import endpoint so the test catches
 * regressions in the bgb_handler article-aware code path.
 */

import {test, expect, createArticle, getArticles, deleteArticle} from "../fixtures/base";

const API = "http://localhost:8000/api";

test.describe("Articles backup roundtrip", () => {
    test("export then re-import via CIO restores articles", async ({page, request}) => {
        // Fresh articles only (no books) so the .bgb hits the
        // articles-only path under test.
        const articleA = await createArticle("Roundtrip Article A");
        const articleB = await createArticle("Roundtrip Article B");

        const before = await getArticles();
        expect(before.find((a) => a.id === articleA.id)).toBeDefined();
        expect(before.find((a) => a.id === articleB.id)).toBeDefined();

        // Export via the same endpoint the UI hits.
        const exportResp = await request.get(`${API}/backup/export`);
        expect(exportResp.ok()).toBe(true);
        const buffer = await exportResp.body();
        expect(buffer.length).toBeGreaterThan(0);

        // Wipe the articles (soft-delete cascade then permanent).
        await deleteArticle(articleA.id);
        await deleteArticle(articleB.id);
        // Permanent delete via empty trash.
        const trashResp = await fetch(`${API}/articles/trash/empty`, {method: "DELETE"});
        expect(trashResp.ok).toBe(true);
        const wiped = await getArticles();
        expect(wiped.find((a) => a.id === articleA.id)).toBeUndefined();
        expect(wiped.find((a) => a.id === articleB.id)).toBeUndefined();

        // CIO detect: post the .bgb to /api/import/detect.
        const detectForm = new FormData();
        detectForm.append("files", new Blob([buffer]), "articles.bgb");
        const detectResp = await fetch(`${API}/import/detect`, {
            method: "POST",
            body: detectForm,
        });
        expect(detectResp.ok).toBe(true);
        const detected = await detectResp.json();
        expect(detected.detected.format_name).toBe("bgb");
        // Articles segment must be visible to the orchestrator.
        expect(detected.detected.plugin_specific_data.article_count).toBeGreaterThanOrEqual(2);
        // No false "no book.json" warning when articles exist.
        expect(detected.detected.warnings).not.toContain(
            "No book.json inside the backup.",
        );

        // CIO execute: confirm the import.
        const executeResp = await fetch(`${API}/import/execute`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                temp_ref: detected.temp_ref,
                overrides: {},
                duplicate_action: "create",
            }),
        });
        expect(executeResp.ok).toBe(true);
        const executeBody = await executeResp.json();
        expect(executeBody.status).toBe("created");

        // Articles restored.
        const after = await getArticles();
        const restoredTitles = after.map((a) => a.title).sort();
        expect(restoredTitles).toContain("Roundtrip Article A");
        expect(restoredTitles).toContain("Roundtrip Article B");

        // UI sanity check: navigate to the dashboard and confirm a
        // restored article is visible.
        await page.goto("/articles");
        await expect(
            page.getByText("Roundtrip Article A").first(),
        ).toBeVisible();
    });

    test("articles-only .bgb does not surface 'No book.json' warning", async ({request}) => {
        await createArticle("Warning Gate Test");

        const exportResp = await request.get(`${API}/backup/export`);
        const buffer = await exportResp.body();

        const detectForm = new FormData();
        detectForm.append("files", new Blob([buffer]), "warning-gate.bgb");
        const detectResp = await fetch(`${API}/import/detect`, {
            method: "POST",
            body: detectForm,
        });
        const detected = await detectResp.json();
        expect(detected.detected.warnings).not.toContain(
            "No book.json inside the backup.",
        );
        expect(detected.detected.plugin_specific_data.articles_only).toBe(true);
    });
});
