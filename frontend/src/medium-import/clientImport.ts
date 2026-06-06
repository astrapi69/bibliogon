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
  MediumImportPreviewItem,
  MediumImportPreviewResponse,
} from "../api/client";
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

/** First ~120 chars of a post's body text (for comment preview rows). */
function bodyPreview(doc: TipTapDoc, max = 120): string {
  const bits: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") bits.push(obj.text);
    if (Array.isArray(obj.content)) obj.content.forEach(walk);
  };
  walk(doc);
  const text = bits.join(" ").trim();
  return text.length > max ? text.slice(0, max) : text;
}
