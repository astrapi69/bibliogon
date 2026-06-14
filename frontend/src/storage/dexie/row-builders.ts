import {
  EMPTY_DOC,
  OfflineBookRow,
  nowIso,
  offlineDb,
} from "./schema";
import type {
  Article,
  Author,
  AuthorCreate,
  Page,
  StoryEntityOut,
} from "../../api/client";

export function buildBook(
  data: import("../../api/client").BookCreate,
  id: string,
): OfflineBookRow {
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

export function buildArticle(
  data: import("../../api/client").ArticleCreate,
  id: string,
): Article {
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
