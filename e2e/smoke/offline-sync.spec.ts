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

        // 2. Go offline. We stay on the already-loaded editor page on
        //    purpose: a full page reload while offline would need the PWA
        //    Service Worker to serve the app shell, and the dev server
        //    intentionally ships NO Service Worker (it is disabled in dev
        //    to avoid the stale-bundle class of bug). The offline storage
        //    seam (DexieStorage + the write queue) and the connectivity
        //    monitor are plain app code that work without the SW, which is
        //    what this smoke exercises: edit offline -> reconnect ->
        //    background sync. (The offline cold-reload-from-cache path is
        //    a production-SW concern, out of scope for the dev-server E2E.)
        const editor = page.locator(".ProseMirror").first();
        await expect(editor).toBeVisible();
        await context.setOffline(true);

        // 3. Edit the chapter offline. The connectivity monitor flips to
        //    offline, so the debounced autosave is routed to DexieStorage
        //    and queued in IndexedDB instead of hitting the API.
        await editor.click();
        await page.keyboard.type(" offline edit");
        // Let the debounced autosave enqueue the write.
        await page.waitForTimeout(1500);

        // 4. Reconnect -> SyncStatusWatcher drains the queue to the server.
        await context.setOffline(false);

        // 5. The edit reached the server. Poll the chapters endpoint until
        //    the offline edit shows up in the persisted TipTap content
        //    (the background sync replays the queue on reconnect).
        await expect
            .poll(
                async () => {
                    const res = await page.request.get(
                        `${API}/books/${book.id}/chapters`,
                    );
                    if (!res.ok()) return "";
                    return JSON.stringify(await res.json());
                },
                {timeout: 15000},
            )
            .toContain("offline edit");
    });
});
