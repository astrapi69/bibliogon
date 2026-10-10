/**
 * Offline aiFill orchestrator (offline AI 1b, #34 P4).
 *
 * The browser-direct equivalent of the backend `fill_article_with_ai` /
 * `fill_book_with_ai` service + their endpoint wrappers
 * (`app/routers/{article,book}_ai_fill.py`). For each requested field-class it
 * builds the prompt, calls the user's configured provider via `aiChat`, parses
 * the JSON response, applies each target via `applyField`, and persists the
 * updated columns through the storage seam. Per-class failure is isolated: one
 * provider error records under `field_class_errors` and the remaining classes
 * proceed, matching the backend.
 *
 * Returns the same `AiFillResponse` shape the online `api.*.aiFill` returns, so
 * `AITemplatePanel` consumes one result type regardless of mode. Cost is null
 * offline (no pricing table ported); the panel surfaces updated/skipped/tokens.
 */

import { getStorage } from "../storage";
import {
  AiClientError,
  aiChat,
  getAiConfig,
  isAiConfigured,
  type AiConfig,
} from "./llmClient";
import {
  APPLY_UPDATED,
  applyField,
  extractBodyText,
  parseAiObject,
  type EntityRecord,
} from "./templateApply";
import { ARTICLE_FILL_CLASSES } from "./articleFillPrompts";
import {
  reconcileChapterSummaries,
  type ChapterRef,
  type DroppedSummary,
} from "../lib/ai/template/apply";
import { BOOK_FILL_CLASSES, CHAPTER_EXCERPT_LIMIT } from "./bookFillPrompts";
import type { FillClassSpec } from "./fillTypes";
import type {
  AiFillFieldClassResult,
  AiFillRequest,
  AiFillResponse,
  ApplySkipReasons,
  Chapter,
} from "../api/client";

const MAX_TOKENS = 1024;
const TEMPERATURE = 0.6;

/** Run the configured provider for every requested class against `record`,
 *  mutating it in place. Returns the per-class + aggregate accounting. */
async function runFieldClasses<TInput>(
  config: AiConfig,
  registry: Record<string, FillClassSpec<TInput>>,
  promptInput: TInput,
  body: string,
  record: EntityRecord,
  fieldClasses: string[],
  force: boolean,
  chapters: ChapterRef[] = [],
): Promise<{
  updated: string[];
  skipped: ApplySkipReasons;
  perClass: Record<string, AiFillFieldClassResult>;
  classErrors: Record<string, string>;
  tokens: number;
  dropped: DroppedSummary[];
}> {
  const updated: string[] = [];
  const skipped: ApplySkipReasons = {};
  const perClass: Record<string, AiFillFieldClassResult> = {};
  const classErrors: Record<string, string> = {};
  const dropped: DroppedSummary[] = [];
  let tokens = 0;

  for (const className of fieldClasses) {
    const spec = registry[className];
    const messages = spec.buildMessages(promptInput, body);

    let content: string;
    let classTokens = 0;
    try {
      const chat = await aiChat(config, messages, {
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });
      content = chat.content;
      classTokens = chat.usage.total_tokens;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      classErrors[className] = message;
      perClass[className] = {
        updated: [],
        skipped: {},
        tokens: 0,
        cost_usd: null,
        error: message,
      };
      continue;
    }

    const parsed = parseAiObject(content);
    const classUpdated: string[] = [];
    const classSkipped: ApplySkipReasons = {};
    for (const target of spec.targets) {
      let value = parsed[target.aiKey];
      if (spec.isChapterSummaries) {
        // The answer names chapters; every entry is matched back to a
        // real chapter row before anything is written, so a summary can
        // never point at a chapter that does not exist. The unmatched
        // ones are reported instead (same contract as the endpoint's
        // `dropped_chapter_summaries`).
        const reconciled = reconcileChapterSummaries(chapters, value);
        dropped.push(...reconciled.dropped);
        value = reconciled.reconciled;
      }
      const result = applyField(record, target.column, value, {
        force,
        isList: target.isList,
      });
      if (result === APPLY_UPDATED) {
        classUpdated.push(target.column);
        updated.push(target.column);
      } else {
        classSkipped[target.column] = result;
        skipped[target.column] = result;
      }
    }

    perClass[className] = {
      updated: classUpdated,
      skipped: classSkipped,
      tokens: classTokens,
      cost_usd: null,
      error: null,
    };
    tokens += classTokens;
  }

  return { updated, skipped, perClass, classErrors, tokens, dropped };
}

