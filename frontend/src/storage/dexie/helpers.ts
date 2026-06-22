/**
 * Shared DexieStorage helpers — builders, id/time minting, word counting,
 * writing-history aggregation, asset/blob storage, and the cross-namespace
 * cascade + markdown helpers. Imported by the namespace modules; depends
 * only on the schema (no namespace module imports back here).
 */

import type {
    Article,
    ArticleComment,
    Asset,
    Author,
    AuthorCreate,
    Page,
    StoryEntityLinkOut,
    StoryEntityOut,
    WritingBookStats,
    WritingChapterStats,
    WritingStatsSummary,
} from "../../api/client";
import { ensureSeeded } from "./seed";
import {
    type ArticleAssetRow,
    type AssetRow,
    type CommentRow,
    type GraphRow,
    offlineDb,
    type OfflineBookRow,
    type WritingSessionRow,
} from "./schema";

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => crypto.randomUUID();
export const EMPTY_DOC = '{"type":"doc","content":[]}';

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export function buildBook(data: import("../../api/client").BookCreate, id: string): OfflineBookRow {
    const ts = nowIso();
    return {
        id,
        book_type: data.book_type ?? "prose",
        status: data.status ?? "draft",
        title: data.title,
        subtitle: data.subtitle ?? null,
        author: data.author ?? null,
        language: data.language ?? "de",
        genre: data.genre ?? null,
        series: data.series ?? null,
        series_index: data.series_index ?? null,
        description: data.description ?? null,
        book_idea: null,
        expose: null,
        edition: null,
        publisher: null,
        publisher_city: null,
        publish_date: null,
        isbn_ebook: null,
        isbn_paperback: null,
        isbn_hardcover: null,
        asin_ebook: null,
        asin_paperback: null,
        asin_hardcover: null,
        keywords: [],
        categories: [],
        bisac_codes: [],
        html_description: null,
        backpage_description: null,
        backpage_author_bio: null,
        cover_image: null,
        custom_css: null,
        notes: null,
        repository_url: null,
        ai_assisted: false,
        ai_tokens_used: 0,
        tts_engine: null,
        tts_voice: null,
        tts_language: null,
        tts_speed: null,
        audiobook_merge: null,
        audiobook_filename: null,
        audiobook_overwrite_existing: false,
        audiobook_skip_chapter_types: [],
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
    };
}

export function buildArticle(data: import("../../api/client").ArticleCreate, id: string): Article {
    const ts = nowIso();
    return {
        id,
        title: data.title,
        subtitle: data.subtitle ?? null,
        author: data.author ?? null,
        language: data.language ?? "de",
        content_type: data.content_type ?? "blogpost",
        // Match the ArticleOut API shape exactly: the Pydantic decoder always
        // populates these (metadata -> {}, comments_count -> 0,
        // original_published_at -> null for a native article with no
        // publications). Leaving them undefined offline diverges from the
        // online shape and is the kind of gap that surfaces as a downstream
        // render crash, so seed the same defaults the backend would.
        article_metadata: data.article_metadata ?? {},
        content_json: EMPTY_DOC,
        status: "draft",
        canonical_url: null,
        featured_image_url: null,
        excerpt: null,
        tags: [],
        topic: null,
        seo_title: null,
        seo_description: null,
        series: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        original_published_at: null,
        comments_count: 0,
    };
}

/** Client-side slug from a name (lowercase, hyphenated, diacritics folded),
 *  mirroring the server's slug shape closely enough for offline use. Empty
 *  input falls back to "author". */
export function slugify(name: string): string {
    const folded = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return folded || "author";
}

export function buildAuthor(data: AuthorCreate, id: string): Author {
    const ts = nowIso();
    return {
        id,
        name: data.name,
        slug: slugify(data.name),
        bio: data.bio ?? null,
        is_profile_author: data.is_profile_author ?? false,
        created_at: ts,
        updated_at: ts,
    };
}

/** Coerce a stored author row so ``is_profile_author`` is always a
 *  boolean. Rows written before the flag existed lack the property;
 *  default them to false so the type holds and the profile badge
 *  renders correctly. */
