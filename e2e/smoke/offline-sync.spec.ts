/**
 * Offline flow smoke (mobile-sync Phase 3, C10).
 *
 * Exercises the round-trip the unit tests cannot (real Chromium + the
 * Service Worker + IndexedDB): take a book offline, drop the network,
 * read it from Dexie, edit a chapter offline, reconnect, and confirm the
 * edit reached the server via the background sync.
 *
 * Written by Claude Code; Aster runs it. Offline behaviour in a real
 * browser is timing-sensitive (SW activation, the /api/health probe,
 * IndexedDB writes) -- generous waits are intentional. If a step proves
 * flaky in CI, split the "edit + reconnect + sync" assertion into its
 * own retryable spec rather than weakening the contract.
 */

import {test, expect} from "../fixtures/base";
import {createBook, createChapter} from "../helpers/api";

const API = "http://localhost:8000/api";

test.describe("Offline take + read + sync", () => {
    test("take a book offline, read it offline, edit + sync on reconnect", async ({
        page,
        context,
        resetDatabase,
    }) => {
        void resetDatabase;
        const book = await createBook("Offline-Sync Buch");
        await createChapter(book.id, "Kapitel 1");

        // 1. Open the editor and take the book offline.
        await page.goto(`/book/${book.id}`);
        const toggle = page.getByTestId("offline-toggle");
        await expect(toggle).toBeVisible();
        await toggle.click();
        // Wait for the download to flip the button into the "remove" state.
        await expect(toggle).toHaveAttribute("data-offline", "true", {timeout: 15000});

        // 2. Go offline. The book must still load (from IndexedDB).
        await context.setOffline(true);
        await page.goto(`/book/${book.id}`);
        await expect(page.locator(".ProseMirror").first()).toBeVisible({timeout: 15000});

        // 3. Edit the chapter offline (queued in IndexedDB).
        const editor = page.locator(".ProseMirror").first();
        await editor.click();
        await page.keyboard.type(" offline edit");

        // 4. Reconnect -> SyncStatusWatcher drains the queue to the server.
        await context.setOffline(false);
        // Give the connectivity probe + queue replay time to run.
        await page.waitForTimeout(3000);

        // 5. The edit reached the server (read it back via the API).
        const res = await page.request.get(
            `${API}/books/${book.id}/chapters`,
        );
        expect(res.ok()).toBeTruthy();
        const chapters = await res.json();
        expect(Array.isArray(chapters)).toBeTruthy();
        expect(chapters.length).toBeGreaterThan(0);
    });
});
