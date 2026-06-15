/**
 * Story Bible namespace for DexieStorage. Entity + link CRUD over the
 * offline tables; the entity-type registry is seeded; the text-analysis
 * methods return empty offline and exportBible is generated client-side.
 */

import type {
    StoryEntityLinkOut,
    StoryEntityOut,
    StoryEntityRelationshipResolved,
} from "../../api/client";
import type { IStorageService } from "../types";
import {
    buildStoryEntity,
    embedLinkEntities,
    newId,
    nowIso,
    notFound,
    storyBibleToMarkdown,
} from "./helpers";
import { type GraphRow, offlineDb, REF_KEY } from "./schema";
import { ensureSeeded } from "./seed";
import { serializedUpdate } from "./serialized-update";

export const storyBible: IStorageService["storyBible"] = {
    getInfo: async () => ({
        plugin: "story-bible",
        version: "offline",
        phase: "offline",
    }),

    listEntityTypes: async () => {
        await ensureSeeded();
        const row = await offlineDb.storyEntityTypesRef.get(REF_KEY);
        return row?.data ?? {};
    },

    listEntities: async (bookId, entityType, search) => {
        let rows = (await offlineDb.storyEntities
            .where("book_id")
            .equals(bookId)
            .toArray()) as unknown as StoryEntityOut[];
        if (entityType) rows = rows.filter((e) => e.entity_type === entityType);
        if (search?.trim()) {
            const query = search.trim().toLowerCase();
            rows = rows.filter((e) => e.name.toLowerCase().includes(query));
        }
        return rows.sort((a, b) => a.position - b.position);
    },

    createEntity: async (bookId, data) => {
        const position = await offlineDb.storyEntities.where("book_id").equals(bookId).count();
        const row = buildStoryEntity(bookId, data, newId(), position);
        await offlineDb.storyEntities.add(row as unknown as GraphRow);
        return row;
    },

    getEntity: async (entityId) => {
        const row = await offlineDb.storyEntities.get(entityId);
        if (!row) notFound("StoryEntity", entityId);
        return row as unknown as StoryEntityOut;
    },

    updateEntity: async (entityId, data) =>
        serializedUpdate("story_entities", entityId, async () => {
            const existing = await offlineDb.storyEntities.get(entityId);
            if (!existing) notFound("StoryEntity", entityId);
            const merged = {
                ...existing,
                ...data,
                updated_at: nowIso(),
            } as unknown as StoryEntityOut;
            await offlineDb.storyEntities.put(merged as unknown as GraphRow);
            return merged;
        }),

    deleteEntity: async (entityId) => {
        await offlineDb.storyEntities.delete(entityId);
        // Cascade the entity's links (no entity_id index -> filter scan).
        const linkIds = (await offlineDb.storyEntityPageLinks
            .filter((l) => (l as { entity_id?: string }).entity_id === entityId)
            .primaryKeys()) as string[];
        if (linkIds.length) await offlineDb.storyEntityPageLinks.bulkDelete(linkIds);
    },

    getRelationships: async (_bookId, entityId) => {
        const entity = (await offlineDb.storyEntities.get(entityId)) as unknown as
            | StoryEntityOut
            | undefined;
        if (!entity?.relationships?.length) return [];
        const resolved: StoryEntityRelationshipResolved[] = [];
        for (const rel of entity.relationships) {
            const target = (await offlineDb.storyEntities.get(
                rel.target_entity_id,
            )) as unknown as StoryEntityOut | undefined;
            if (!target) continue; // drop stale (deleted-target) relationships
            resolved.push({
                relationship_type: rel.relationship_type,
                description: rel.description ?? null,
                target,
            });
        }
        return resolved;
    },

    // Text analysis needs the backend; offline it yields nothing rather than
    // erroring, so the buttons degrade to "no proposals" / "no warnings".
    autoDetect: async () => [],
    continuityCheck: async () => [],

    appearances: async (entityId) => {
        const links = (await offlineDb.storyEntityPageLinks
            .filter((l) => (l as { entity_id?: string }).entity_id === entityId)
            .toArray()) as unknown as StoryEntityLinkOut[];
        return embedLinkEntities(links);
    },

    pageEntities: async (pageId) => {
        const links = (await offlineDb.storyEntityPageLinks
            .where("page_id")
            .equals(pageId)
            .toArray()) as unknown as StoryEntityLinkOut[];
        return embedLinkEntities(links);
    },

    createLink: async (data) => {
        const row = {
            id: newId(),
            entity_id: data.entity_id,
            page_id: data.page_id ?? null,
            chapter_id: data.chapter_id ?? null,
            role: data.role ?? null,
            notes: data.notes ?? null,
            created_at: nowIso(),
        };
        await offlineDb.storyEntityPageLinks.add(row as unknown as GraphRow);
        const entity = (await offlineDb.storyEntities.get(
            data.entity_id,
        )) as unknown as StoryEntityOut;
        return { ...row, entity } as StoryEntityLinkOut;
    },

    deleteLink: async (linkId) => {
        await offlineDb.storyEntityPageLinks.delete(linkId);
    },

    exportBible: async (bookId) => {
        const entities = (await offlineDb.storyEntities
            .where("book_id")
            .equals(bookId)
            .toArray()) as unknown as StoryEntityOut[];
        return {
            filename: `story-bible-${bookId}.md`,
            content: storyBibleToMarkdown(entities),
            format: "markdown",
        };
    },
};