export function normalizeAuthorRow(row: Author): Author {
    return { ...row, is_profile_author: row.is_profile_author ?? false };
}

export function buildStoryEntity(
    bookId: string,
    data: import("../../api/client").StoryEntityCreate,
    id: string,
    position: number,
): StoryEntityOut {
    const ts = nowIso();
    return {
        id,
        book_id: bookId,
        entity_type: data.entity_type,
        name: data.name,
        description: data.description ?? null,
        entity_metadata: data.entity_metadata ?? {},
        image_asset_id: data.image_asset_id ?? null,
        position,
        relationships: data.relationships ?? [],
        created_at: ts,
        updated_at: ts,
    };
}

export function buildPage(
    bookId: string,
    data: import("../../api/client").PageCreate,
    id: string,
    position: number,
): Page {
    const ts = nowIso();
    return {
        id,
        book_id: bookId,
        position,
        layout: data.layout,
        text_content: data.text_content ?? null,
        image_asset_id: data.image_asset_id ?? null,
        layout_config: data.layout_config ?? null,
        notes: data.notes ?? null,
        story_beat: data.story_beat ?? null,
        mood_color: data.mood_color ?? null,
        act_group: data.act_group ?? null,
        created_at: ts,
        updated_at: ts,
    };
}

export function notFound(kind: string, id: string): never {
    throw new Error(`${kind} not available offline: ${id}`);
}

/** Hard-delete a set of books and cascade their child rows in one
 *  transaction (IndexedDB has no foreign keys). Used by the permanent
 *  paths (permanent-delete / empty-trash / bulk-delete with
 *  permanent=true); the plain `delete` is a soft-delete and never
 *  cascades, so a restore brings the whole graph back. */
export async function hardDeleteBooks(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await offlineDb.transaction(
        "rw",
        [
            offlineDb.books,
            offlineDb.chapters,
            offlineDb.pages,
            offlineDb.chapterLabels,
            offlineDb.writingSessions,
            offlineDb.storyEntities,
            offlineDb.assets,
        ],
        async () => {
            await offlineDb.books.bulkDelete(ids);
            await offlineDb.chapters.where("book_id").anyOf(ids).delete();
            await offlineDb.pages.where("book_id").anyOf(ids).delete();
            await offlineDb.chapterLabels.where("book_id").anyOf(ids).delete();
            await offlineDb.writingSessions.where("book_id").anyOf(ids).delete();
            await offlineDb.storyEntities.where("book_id").anyOf(ids).delete();
            await offlineDb.assets.where("bookId").anyOf(ids).delete();
        },
    );
}

/** Ids of all books currently in the trash (deleted_at set). */
export async function trashedBookIds(): Promise<string[]> {
    const rows = await offlineDb.books.toArray();
    return rows.filter((b) => b.deleted_at).map((b) => b.id);
}

/** Drop the offline-only `deleted_at` so the returned shape matches the API
 *  `ArticleComment` exactly. */
export function stripDeletedAt(row: CommentRow): ArticleComment {
    const { deleted_at: _deleted_at, ...comment } = row;
    return comment;
}

/** Wrap a comment's plain body text in a minimal TipTap doc (used when a
 *  reclassified comment has no `body_json`). */
export function commentTextToDoc(text: string): string {
    return JSON.stringify({
        type: "doc",
        content: text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [],
    });
}

// --- writing-history stats (Finding 6) -----------------------------------

/** Today as an ISO calendar date (``YYYY-MM-DD``, UTC), matching the
 *  ``writing_sessions.day`` grain. */
function todayIsoDate(): string {
    return nowIso().slice(0, 10);
}

/** Shift an ISO calendar date by ``n`` days (UTC-stable). */
function addDaysIso(iso: string, n: number): string {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
}

/** First day of an inclusive ``days``-day window ending today. */
function windowStartIso(days: number, today: string): string {
    return addDaysIso(today, -(Math.max(1, days) - 1));
}

/** Flatten a TipTap node tree to plain text for word counting (mirrors
 *  the backend ``_flatten_tiptap``; join char is irrelevant to a
 *  whitespace word split). */