/** Validate the requested classes against the registry, throwing on unknowns
 *  (mirrors the backend 400). */
function assertKnownClasses(
  registry: Record<string, unknown>,
  fieldClasses: string[],
): void {
  const unknown = fieldClasses.filter((name) => !(name in registry));
  if (unknown.length > 0) {
    throw new AiClientError(`Unknown field_classes: ${unknown.join(", ")}`);
  }
}

async function requireConfig(): Promise<AiConfig> {
  const config = await getAiConfig();
  if (!isAiConfigured(config)) {
    throw new AiClientError("AI is not configured");
  }
  return config;
}

/**
 * Fill an article's metadata field-classes offline. Loads the article from the
 * storage seam, runs the configured provider, applies + persists the updated
 * columns.
 */
export async function aiFillArticle(
  articleId: string,
  req: AiFillRequest,
): Promise<AiFillResponse> {
  const config = await requireConfig();
  assertKnownClasses(ARTICLE_FILL_CLASSES, req.field_classes);

  const article = await getStorage().articles.get(articleId);
  const body = extractBodyText(article.content_json);
  if (!body) {
    throw new AiClientError("Article has no content to generate from");
  }

  const force = req.force ?? false;
  const record: EntityRecord = { ...article };
  const run = await runFieldClasses(
    config,
    ARTICLE_FILL_CLASSES,
    article,
    body,
    record,
    req.field_classes,
    force,
  );

  if (run.updated.length > 0) {
    const storage = getStorage().articles;
    const patch: EntityRecord = {};
    for (const column of run.updated) patch[column] = record[column];
    await storage.update(articleId, patch as Parameters<typeof storage.update>[1]);
  }

  return {
    article_id: articleId,
    updated_fields: run.updated,
    skipped_fields: Object.keys(run.skipped),
    skip_reasons: run.skipped,
    field_class_results: run.perClass,
    field_class_errors: run.classErrors,
    tokens_used: run.tokens,
    estimated_cost_usd: null,
    force,
  };
}

/** Concatenate chapter plain text into a single excerpt (mirrors the backend
 *  `_aggregate_book_body`). */
function aggregateBookBody(chapters: Chapter[]): string {
  return chapters
    .map((chapter) => extractBodyText(chapter.content))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Fill a book's metadata field-classes offline. Loads the book + chapters from
 * the storage seam, aggregates the chapter body, runs the configured provider,
 * applies + persists the updated columns.
 */
export async function aiFillBook(
  bookId: string,
  req: AiFillRequest,
): Promise<AiFillResponse> {
  const config = await requireConfig();
  assertKnownClasses(BOOK_FILL_CLASSES, req.field_classes);

  const book = await getStorage().books.get(bookId);
  const body = aggregateBookBody(book.chapters);
  if (!body && book.chapters.length === 0) {
    throw new AiClientError("Book has no chapter content to generate from");
  }

  const force = req.force ?? false;
  const record: EntityRecord = { ...book };
  const run = await runFieldClasses(
    config,
    BOOK_FILL_CLASSES,
    // The `chapter_summaries` class asks per chapter rather than from the
    // aggregated body, so the prompt input carries the blocks.
    {
      ...book,
      chapters: book.chapters.map((chapter) => ({
        chapter_id: chapter.id,
        title: chapter.title,
        excerpt: extractBodyText(chapter.content).slice(0, CHAPTER_EXCERPT_LIMIT),
      })),
    },
    body,
    record,
    req.field_classes,
    force,
    book.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
  );

  if (run.updated.length > 0) {
    const storage = getStorage().books;
    const patch: EntityRecord = {};
    for (const column of run.updated) patch[column] = record[column];
    await storage.update(bookId, patch as Parameters<typeof storage.update>[1]);
  }

  return {
    book_id: bookId,
    updated_fields: run.updated,
    skipped_fields: Object.keys(run.skipped),
    skip_reasons: run.skipped,
    field_class_results: run.perClass,
    field_class_errors: run.classErrors,
    dropped_chapter_summaries: run.dropped,
    tokens_used: run.tokens,
    estimated_cost_usd: null,
    force,
  };
}
