/**
 * Smoke test for the ChapterVersionsPage route (Dialog->Pages migration C6).
 *
 * ChapterVersionsModal became a deep-linkable page at
 * `/books/:bookId/chapters/:chapterId/snapshots`. The C6 prep also lifted
 * the editor's active chapter into the URL (`?chapter=`), so restore /
 * back returns to the editor with the right chapter selected.
 *   - deep-link: the URL renders the snapshots view directly
 *   - take a named snapshot -> it appears in the list
 *   - back button returns to the editor with `?chapter=<id>`
 *   - mobile viewport renders without overflow
 *
 * Builds its own book + chapter via the API (the fixture resets the DB).
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";
const JSON_HEADERS = {"Content-Type": "application/json"};

async function makeBookWithChapter(): Promise<{bookId: string; chapterId: string}> {
    const bookRes = await fetch(`${API}/books`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({title: "E2E Snapshots Book", author: "Playwright"}),
    });
    if (!bookRes.ok) throw new Error(`POST /books: ${bookRes.status}`);
    const book = await bookRes.json();
    const chRes = await fetch(`${API}/books/${book.id}/chapters`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({title: "Chapter One", content: "{}"}),
    });
    if (!chRes.ok) throw new Error(`POST /chapters: ${chRes.status}`);
    const chapter = await chRes.json();
    return {bookId: book.id, chapterId: chapter.id};
}

test("deep-link renders the snapshots view + take snapshot + back to editor", async ({page}) => {
    const {bookId, chapterId} = await makeBookWithChapter();

    await page.goto(`/books/${bookId}/chapters/${chapterId}/snapshots`);
    await expect(page.getByTestId("chapter-versions-page")).toBeVisible();
    await expect(page.getByTestId("chapter-versions-view")).toBeVisible();
    await expect(page.getByTestId("chapter-snapshot-create")).toBeVisible();

    // Take a named manual snapshot -> it lands in the list.
    await page.getByTestId("chapter-snapshot-name").fill("E2E snapshot");
    await page.getByTestId("chapter-snapshot-create").click();
    await expect(page.getByTestId("chapter-versions-list")).toBeVisible();

    // Back returns to the editor with the chapter still selected via the URL.
    await page.getByTestId("chapter-versions-page-back").click();
    await expect(page).toHaveURL(
        new RegExp(`/book/${bookId}\\?chapter=${chapterId}`),
    );
});

test("renders on a mobile viewport without overflow", async ({page}) => {
    const {bookId, chapterId} = await makeBookWithChapter();
    await page.setViewportSize({width: 375, height: 800});
    await page.goto(`/books/${bookId}/chapters/${chapterId}/snapshots`);
    const create = page.getByTestId("chapter-snapshot-create");
    await expect(create).toBeVisible();
    const box = await create.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
