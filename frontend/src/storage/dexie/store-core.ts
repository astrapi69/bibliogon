import { SEED_CONTENT_TYPES, SEED_PLUGIN_METADATA, SEED_SETTINGS } from "../seed";
import type { IStorageService } from "../types";
import {
  storeAssetBlob,
} from "./blobs";
import {
  assetRowToMeta,
  computeWritingByBook,
  computeWritingByChapter,
  computeWritingSummary,
  embedLinkEntities,
  imageDimensions,
  sanitizeAssetName,
  storyBibleToMarkdown,
} from "./record-helpers";
import {
  buildAuthor,
  buildBook,
  buildStoryEntity,
  hardDeleteBooks,
  normalizeAuthorRow,
  notFound,
  trashedBookIds,
} from "./row-builders";
import {
  GraphRow,
  OfflineBookRow,
  REF_KEY,
  SETTINGS_KEY,
  isPlainObject,
  newId,
  nowIso,
  offlineDb,
} from "./schema";
import {
  ensureSeeded,
} from "./seed";
import {
  serializedUpdate,
} from "./serialized-update";
import type {
  Author,
  AuthorCreate,
  AuthorUpdate,
  BookDetail,
  BulkDeleteResponse,
  BulkRestoreResponse,
  CoverUploadResponse,
  StoryEntityLinkOut,
  StoryEntityOut,
  StoryEntityRelationshipResolved,
} from "../../api/client";

export const store_coreNamespaces: Pick<IStorageService,
  "books" |
  "settings" |
  "contentTypes" |
  "writingStats" |
  "authors" |
  "storyBible" |
  "assets" |
  "covers"
