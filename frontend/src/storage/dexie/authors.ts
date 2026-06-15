/**
 * Authors namespace for DexieStorage: the global authors DB CRUD with
 * `is_profile_author` normalization on every read.
 */

import type { Author, AuthorCreate, AuthorUpdate } from "../../api/client";
import type { IStorageService } from "../types";
import { buildAuthor, newId, normalizeAuthorRow, nowIso, notFound } from "./helpers";
import { offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const authors: IStorageService["authors"] = {
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
};
