/**
 * Picture-book pages namespace for DexieStorage over the `pages` graph
 * table, cascading a page's comic panels + bubbles on delete.
 */

import type { Page } from "../../api/client";
import type { IStorageService } from "../types";
import { buildPage, newId, nowIso, notFound } from "./helpers";
import { type GraphRow, offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const pages: IStorageService["pages"] = {
    list: async (bookId) => {
        const rows = (await offlineDb.pages
            .where("book_id")
            .equals(bookId)
            .toArray()) as unknown as Page[];
        return rows.sort((a, b) => a.position - b.position);
    },
    create: async (bookId, data) => {
        const position = await offlineDb.pages.where("book_id").equals(bookId).count();
        const row = buildPage(bookId, data, newId(), position);
        await offlineDb.pages.add(row as unknown as GraphRow);
        return row;
    },
    update: async (_bookId, pageId, data) =>
        serializedUpdate("pages", pageId, async () => {
            const existing = await offlineDb.pages.get(pageId);
            if (!existing) notFound("Page", pageId);
            const merged = {
                ...existing,
                ...data,
                updated_at: nowIso(),
            } as unknown as Page;
            await offlineDb.pages.put(merged as unknown as GraphRow);
            return merged;
        }),
    delete: async (_bookId, pageId) => {
        // Cascade the page's comic panels + their bubbles.
        const panelIds = (await offlineDb.comicPanels
            .where("page_id")
            .equals(pageId)
            .primaryKeys()) as string[];
        if (panelIds.length) {
            const bubbleIds = (await offlineDb.comicBubbles
                .filter((b) => panelIds.includes((b as { panel_id?: string }).panel_id ?? ""))
                .primaryKeys()) as string[];
            if (bubbleIds.length) await offlineDb.comicBubbles.bulkDelete(bubbleIds);
            await offlineDb.comicPanels.bulkDelete(panelIds);
        }
        await offlineDb.pages.delete(pageId);
    },
    reorder: async (bookId, pageIds) => {
        await Promise.all(
            pageIds.map((id, index) =>
                offlineDb.pages.update(id, { position: index } as Partial<GraphRow>),
            ),
        );
        const rows = (await offlineDb.pages
            .where("book_id")
            .equals(bookId)
            .toArray()) as unknown as Page[];
        return rows.sort((a, b) => a.position - b.position);
    },
};