> = {
  books: {
    list: async () =>
      (await offlineDb.books.toArray()).filter((b) => !b.deleted_at),

    get: async (id, includeContent = false) => {
      const book = await offlineDb.books.get(id);
      if (!book) notFound("Book", id);
      // Match the API contract: the chapter LIST (titles/positions) is
      // always present; only the heavy `content` is stripped when
      // includeContent is false (BookEditor loads it per-chapter).
      const chapters = (
        await offlineDb.chapters.where("book_id").equals(id).toArray()
      )
        .sort((a, b) => a.position - b.position)
        .map((c) => (includeContent ? c : { ...c, content: "" }));
      const detail: BookDetail = { ...book, chapters };
      return detail;
    },

    create: async (data) => {
      const row = buildBook(data, newId());
      await offlineDb.books.add(row);
      return row;
    },

    update: async (id, data) =>
      serializedUpdate("books", id, async () => {
        const existing = await offlineDb.books.get(id);
        if (!existing) notFound("Book", id);
        const merged: OfflineBookRow = {
          ...existing,
          ...data,
          id,
          updated_at: nowIso(),
        };
        await offlineDb.books.put(merged);
        return merged;
      }),

    delete: async (id) => {
      // Soft-delete: move to trash (deleted_at set). The child graph is
      // left intact so a restore brings the book back whole; the cascade
      // runs only on the permanent paths (hardDeleteBooks). Idempotent.
      await offlineDb.books.update(id, { deleted_at: nowIso() });
    },

    listTrash: async () =>
      (await offlineDb.books.toArray()).filter((b) => !!b.deleted_at),

    restore: async (id) => {
      await offlineDb.books.update(id, { deleted_at: null });
      const row = await offlineDb.books.get(id);
      if (!row) notFound("Book", id);
      return row;
    },

    permanentDelete: async (id) => {
      await hardDeleteBooks([id]);
    },

    emptyTrash: async () => {
      await hardDeleteBooks(await trashedBookIds());
    },

    bulkRestore: async (ids) => {
      await Promise.all(
        ids.map((id) => offlineDb.books.update(id, { deleted_at: null })),
      );
      const response: BulkRestoreResponse = {
        restored_count: ids.length,
        skipped_not_in_trash: [],
        failed: [],
      };
      return response;
    },

    bulkDelete: async (ids, permanent) => {
      if (permanent) {
        await hardDeleteBooks(ids);
      } else {
        const ts = nowIso();
        await Promise.all(
          ids.map((id) => offlineDb.books.update(id, { deleted_at: ts })),
        );
      }
      const response: BulkDeleteResponse = {
        deleted_count: ids.length,
        skipped_already_trashed: [],
        failed: [],
      };
      return response;
    },
  },

  settings: {
    getApp: async () => {
      await ensureSeeded();
      const row = await offlineDb.appSettings.get(SETTINGS_KEY);
      return (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
    },

    /**
     * Apply a settings patch with a shallow per-section merge, mirroring the
     * backend PATCH semantics (`current.setdefault(section, {}).update(...)`):
     * object sections merge key-by-key, scalars replace.
     */
    updateApp: async (patch) =>
      serializedUpdate("app_settings", SETTINGS_KEY, async () => {
        await ensureSeeded();
        const row = await offlineDb.appSettings.get(SETTINGS_KEY);
        const current = (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...current };
        for (const [key, value] of Object.entries(patch)) {
          const prev = merged[key];
          merged[key] =
            isPlainObject(prev) && isPlainObject(value)
              ? { ...prev, ...value }
              : value;
        }
        await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: merged });
        return merged;
      }),

    discoveredPlugins: async () => {
      await ensureSeeded();
      const row = await offlineDb.pluginMetaRef.get(REF_KEY);
      return row?.data ?? SEED_PLUGIN_METADATA;
    },
  },

  contentTypes: {
    list: async () => {
      await ensureSeeded();
      const row = await offlineDb.contentTypesRef.get(REF_KEY);
      return row?.data ?? SEED_CONTENT_TYPES;
    },
  },

  writingStats: {
    summary: async (days = 90) => computeWritingSummary(days),
    byBook: async (days = 90) => computeWritingByBook(days),
    byChapter: async (bookId, days = 90) =>
      computeWritingByChapter(bookId, days),
  },

  authors: {
    list: async ({ search, limit = 200 } = {}) => {
      let rows = await offlineDb.authors.toArray();
      if (search?.trim()) {
        const query = search.trim().toLowerCase();
        rows = rows.filter((author) => author.name.toLowerCase().includes(query));
      }
      rows.sort((left, right) => left.name.localeCompare(right.name));
      return rows.slice(0, limit).map(normalizeAuthorRow);
    },
    get: async (id) => {
      const row = await offlineDb.authors.get(id);
      if (!row) notFound("Author", id);
      return normalizeAuthorRow(row);
    },
    create: async (data: AuthorCreate) => {
      const row = buildAuthor(data, newId());
      await offlineDb.authors.add(row);
      return row;
    },
    update: async (id, data: AuthorUpdate) =>
      serializedUpdate("authors", id, async () => {
        const existing = await offlineDb.authors.get(id);
        if (!existing) notFound("Author", id);
        const merged: Author = normalizeAuthorRow({
          ...existing,
          ...data,
          id,
          updated_at: nowIso(),
        });
        await offlineDb.authors.put(merged);
        return merged;
      }),
    delete: async (id) => {
      await offlineDb.authors.delete(id);
    },
  },

  // Publishing surfaces are backend-only: offline these reads return the
  // empty defaults the editor expects (no publications, no platform
  // schemas) so opening an article offline never fires a doomed `/api`
  // request. The publish MUTATIONS are not seam-routed (they push to
  // external platforms via the desktop backend).
  storyBible: {
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
      const position = await offlineDb.storyEntities
        .where("book_id")
        .equals(bookId)
        .count();
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
      const entity = (await offlineDb.storyEntities.get(
        entityId,
      )) as unknown as StoryEntityOut | undefined;
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
  },

  // Picture-book pages over the existing pages table.
  assets: {
    list: async (bookId) => {
      await ensureSeeded();
      const rows = await offlineDb.assets
        .where("bookId")
        .equals(bookId)
        .toArray();
      return rows.map(assetRowToMeta);
    },
    upload: async (bookId, file, assetType) => {
      const row = await storeAssetBlob(
        bookId,
        sanitizeAssetName(file.name),
        file,
        file.type || "application/octet-stream",
        assetType,
      );
      return assetRowToMeta(row);
    },
    delete: async (_bookId, assetId) => {
      await ensureSeeded();
      await offlineDb.assets.delete(assetId);
    },
    getBlob: async (bookId, filename) => {
      await ensureSeeded();
      const row = await offlineDb.assets
        .where("[bookId+filename]")
        .equals([bookId, filename])
        .first();
      return row ? new Blob([row.data], { type: row.mimeType }) : null;
    },
    cacheBlob: async (bookId, filename, blob, assetType = "figure") => {
      await storeAssetBlob(
        bookId,
        filename,
        blob,
        blob.type || "application/octet-stream",
        assetType,
      );
    },
  },

  covers: {
    upload: async (bookId, file) => {
      const extension = (file.name.split(".").pop() || "png").toLowerCase();
      const filename = `cover-${bookId}.${extension}`;
      await storeAssetBlob(
        bookId,
        filename,
        file,
        file.type || `image/${extension}`,
        "cover",
      );
      const dims = await imageDimensions(file);
      const response: CoverUploadResponse = {
        cover_image: `assets/covers/${filename}`,
        filename,
        width: dims.width,
        height: dims.height,
        aspect_ratio: dims.width ? Number((dims.height / dims.width).toFixed(4)) : 0,
        size_bytes: file.size,
      };
      return response;
    },
    delete: async (bookId) => {
      const ids = (await offlineDb.assets
        .where("bookId")
        .equals(bookId)
        .filter((row) => row.assetType === "cover")
        .primaryKeys()) as string[];
      if (ids.length) await offlineDb.assets.bulkDelete(ids);
    },
  },

};
