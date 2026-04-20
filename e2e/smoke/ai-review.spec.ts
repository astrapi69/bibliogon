/**
 * Smoke tests for the AI Review Extension UI (v0.20.0).
 *
 * Covers the surface of the three-mode review flow without requiring
 * a live LLM backend:
 *   1. Three radio focus buttons render (Style / Consistency / Beta
 *      Reader) when the review tab is active.
 *   2. The non-prose chapter-type warning appears for non-prose
 *      chapters (here: `imprint`) and is absent for a normal chapter.
 *   3. A mocked happy-path review (intercepted async submit +
 *      synthesized SSE events) surfaces the "Download report" button.
 *
 * AI is not a plugin; it is a core module gated by `ai.enabled` in
 * app.yaml. We mock `GET /api/editor-plugins` so the toolbar AI
 * button lights up without touching the server config, then mock the
 * review-specific routes so no real LLM request is made.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";
import type {Page, Route} from "@playwright/test";

async function enableAiViaRouteMock(page: Page) {
  await page.route("**/api/editor-plugins", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ai: {available: true, reason: null, message: ""},
      }),
    });
  });
}

async function mockReviewHappyPath(page: Page) {
  // Cost estimate endpoint - fires when the user opens the review tab.
  await page.route("**/api/ai/review/estimate", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input_tokens: 1234,
        output_tokens: 1500,
        cost_usd: 0.0123,
      }),
    });
  });

  // Async review submit -> returns a job_id + review_id. The UI
  // immediately subscribes to the SSE stream below.
  await page.route("**/api/ai/review/async", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({job_id: "testjob1234", review_id: "testrev1234"}),
    });
  });

  // Job poll: returns completed with the review markdown.
  await page.route("**/api/ai/jobs/testjob1234", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "testjob1234",
        status: "completed",
        progress: {},
        result: {
          review_id: "testrev1234",
          review: "## Summary\nA good chapter.",
          model: "gpt-4o-mini",
          usage: {total_tokens: 100},
          download_url: "/api/ai/review/testrev1234/report.md?book_id=x",
          filename: "testrev1234-test-2026-04-20.md",
        },
        error: null,
      }),
    });
  });

  // SSE stream: synthesize the three events the Editor listens for
  // (review_start, review_done, stream_end).
  await page.route("**/api/ai/jobs/testjob1234/stream", async (route: Route) => {
    const body = [
      `data: ${JSON.stringify({type: "review_start", data: {focus: ["style"]}})}\n\n`,
      `data: ${JSON.stringify({type: "review_done", data: {review_id: "testrev1234", download_url: "/api/ai/review/testrev1234/report.md?book_id=x", filename: "testrev1234.md"}})}\n\n`,
      `data: ${JSON.stringify({type: "stream_end", data: {status: "completed"}})}\n\n`,
    ].join("");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });
}

async function openEditorForChapter(page: Page, bookId: string) {
  await page.goto(`/book/${bookId}`);
  await expect(page.locator(".ProseMirror")).toBeVisible({timeout: 10_000});
  // Click toolbar AI toggle. Button may be disabled if our
  // editor-plugins mock has not been hit yet; wait for it to enable.
  const aiBtn = page.getByTestId("toolbar-ai");
  await expect(aiBtn).toBeEnabled({timeout: 5000});
  await aiBtn.click();
  // Review is one of five aiPromptType buttons; click it to surface
  // the review UI.
  await page.getByRole("button", {name: /Review/}).first().click();
}

test.describe("AI Review Extension - UI surface", () => {
  test.beforeEach(async ({page}) => {
    await enableAiViaRouteMock(page);
  });

  test("three radio focus buttons render on review tab", async ({page}) => {
    const book = await createBook("AI Review UI Smoke");
    await createChapter(book.id, "Chapter 1", "<p>Some text.</p>");

    await openEditorForChapter(page, book.id);

    await expect(page.getByTestId("ai-review-focus-style")).toBeVisible();
    await expect(page.getByTestId("ai-review-focus-consistency")).toBeVisible();
    await expect(page.getByTestId("ai-review-focus-beta_reader")).toBeVisible();
  });

  test("non-prose warning appears for imprint chapter type", async ({page}) => {
    const book = await createBook("Non-Prose Warning Smoke");
    // `imprint` is in NON_PROSE_CHAPTER_TYPES.
    await createChapter(book.id, "Impressum", "<p>Impressum text.</p>", "imprint");

    await openEditorForChapter(page, book.id);

    await expect(page.getByTestId("ai-review-non-prose-warning")).toBeVisible();
  });

  test("no warning for a regular chapter", async ({page}) => {
    const book = await createBook("Regular Chapter Smoke");
    await createChapter(book.id, "Chapter", "<p>Normal prose.</p>", "chapter");

    await openEditorForChapter(page, book.id);

    await expect(page.getByTestId("ai-review-non-prose-warning")).not.toBeVisible();
  });

  test("happy-path review surfaces the download-report link", async ({page}) => {
    await mockReviewHappyPath(page);
    const book = await createBook("Download Report Smoke");
    await createChapter(book.id, "Chapter 1", "<p>Prose to review.</p>");

    await openEditorForChapter(page, book.id);

    // Sanity: the Start button renders.
    const start = page.getByTestId("ai-review-start");
    await expect(start).toBeEnabled();
    await start.click();

    // The synthesized SSE review_done event + the job poll result
    // both carry download_url, so the download button must appear.
    await expect(page.getByTestId("ai-review-download")).toBeVisible({timeout: 10_000});
  });
});
