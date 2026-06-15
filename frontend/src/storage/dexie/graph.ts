/**
 * Offline-download support (C3): write / drop a complete book graph into
 * IndexedDB and query which books are available offline.
 */

import type { Book } from "../../api/client";
import { type GraphRow, offlineDb } from "./schema";

/** The full book graph as returned by GET /api/books/{id}/full. */
type BookGraph = {
    book: Book;
    chapters: import("../../api/client").Chapter[];
    pages: Array<Record<string, unknown>>;
    comic_panels: Array<Record<string, unknown>>;
    comic_bubbles: Array<Record<string, unknown>>;
    story_entities: Array<Record<string, unknown>>;
    story_entity_page_links: Array<Record<string, unknown>>;
    chapter_labels: Array<Record<string, unknown>>;
    assets: Array<Record<string, unknown>>;
};

// The graph child rows carry a string `id` at runtime; the wire type is
// the looser Record<string, unknown>, so cast once at the boundary.
const asGraphRows = (rows: Array<Record<string, unknown>>): GraphRow[] =>
    rows as unknown as GraphRow[];

/** Write a complete book graph into IndexedDB and flag the book
 *  offline-available. Idempotent (bulkPut overwrites). */
export async function ingestBookGraph(graph: BookGraph): Promise<void> {
    await offlineDb.transaction("rw", offlineDb.tables, async () => {
        await offlineDb.books.put({ ...graph.book, offline_available: true });
        await offlineDb.chapters.bulkPut(graph.chapters);
        await offlineDb.pages.bulkPut(asGraphRows(graph.pages));
        await offlineDb.comicPanels.bulkPut(asGraphRows(graph.comic_panels));
        await offlineDb.comicBubbles.bulkPut(asGraphRows(graph.comic_bubbles));
        await offlineDb.storyEntities.bulkPut(asGraphRows(graph.story_entities));
        await offlineDb.storyEntityPageLinks.bulkPut(asGraphRows(graph.story_entity_page_links));
        await offlineDb.chapterLabels.bulkPut(asGraphRows(graph.chapter_labels));
        // Conflict baselines: the server version each record was downloaded
        // at, so the sync engine (C7) can detect a desktop-side edit.
        await offlineDb.syncBaselines.bulkPut([
            { id: `book:${graph.book.id}`, updated_at: graph.book.updated_at },
            ...graph.chapters.map((c) => ({
                id: `chapter:${c.id}`,
                updated_at: c.updated_at,
            })),
        ]);
    });
}

/** Drop a book + its whole offline graph from IndexedDB. */
export async function removeBookGraph(bookId: string): Promise<void> {
    await offlineDb.transaction("rw", offlineDb.tables, async () => {
        const pageIds = (await offlineDb.pages
            .where("book_id")
            .equals(bookId)
            .primaryKeys()) as string[];
        const panelIds =
            pageIds.length > 0
                ? ((await offlineDb.comicPanels
                      .where("page_id")
                      .anyOf(pageIds)
                      .primaryKeys()) as string[])
                : [];
        await offlineDb.books.delete(bookId);
        await offlineDb.chapters.where("book_id").equals(bookId).delete();
        await offlineDb.pages.where("book_id").equals(bookId).delete();
        await offlineDb.storyEntities.where("book_id").equals(bookId).delete();
        await offlineDb.chapterLabels.where("book_id").equals(bookId).delete();
        await offlineDb.assets.where("bookId").equals(bookId).delete();
        if (pageIds.length > 0) {
            await offlineDb.storyEntityPageLinks.where("page_id").anyOf(pageIds).delete();
        }
        if (panelIds.length > 0) {
            await offlineDb.comicPanels.where("page_id").anyOf(pageIds).delete();
            await offlineDb.comicBubbles.where("panel_id").anyOf(panelIds).delete();
        }
    });
}

/** Ids of books currently available offline. */
export async function listOfflineBookIds(): Promise<string[]> {
    const rows = await offlineDb.books.toArray();
    return rows.filter((b) => b.offline_available).map((b) => b.id);
}

/** Whether a specific book is available offline. */
export async function isBookOffline(bookId: string): Promise<boolean> {
    const row = await offlineDb.books.get(bookId);
    return !!row?.offline_available;
}