function flattenWritingText(node: unknown): string {
    if (typeof node !== "object" || node === null) return "";
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    const content = record.content;
    if (!Array.isArray(content)) return "";
    return content.map(flattenWritingText).join(" ");
}

/** Word count of a chapter's stored content (TipTap JSON string or legacy
 *  plain text), mirroring the backend ``count_words``. */
export function countWords(content: string | null | undefined): number {
    const raw = (content ?? "").trim();
    if (!raw) return 0;
    let plain = raw;
    if (raw.startsWith("{")) {
        try {
            plain = flattenWritingText(JSON.parse(raw));
        } catch {
            plain = raw;
        }
    }
    const tokens = plain.split(/\s+/).filter(Boolean);
    return tokens.length;
}

/** Add ``delta`` gross words (floored at 0) to today's
 *  ``(book_id, chapter_id)`` session, upserting the row. Mirrors the
 *  backend ``record_progress``. */
export async function recordWritingProgress(
    bookId: string,
    chapterId: string,
    delta: number,
): Promise<void> {
    const words = Math.max(0, delta);
    const day = todayIsoDate();
    const rows = (await offlineDb.writingSessions
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as WritingSessionRow[];
    const existing = rows.find((row) => row.chapter_id === chapterId && row.day === day);
    if (existing) {
        await offlineDb.writingSessions.update(existing.id, {
            words_written: (existing.words_written ?? 0) + words,
        } as Partial<GraphRow>);
    } else {
        const row: WritingSessionRow = {
            id: newId(),
            day,
            words_written: words,
            book_id: bookId,
            chapter_id: chapterId,
        };
        await offlineDb.writingSessions.add(row as unknown as GraphRow);
    }
}

/** All offline writing-session rows in the typed shape. */
async function allWritingSessionRows(): Promise<WritingSessionRow[]> {
    return (await offlineDb.writingSessions.toArray()) as unknown as WritingSessionRow[];
}

/** Global per-day word totals across all books/chapters (day -> words). */
export async function aggregateGlobalByDay(): Promise<Map<string, number>> {
    const byDay = new Map<string, number>();
    for (const row of await allWritingSessionRows()) {
        byDay.set(row.day, (byDay.get(row.day) ?? 0) + Math.max(0, row.words_written ?? 0));
    }
    return byDay;
}

/** ``(current, longest)`` streaks over the set of active (net-positive)
 *  day strings, mirroring the backend ``_compute_streaks``. */
function computeWritingStreaks(activeDays: Set<string>, today: string): [number, number] {
    if (!activeDays.size) return [0, 0];
    let longest = 0;
    for (const day of activeDays) {
        if (activeDays.has(addDaysIso(day, -1))) continue;
        let length = 1;
        let cursor = day;
        while (activeDays.has(addDaysIso(cursor, 1))) {
            cursor = addDaysIso(cursor, 1);
            length += 1;
        }
        longest = Math.max(longest, length);
    }
    let current = 0;
    let cursor = activeDays.has(today) ? today : addDaysIso(today, -1);
    while (activeDays.has(cursor)) {
        current += 1;
        cursor = addDaysIso(cursor, -1);
    }
    return [current, longest];
}

/** Global summary stats over the window (mirrors ``summary_stats``). */
export async function computeWritingSummary(days: number): Promise<WritingStatsSummary> {
    const today = todayIsoDate();
    const start = windowStartIso(days, today);
    const byDay = await aggregateGlobalByDay();
    const daily = [...byDay.entries()]
        .filter(([day]) => day >= start && day <= today)
        .map(([day, words_written]) => ({ day, words_written }))
        .sort((a, b) => a.day.localeCompare(b.day));
    const total = daily.reduce((sum, d) => sum + d.words_written, 0);
    const positive = daily.filter((d) => d.words_written > 0);
    const daysActive = positive.length;
    const avg = daysActive ? Math.round(total / daysActive) : 0;
    const best = positive.length
        ? positive.reduce((m, d) => (d.words_written > m.words_written ? d : m))
        : null;
    const [current, longest] = computeWritingStreaks(new Set(positive.map((d) => d.day)), today);
    return {
        total_words: total,
        days_active: daysActive,
        avg_per_active_day: avg,
        best_day: best,
        current_streak: current,
        longest_streak: longest,
        daily,
    };
}

/** Per-book totals + daily series over the window, most words first
 *  (mirrors ``per_book_totals``). Sessions whose book is absent locally
 *  are skipped, matching the server's inner join on Book. */
export async function computeWritingByBook(days: number): Promise<WritingBookStats[]> {
    const today = todayIsoDate();
    const start = windowStartIso(days, today);
    const titleOf = new Map((await offlineDb.books.toArray()).map((book) => [book.id, book.title]));
    const perBookDay = new Map<string, Map<string, number>>();
    for (const row of await allWritingSessionRows()) {
        if (!row.book_id || row.day < start || row.day > today) continue;
        const dayMap = perBookDay.get(row.book_id) ?? new Map<string, number>();
        dayMap.set(row.day, (dayMap.get(row.day) ?? 0) + Math.max(0, row.words_written ?? 0));
        perBookDay.set(row.book_id, dayMap);
    }
    const result: WritingBookStats[] = [];
    for (const [bookId, dayMap] of perBookDay) {
        const title = titleOf.get(bookId);
        if (title === undefined) continue;
        const daily = [...dayMap.entries()]
            .map(([day, words_written]) => ({ day, words_written }))
            .sort((a, b) => a.day.localeCompare(b.day));
        const total = daily.reduce((sum, d) => sum + d.words_written, 0);
        result.push({
            book_id: bookId,
            book_title: title,
            total_words: total,
            daily,
        });
    }
    result.sort((a, b) => b.total_words - a.total_words);
    return result;
}

/** Per-chapter totals for one book over the window, most words first;
 *  deleted-chapter words collapse into a single null-id bucket (mirrors
 *  ``per_chapter_totals``). */
export async function computeWritingByChapter(
    bookId: string,
    days: number,
): Promise<WritingChapterStats[]> {
    const today = todayIsoDate();
    const start = windowStartIso(days, today);
    const titleOf = new Map(
        (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).map((chapter) => [
            chapter.id,
            chapter.title,
        ]),
    );
    const perChapter = new Map<string, number>();
    let deletedTotal = 0;
    for (const row of await allWritingSessionRows()) {
        if (row.book_id !== bookId || row.day < start || row.day > today) continue;
        const words = Math.max(0, row.words_written ?? 0);
        if (!row.chapter_id || !titleOf.has(row.chapter_id)) {
            deletedTotal += words;
            continue;
        }
        perChapter.set(row.chapter_id, (perChapter.get(row.chapter_id) ?? 0) + words);
    }
    const result: WritingChapterStats[] = [...perChapter.entries()].map(([chapterId, total]) => ({
        chapter_id: chapterId,
        chapter_title: titleOf.get(chapterId) ?? "",
        total_words: total,
    }));
    result.sort((a, b) => b.total_words - a.total_words);
    if (deletedTotal) {
        result.push({
            chapter_id: null,
            chapter_title: "",
            total_words: deletedTotal,
        });
    }
    return result;
}

// --- asset / blob storage ------------------------------------------------

/** Map an IndexedDB asset row to the API `Asset` shape components expect
 *  (the server-only `path` is irrelevant offline). */
export function assetRowToMeta(row: AssetRow): Asset {
    return {
        id: row.id,
        book_id: row.bookId,
        filename: row.filename,
        asset_type: row.assetType,
        path: "",
        uploaded_at: row.createdAt,
    };
}

/** Reduce a client filename to a safe basename, mirroring the backend's
 *  `safe_upload_filename` so the offline-minted URL stays stable. */
export function sanitizeAssetName(name: string): string {
    const base = name.split(/[\\/]/).pop() || "asset";
    return base.replace(/[^A-Za-z0-9._-]/g, "_") || "asset";
}

/** Best-effort intrinsic dimensions of an image blob (0 when the env has
 *  no `createImageBitmap`, e.g. happy-dom). */
export async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    try {
        const bitmap = await createImageBitmap(blob);
        const dims = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return dims;
    } catch {
        return { width: 0, height: 0 };
    }
}

