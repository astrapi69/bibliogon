/**
 * Comics namespace for DexieStorage: comic panels + speech bubbles over the
 * `comicPanels` / `comicBubbles` tables, cascading bubbles on panel delete.
 */

import type { ComicBubbleOut, ComicPanelOut } from "../../api/client";
import type { IStorageService } from "../types";
import { newId, nowIso, notFound } from "./helpers";
import { type GraphRow, offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const comics: IStorageService["comics"] = {
    getInfo: async () => ({
        name: "comics",
        version: "offline",
        session: 0,
        status: "offline",
        description: "offline",
    }),
    listPanels: async (_bookId, pageId) => {
        const rows = (await offlineDb.comicPanels
            .where("page_id")
            .equals(pageId)
            .toArray()) as unknown as ComicPanelOut[];
        return rows.sort((a, b) => a.position - b.position);
    },
    createPanel: async (_bookId, pageId, data) => {
        const position = await offlineDb.comicPanels.where("page_id").equals(pageId).count();
        const ts = nowIso();
        const row: ComicPanelOut = {
            id: newId(),
            page_id: pageId,
            position,
            image_asset_id: data.image_asset_id ?? null,
            bounds: data.bounds,
            panel_config: data.panel_config ?? null,
            created_at: ts,
            updated_at: ts,
        };
        await offlineDb.comicPanels.add(row as unknown as GraphRow);
        return row;
    },
    updatePanel: async (_bookId, panelId, data) =>
        serializedUpdate("comic_panels", panelId, async () => {
            const existing = await offlineDb.comicPanels.get(panelId);
            if (!existing) notFound("ComicPanel", panelId);
            const merged = {
                ...existing,
                ...data,
                updated_at: nowIso(),
            } as unknown as ComicPanelOut;
            await offlineDb.comicPanels.put(merged as unknown as GraphRow);
            return merged;
        }),
    deletePanel: async (_bookId, panelId) => {
        const bubbleIds = (await offlineDb.comicBubbles
            .where("panel_id")
            .equals(panelId)
            .primaryKeys()) as string[];
        if (bubbleIds.length) await offlineDb.comicBubbles.bulkDelete(bubbleIds);
        await offlineDb.comicPanels.delete(panelId);
    },
    reorderPanels: async (_bookId, pageId, panelIds) => {
        await Promise.all(
            panelIds.map((id, index) =>
                offlineDb.comicPanels.update(id, {
                    position: index,
                } as Partial<GraphRow>),
            ),
        );
        const rows = (await offlineDb.comicPanels
            .where("page_id")
            .equals(pageId)
            .toArray()) as unknown as ComicPanelOut[];
        return rows.sort((a, b) => a.position - b.position);
    },
    listBubbles: async (_bookId, panelId) => {
        const rows = (await offlineDb.comicBubbles
            .where("panel_id")
            .equals(panelId)
            .toArray()) as unknown as ComicBubbleOut[];
        return rows.sort((a, b) => a.position - b.position);
    },
    createBubble: async (_bookId, panelId, data) => {
        const position = await offlineDb.comicBubbles.where("panel_id").equals(panelId).count();
        const ts = nowIso();
        const row: ComicBubbleOut = {
            id: newId(),
            panel_id: panelId,
            position,
            bubble_type: data.bubble_type,
            anchor: data.anchor,
            width_pct: data.width_pct ?? 30,
            height_pct: data.height_pct ?? 20,
            tail_direction: data.tail_direction ?? "none",
            tail_position_pct: data.tail_position_pct ?? 50,
            tail_length_px: data.tail_length_px ?? 16,
            bubble_config: data.bubble_config ?? null,
            text_content: data.text_content ?? null,
            created_at: ts,
            updated_at: ts,
        };
        await offlineDb.comicBubbles.add(row as unknown as GraphRow);
        return row;
    },
    updateBubble: async (_bookId, bubbleId, data) =>
        serializedUpdate("comic_bubbles", bubbleId, async () => {
            const existing = await offlineDb.comicBubbles.get(bubbleId);
            if (!existing) notFound("ComicBubble", bubbleId);
            const merged = {
                ...existing,
                ...data,
                updated_at: nowIso(),
            } as unknown as ComicBubbleOut;
            await offlineDb.comicBubbles.put(merged as unknown as GraphRow);
            return merged;
        }),
    deleteBubble: async (_bookId, bubbleId) => {
        await offlineDb.comicBubbles.delete(bubbleId);
    },
};
