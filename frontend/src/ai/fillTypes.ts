/**
 * Shared field-class registry types for the offline aiFill path (AI 1b).
 *
 * A field-class maps one LLM call (a system+user message pair) to a group of
 * target entity columns. Mirrors the backend `_FieldClassSpec` / `_TargetSpec`
 * shape in `app/routers/{article,book}_ai_fill.py`.
 */

import type { AiChatMessage } from "./llmClient";

/** One AI-response key mapped to an entity column. `isList` selects the
 *  array-shaped populated-check / write path in `applyField`. */
export interface FillTarget {
  aiKey: string;
  column: string;
  isList: boolean;
}

/** One field-class: a message builder plus the columns its response fills. */
export interface FillClassSpec<TInput> {
  buildMessages: (input: TInput, body: string) => AiChatMessage[];
  targets: FillTarget[];
  /**
   * The book `chapter_summaries` class, which needs a step the others do
   * not: the AI answers with one entry per chapter and each has to be
   * matched back to a real chapter row before it is written, so an entry
   * can never name a chapter that does not exist. Mirrors the backend's
   * `is_chapter_summaries` flag on `_FieldClassSpec`.
   */
  isChapterSummaries?: boolean;
}