/** Upsert an asset blob keyed by (bookId, filename). Mirrors the backend's
 *  overwrite-by-filename: any existing row for the same pair is dropped
 *  first, so a re-upload replaces rather than duplicates. Exported so the
 *  offline-download byte-fetch + the lazy online cache reuse it. */
export async function storeAssetBlob(
    bookId: string,
    filename: string,
    blob: Blob,
    mimeType: string,
    assetType: string,
    id?: string,
): Promise<AssetRow> {
    await ensureSeeded();
    const data = await blobToArrayBuffer(blob);
    const existing = (await offlineDb.assets
        .where("[bookId+filename]")
        .equals([bookId, filename])
        .primaryKeys()) as string[];
    if (existing.length) await offlineDb.assets.bulkDelete(existing);
    const row: AssetRow = {
        // The offline-download byte-fetch passes the SERVER asset id so the
        // id-served picture-book / collage URLs (`/assets/{id}/file`) resolve;
        // fresh uploads mint a uuid.
        id: id ?? newId(),
        bookId,
        filename,
        mimeType,
        assetType,
        data,
        createdAt: nowIso(),
    };
    await offlineDb.assets.put(row);
    return row;
}

/** Store an article featured-image blob (#157), keyed by a generated id.
 *  Returns the row so callers can read back the minted `id` to set on
 *  `Article.featured_image_asset_id`. Exported for the Medium-import CDN
 *  cache and the offline upload path. */
