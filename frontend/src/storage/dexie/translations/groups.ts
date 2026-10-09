/**
 * Translation groups for DexieStorage (#746): the flat sibling set that
 * ties a book to its translations in other languages.
 *
 * Faithful mirror of `app/services/translation_groups.py`. The group is
 * flat - no master, no hierarchy - so the whole feature is one id shared
 * by every member, and the three operations are what that id needs:
 *
 * - `link` folds the named books into one group. When some of them are
 *   already grouped, the lexicographically smallest existing id wins, so
 *   a replay of the same link produces the same id rather than a new one
 *   each time. Fewer than two books is a no-op: a group of one is not a
 *   group.
 * - `unlink` removes one book, and clears the lone survivor too when the
 *   group falls to a single member - for the same reason.
 * - `list` returns the OTHER members, ordered by language then title, so
 *   the badge row is stable regardless of insertion order.
 *
 * The membership lives in its own `translationGroups` table rather than
 * on the book row: the API's `Book` shape carries no
 * `translation_group_id`, and inventing one on the Dexie side only would
 * make the two modes' book rows differ.
 */

import type { Book, TranslationLinkResult, TranslationSiblingsResponse } from "../../../api/client";
import type { IStorageService } from "../../types";
import { newId } from "../helpers";
import { offlineDb } from "../schema";

/** One book's membership row. `book_id` is the key: a book is in at most one group. */
export interface TranslationGroupRow {
    book_id: string;
    group_id: string;
}

async function groupIdOf(bookId: string): Promise<string | null> {
    const row = await offlineDb.translationGroups.get(bookId);
    return row?.group_id ?? null;
}

async function membersOf(groupId: string): Promise<string[]> {
    const rows = await offlineDb.translationGroups.where("group_id").equals(groupId).toArray();
    return rows.map((row) => row.book_id);
}

export const translations: IStorageService["translations"] = {
    list: async (bookId) => {
        const groupId = await groupIdOf(bookId);
        const empty: TranslationSiblingsResponse = {
            book_id: bookId,
            translation_group_id: groupId,
            siblings: [],
        };
        if (!groupId) return empty;
        const siblingIds = (await membersOf(groupId)).filter((id) => id !== bookId);
        const books = (await offlineDb.books.bulkGet(siblingIds)).filter(
            (book): book is Book => Boolean(book) && !(book as Book).deleted_at,
        );
        const siblings = books
            .map((book) => ({
                book_id: book.id,
                title: book.title,
                language: book.language ?? "",
            }))
            // Mirrors the server's sort: language first, title as the
            // tiebreak, and a book with no language sorts last rather than
            // first (the server's "~" sentinel).
            .sort((a, b) =>
                (a.language || "~").localeCompare(b.language || "~") ||
                a.title.localeCompare(b.title),
            );
        return { ...empty, siblings };
    },

    link: async (bookIds) => {
        const none: TranslationLinkResult = { translation_group_id: null, linked_book_ids: [] };
        const existing = (await offlineDb.books.bulkGet(bookIds)).filter(
            (book): book is Book => Boolean(book),
        );
        if (existing.length < 2) return none;

        const validIds = existing.map((book) => book.id);
        const currentGroups = (
            await Promise.all(validIds.map((id) => groupIdOf(id)))
        ).filter((id): id is string => Boolean(id));
        const groupId = currentGroups.length ? [...new Set(currentGroups)].sort()[0] : newId();

        // Everything already in one of the merged groups moves too, not
        // just the books named in this call - otherwise a merge of two
        // pairs would leave half of each behind.
        const merging = new Set(validIds);
        for (const other of new Set(currentGroups)) {
            for (const member of await membersOf(other)) merging.add(member);
        }
        await offlineDb.translationGroups.bulkPut(
            [...merging].map((book_id) => ({ book_id, group_id: groupId })),
        );
        return { translation_group_id: groupId, linked_book_ids: validIds };
    },

    unlink: async (bookId) => {
        const groupId = await groupIdOf(bookId);
        if (!groupId) return;
        await offlineDb.translationGroups.delete(bookId);
        const remaining = await membersOf(groupId);
        if (remaining.length === 1) {
            await offlineDb.translationGroups.delete(remaining[0]);
        }
    },
};
