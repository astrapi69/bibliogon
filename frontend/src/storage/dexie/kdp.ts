/**
 * KDP Publishing-Wizard persistence for DexieStorage (#737): the
 * per-book `bookPublishingState` row and its `kdpReviewers` children.
 *
 * Faithful mirror of `bibliogon_kdp/publishing_state_service.py`,
 * including the three behaviours the wizard depends on and would
 * otherwise lose offline:
 *
 * - adding a reviewer auto-creates the state row, so a brand-new book
 *   can start in the ARC step;
 * - a new reviewer is `invited` and carries an `invited_at` stamp;
 * - flipping a reviewer to `reviewed` stamps `reviewed_at`, unless the
 *   caller supplied one or the row already has one.
 *
 * Unlike the server the JSON-shaped fields (`prices`,
 * `launch_checklist_state`) are stored as real objects — IndexedDB
 * stores structured values, so the Text + json-as-string convention the
 * SQLite columns need buys nothing here. The seam's shape is what both
 * sides agree on, not the storage encoding.
 */

import type {
    ArcReviewerApi,
    BookPublishingStateApi,
    BookPublishingStateGetResponse,
} from "../../api/client";
import type { IStorageService } from "../types";
import { newId, notFound } from "./helpers";
import { type GraphRow, offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

/** Fields the server JSON-encodes; stored as objects here. */
const JSON_FIELDS = new Set(["prices", "launch_checklist_state"]);

function nowIso(): string {
    return new Date().toISOString();
}

async function readState(bookId: string): Promise<BookPublishingStateApi | null> {
    const rows = await offlineDb.bookPublishingState.where("book_id").equals(bookId).toArray();
    const row = rows[0] as unknown as BookPublishingStateApi | undefined;
    return row ?? null;
}

/** The state row for `bookId`, created with server defaults if absent. */
async function ensureState(bookId: string): Promise<BookPublishingStateApi> {
    const existing = await readState(bookId);
    if (existing) return existing;
    const timestamp = nowIso();
    const row: BookPublishingStateApi = {
        id: newId(),
        book_id: bookId,
        royalty_plan: null,
        kdp_select_enrolled: false,
        kdp_select_enrollment_date: null,
        expanded_distribution: false,
        prices: {},
        launch_checklist_state: {},
        publication_target_date: null,
        last_kdp_upload_at: null,
        created_at: timestamp,
        updated_at: timestamp,
        arc_reviewers: [],
    };
    await offlineDb.bookPublishingState.add(row as unknown as GraphRow);
    return row;
}

async function reviewersOf(stateId: string): Promise<ArcReviewerApi[]> {
    const rows = await offlineDb.kdpReviewers
        .where("publishing_state_id")
        .equals(stateId)
        .toArray();
    return (rows as unknown as ArcReviewerApi[]).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
    );
}

export const kdp: IStorageService["kdp"] = {
    /**
     * The state row plus the related book's `updated_at`, which the
     * wizard compares against its own snapshot to detect a conflicting
     * edit. Offline that baseline is the local book row; a book that is
     * gone leaves it empty rather than failing the whole load, because
     * the wizard treats this read as fail-open.
     */
    getPublishingState: async (bookId) => {
        const state = await ensureStateRead(bookId);
        const book = await offlineDb.books.get(bookId);
        const response: BookPublishingStateGetResponse = {
            book_id: bookId,
            book_updated_at:
                ((book as unknown as { updated_at?: string } | undefined)?.updated_at ?? "") || "",
            state,
        };
        return response;
    },

    /**
     * Create-or-update the state row. Mirrors the server's PATCH
     * semantics: an absent row is created with defaults, and a `null`
     * in the payload means "not provided" for every field except
     * `royalty_plan`, which is explicitly nullable.
     */
    upsertPublishingState: async (bookId, payload) => {
        const base = await ensureState(bookId);
        return serializedUpdate("book_publishing_state", base.id, async () => {
            const current = (await offlineDb.bookPublishingState.get(base.id)) as unknown as
                | BookPublishingStateApi
                | undefined;
            if (!current) notFound("BookPublishingState", base.id);
            const merged = { ...current } as Record<string, unknown>;
            for (const [key, value] of Object.entries(payload)) {
                if (value === null && key !== "royalty_plan") continue;
                merged[key] = JSON_FIELDS.has(key) ? (value ?? {}) : value;
            }
            merged.updated_at = nowIso();
            const row = merged as unknown as BookPublishingStateApi;
            await offlineDb.bookPublishingState.put(row as unknown as GraphRow);
            return { ...row, arc_reviewers: await reviewersOf(row.id) };
        });
    },

    /** Reviewers for the book, oldest first. No row yet means none. */
    listReviewers: async (bookId) => {
        const state = await readState(bookId);
        return state ? reviewersOf(state.id) : [];
    },

    addReviewer: async (bookId, payload) => {
        const state = await ensureState(bookId);
        const timestamp = nowIso();
        const reviewer: ArcReviewerApi = {
            id: newId(),
            publishing_state_id: state.id,
            reviewer_name: payload.reviewer_name,
            reviewer_email: payload.reviewer_email ?? null,
            review_status: "invited",
            copy_version: null,
            review_permalink: null,
            review_text_excerpt: null,
            invited_at: timestamp,
            reviewed_at: null,
            created_at: timestamp,
            updated_at: timestamp,
        };
        await offlineDb.kdpReviewers.add(reviewer as unknown as GraphRow);
        return reviewer;
    },

    updateReviewer: async (bookId, reviewerId, payload) =>
        serializedUpdate("arc_reviewers", reviewerId, async () => {
            const reviewer = await findReviewer(bookId, reviewerId);
            const merged = { ...reviewer } as Record<string, unknown>;
            const nullable = new Set([
                "copy_version",
                "review_permalink",
                "review_text_excerpt",
                "reviewed_at",
            ]);
            for (const [key, value] of Object.entries(payload)) {
                if (value === null && !nullable.has(key)) continue;
                merged[key] = value;
            }
            if (
                payload.review_status === "reviewed" &&
                payload.reviewed_at == null &&
                reviewer.reviewed_at == null
            ) {
                merged.reviewed_at = nowIso();
            }
            merged.updated_at = nowIso();
            const row = merged as unknown as ArcReviewerApi;
            await offlineDb.kdpReviewers.put(row as unknown as GraphRow);
            return row;
        }),

    deleteReviewer: async (bookId, reviewerId) => {
        await findReviewer(bookId, reviewerId);
        await offlineDb.kdpReviewers.delete(reviewerId);
    },
};

/** Read the state row without creating one (the GET must not write). */
async function ensureStateRead(bookId: string): Promise<BookPublishingStateApi | null> {
    const state = await readState(bookId);
    if (!state) return null;
    return { ...state, arc_reviewers: await reviewersOf(state.id) };
}

/**
 * Resolve a reviewer and verify it belongs to `bookId`, so a reviewer
 * of one book cannot be edited or deleted through another book's call —
 * the same cross-book guard `_get_reviewer_or_404` applies server-side.
 */
async function findReviewer(bookId: string, reviewerId: string): Promise<ArcReviewerApi> {
    const state = await readState(bookId);
    const reviewer = (await offlineDb.kdpReviewers.get(reviewerId)) as unknown as
        | ArcReviewerApi
        | undefined;
    if (!state || !reviewer || reviewer.publishing_state_id !== state.id) {
        notFound("ArcReviewer", reviewerId);
    }
    return reviewer as ArcReviewerApi;
}