export async function storeArticleAssetBlob(
    articleId: string,
    blob: Blob,
    filename: string,
    mimeType: string,
    id?: string,
): Promise<ArticleAssetRow> {
    // No ensureSeeded(): article assets have no seed dependency (Dexie
    // auto-opens on first table access).
    const data = await blobToArrayBuffer(blob);
    const row: ArticleAssetRow = {
        id: id ?? newId(),
        articleId,
        filename,
        mimeType,
        data,
        createdAt: nowIso(),
    };
    await offlineDb.articleAssets.put(row);
    return row;
}

/** Whether a (bookId, filename) asset blob is already cached. Lets the lazy
 *  online-view cache skip a redundant re-download. */
export async function hasAssetBlob(bookId: string, filename: string): Promise<boolean> {
    const count = await offlineDb.assets
        .where("[bookId+filename]")
        .equals([bookId, filename])
        .count();
    return count > 0;
}

/** Read a Blob/File into an ArrayBuffer, with a FileReader fallback for
 *  environments whose Blob lacks `.arrayBuffer()`. */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

// --- story-bible helpers -------------------------------------------------

/** Attach each link's full entity (skipping links whose entity was deleted),
 *  matching the API's embedded-entity link shape. */
export async function embedLinkEntities(
    links: StoryEntityLinkOut[],
): Promise<StoryEntityLinkOut[]> {
    const out: StoryEntityLinkOut[] = [];
    for (const link of links) {
        const entity = (await offlineDb.storyEntities.get(link.entity_id)) as unknown as
            | StoryEntityOut
            | undefined;
        if (entity) out.push({ ...link, entity });
    }
    return out;
}

/** Render a book's story entities as Markdown, grouped by entity type, for
 *  the offline Story-Bible export (mirrors the backend C12 export shape). */
export function storyBibleToMarkdown(entities: StoryEntityOut[]): string {
    if (!entities.length) return "# Story Bible\n\n(empty)\n";
    const byType = new Map<string, StoryEntityOut[]>();
    for (const entity of entities) {
        const list = byType.get(entity.entity_type) ?? [];
        list.push(entity);
        byType.set(entity.entity_type, list);
    }
    const lines: string[] = ["# Story Bible", ""];
    for (const [type, list] of byType) {
        lines.push(`## ${type}`, "");
        for (const entity of list.sort((a, b) => a.position - b.position)) {
            lines.push(`### ${entity.name}`, "");
            if (entity.description?.trim()) lines.push(entity.description.trim(), "");
        }
    }
    return lines.join("\n").trim() + "\n";
}
