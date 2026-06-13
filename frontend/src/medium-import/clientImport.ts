/**
 * Client-side Medium import orchestrator (offline import, #34 P4).
 *
 * Mirrors the backend preview/import two-step against the storage seam so the
 * MediumImportPage works in dexie mode:
 *
 *   1. `parseMediumZip(file)` unzips the Medium HTML export in the browser
 *      (fflate), walks each `posts/*.html` file into a ParsedPost, and returns
 *      a preview shaped like `MediumImportPreviewResponse` PLUS the parsed map
 *      (kept by the caller so the import step does not re-parse).
 *   2. `importParsed(...)` (C2) creates the selected articles via
 *      `getStorage().articles.create`, dedups against existing canonical URLs,
 *      and skips comment-classified posts (no offline comment store yet).
 */

import { strFromU8, unzipSync } from "fflate";

import type {
  ArticleComment,
  ArticleStatus,
  MediumImportErroredItem,
  MediumImportImportedCommentItem,
  MediumImportImportedItem,
  MediumImportPreviewItem,
  MediumImportPreviewResponse,
  MediumImportResponse,
  MediumImportSkippedItem,
} from "../api/client";
import { getStorage } from "../storage";
import { parseMediumPost, type ParsedPost, type TipTapDoc } from "./walker";

export interface ClientMediumPreview {
  preview: MediumImportPreviewResponse;
  /** filename -> ParsedPost, consumed by importParsed without re-parsing. */
  parsed: Map<string, ParsedPost>;
}

/** Medium puts each post at `posts/<name>.html`. */
const POSTS_HTML = /(^|\/)posts\/[^/]+\.html?$/i;
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

/** Parse a Medium export ZIP entirely in the browser. Rejects on a non-ZIP
 *  file; a per-post parse failure is recorded in `errored`, never aborts. */
