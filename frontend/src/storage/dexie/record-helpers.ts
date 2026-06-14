import {
  AssetRow,
  CommentRow,
  GraphRow,
  WritingSessionRow,
  newId,
  nowIso,
  offlineDb,
} from "./schema";
import type {
  ArticleComment,
  Asset,
  StoryEntityLinkOut,
  StoryEntityOut,
  WritingBookStats,
  WritingChapterStats,
  WritingStatsSummary,
} from "../../api/client";

export function stripDeletedAt(row: CommentRow): ArticleComment {
  const { deleted_at: _deleted_at, ...comment } = row;
  return comment;
}

/** Wrap a comment's plain body text in a minimal TipTap doc (used when a
 *  reclassified comment has no `body_json`). */

export function commentTextToDoc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: text
      ? [{ type: "paragraph", content: [{ type: "text", text }] }]
      : [],
  });
}

// --- writing-history stats (Finding 6) -----------------------------------

/** Today as an ISO calendar date (``YYYY-MM-DD``, UTC), matching the
 *  ``writing_sessions.day`` grain. */

export function todayIsoDate(): string {
  return nowIso().slice(0, 10);
}

/** Shift an ISO calendar date by ``n`` days (UTC-stable). */

export function addDaysIso(iso: string, n: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** First day of an inclusive ``days``-day window ending today. */

export function windowStartIso(days: number, today: string): string {
  return addDaysIso(today, -(Math.max(1, days) - 1));
}

/** Flatten a TipTap node tree to plain text for word counting (mirrors
 *  the backend ``_flatten_tiptap``; join char is irrelevant to a
 *  whitespace word split). */

export function flattenWritingText(node: unknown): string {
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
  const existing = rows.find(
    (row) => row.chapter_id === chapterId && row.day === day,
  );
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

export async function allWritingSessionRows(): Promise<WritingSessionRow[]> {
  return (await offlineDb.writingSessions.toArray()) as unknown as WritingSessionRow[];
}

/** Global per-day word totals across all books/chapters (day -> words). */

export async function aggregateGlobalByDay(): Promise<Map<string, number>> {
  const byDay = new Map<string, number>();
  for (const row of await allWritingSessionRows()) {
    byDay.set(
      row.day,
      (byDay.get(row.day) ?? 0) + Math.max(0, row.words_written ?? 0),
    );
  }
  return byDay;
}

/** ``(current, longest)`` streaks over the set of active (net-positive)
 *  day strings, mirroring the backend ``_compute_streaks``. */

export function computeWritingStreaks(
  activeDays: Set<string>,
  today: string,
): [number, number] {
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

export async function computeWritingSummary(
  days: number,
): Promise<WritingStatsSummary> {
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
  const [current, longest] = computeWritingStreaks(
    new Set(positive.map((d) => d.day)),
    today,
  );
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

export async function computeWritingByBook(
  days: number,
): Promise<WritingBookStats[]> {
  const today = todayIsoDate();
  const start = windowStartIso(days, today);
  const titleOf = new Map(
    (await offlineDb.books.toArray()).map((book) => [book.id, book.title]),
  );
  const perBookDay = new Map<string, Map<string, number>>();
  for (const row of await allWritingSessionRows()) {
    if (!row.book_id || row.day < start || row.day > today) continue;
    const dayMap = perBookDay.get(row.book_id) ?? new Map<string, number>();
    dayMap.set(
      row.day,
      (dayMap.get(row.day) ?? 0) + Math.max(0, row.words_written ?? 0),
    );
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
    (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).map(
      (chapter) => [chapter.id, chapter.title],
    ),
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
  const result: WritingChapterStats[] = [...perChapter.entries()].map(
    ([chapterId, total]) => ({
      chapter_id: chapterId,
      chapter_title: titleOf.get(chapterId) ?? "",
      total_words: total,
    }),
  );
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

export async function imageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
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

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Attach each link's full entity (skipping links whose entity was deleted),
 *  matching the API's embedded-entity link shape. */

export async function embedLinkEntities(
  links: StoryEntityLinkOut[],
): Promise<StoryEntityLinkOut[]> {
  const out: StoryEntityLinkOut[] = [];
  for (const link of links) {
    const entity = (await offlineDb.storyEntities.get(
      link.entity_id,
    )) as unknown as StoryEntityOut | undefined;
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

// --- offline-download support (C3) ---------------------------------------

/** The full book graph as returned by GET /api/books/{id}/full. */