export async function parseMediumZip(
  file: File,
  now: number,
): Promise<ClientMediumPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("Not a valid ZIP archive");
  }

  const parsed = new Map<string, ParsedPost>();
  const items: MediumImportPreviewItem[] = [];
  const errored: { filename: string; error: string }[] = [];

  for (const [path, data] of Object.entries(entries)) {
    if (!POSTS_HTML.test(path) || data.length === 0) continue;
    const filename = path.split("/").pop() ?? path;
    try {
      const post = parseMediumPost(strFromU8(data));
      parsed.set(filename, post);
      items.push({
        filename,
        title: post.title,
        subtitle: post.subtitle,
        author: post.author,
        published_at: post.publishedAt,
        canonical_url: post.canonicalUrl,
        detected_language: post.detectedLanguage,
        classification: post.isComment ? "comment" : "article",
        // Dedup is resolved at import time (against the live Dexie articles),
        // so the preview leaves this null.
        existing_article_id: null,
        body_preview: post.isComment ? bodyPreview(post.contentDoc) : "",
        warnings: post.warnings,
      });
    } catch (err) {
      errored.push({
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    preview: {
      preview_id: crypto.randomUUID(),
      total_posts: items.length,
      items,
      errored,
      expires_at: now + PREVIEW_TTL_MS,
    },
    parsed,
  };
}

/** Settings the import step honours (subset of the backend importer's; the
 *  browser-impossible ones — image download — are dropped). */
export interface ClientImportSettings {
  defaultStatus: ArticleStatus;
  defaultLanguage: string;
  skipExistingCanonicalUrls: boolean;
}

/** Snapshot of import progress, reported once per processed post so the UI
 *  can render a determinate bar + running tally in the offline path. */
export interface ImportProgress {
  /** 1-based index of the post about to be processed. */
  current: number;
  /** Total selected posts. */
  total: number;
  /** Filename of the post about to be processed. */
  filename: string;
  /** Articles created so far (before this post). */
  imported: number;
  /** Posts skipped so far (duplicates). */
  skipped: number;
  /** Posts that errored so far. */
  errored: number;
  /** Comments created so far. */
  importedComments: number;
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

/**
 * Create the selected parsed posts as offline articles via the storage seam.
 *
 * - Comment-classified posts are skipped (no offline comment store yet) and
 *   reported under `skipped_comments`.
 * - Posts whose canonical_url already exists are skipped when
 *   `skipExistingCanonicalUrls` is on (dedup is also applied within the batch
 *   so two files sharing a URL don't both import).
 * - Each article is created then updated with the full body + SEO defaults
 *   (ArticleCreate is title-only; the rest goes through ArticleUpdate).
 *
 * Returns the same `MediumImportResponse` shape the backend returns, so the
 * existing result UI renders unchanged.
 */
export async function importParsed(
  parsed: Map<string, ParsedPost>,
  selectedFilenames: string[],
  settings: ClientImportSettings,
  onProgress?: ImportProgressCallback,
): Promise<MediumImportResponse> {
  const storage = getStorage();
  const byCanonical = new Map<string, string>();
  for (const article of await storage.articles.list()) {
    if (article.canonical_url) byCanonical.set(article.canonical_url, article.id);
  }

  const imported: MediumImportImportedItem[] = [];
  const importedComments: MediumImportImportedCommentItem[] = [];
  const skipped: MediumImportSkippedItem[] = [];
  const errored: MediumImportErroredItem[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < selectedFilenames.length; i++) {
    const filename = selectedFilenames[i];
    // Reported BEFORE processing this post, so the counts reflect the
    // posts already done. Each iteration awaits real IndexedDB writes,
    // which yield to the event loop and let the bar repaint between
    // posts (no artificial delay needed).
    onProgress?.({
      current: i + 1,
      total: selectedFilenames.length,
      filename,
      imported: imported.length,
      skipped: skipped.length,
      errored: errored.length,
      importedComments: importedComments.length,
    });
    const post = parsed.get(filename);
    if (!post) {
      errored.push({ filename, error: "not found in preview" });
      continue;
    }
    if (post.isComment) {
      // Offline data source: comment-shaped posts are created in the Dexie
      // comments store (the backend importer routes these to article_comments;
      // Medium comments are always orphans -> responds_to_article_id null).
      const comment: ArticleComment = {
        id: crypto.randomUUID(),
        author: post.author || null,
        body_text: gatherDocText(post.contentDoc),
        body_json: JSON.stringify(post.contentDoc),
        language: post.detectedLanguage ?? settings.defaultLanguage,
        published_at: post.publishedAt,
        canonical_url: post.canonicalUrl || null,
        responds_to_article_id: null,
        responds_to_url: null,
        imported_from: "medium",
        imported_at: now,
        source_filename: filename,
        created_at: now,
        updated_at: now,
      };
      const stored = await storage.comments.create(comment);
      importedComments.push({
        id: stored.id,
        filename,
        body_preview: bodyPreview(post.contentDoc),
        responds_to_article_id: null,
      });
      continue;
    }
    if (!post.canonicalUrl) {
      errored.push({ filename, error: "missing canonical URL" });
      continue;
    }
    const existingId = byCanonical.get(post.canonicalUrl);
    if (settings.skipExistingCanonicalUrls && existingId) {
      skipped.push({
        filename,
        canonical_url: post.canonicalUrl,
        existing_article_id: existingId,
      });
      continue;
    }
    try {
      const title = post.title || "(untitled)";
      const subtitle = post.subtitle || null;
      const created = await storage.articles.create({
        title,
        subtitle,
        author: post.author || null,
        language: post.detectedLanguage ?? settings.defaultLanguage,
        content_type: "blogpost",
      });
      const updated = await storage.articles.update(created.id, {
        content_json: JSON.stringify(post.contentDoc),
        status: settings.defaultStatus,
        canonical_url: post.canonicalUrl,
        seo_title: title,
        seo_description: subtitle,
        excerpt: subtitle || bodyExcerpt(post.contentDoc),
        tags: [],
      });
      byCanonical.set(post.canonicalUrl, updated.id);
      imported.push({
        id: updated.id,
        title,
        canonical_url: post.canonicalUrl,
        warnings: post.warnings,
      });
    } catch (err) {
      errored.push({
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    imported_count: imported.length,
    skipped_count: skipped.length,
    errored_count: errored.length,
    imported,
    skipped,
    errored,
    imported_comments_count: importedComments.length,
    skipped_comments_count: 0,
    imported_comments: importedComments,
    skipped_comments: [],
  };
}

/** Concatenated body text of a doc. */
function gatherDocText(doc: TipTapDoc): string {
  const bits: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") bits.push(obj.text);
    if (Array.isArray(obj.content)) obj.content.forEach(walk);
  };
  walk(doc);
  return bits.join(" ").trim();
}

/** First ~120 chars of a post's body text (for comment preview rows). */
function bodyPreview(doc: TipTapDoc, max = 120): string {
  const text = gatherDocText(doc);
  return text.length > max ? text.slice(0, max) : text;
}

/** Long-form display excerpt (~280 chars of body text) when there is no
 *  authored subtitle. */
function bodyExcerpt(doc: TipTapDoc, max = 280): string {
  const text = gatherDocText(doc);
  return text.length > max ? text.slice(0, max) : text;
}
