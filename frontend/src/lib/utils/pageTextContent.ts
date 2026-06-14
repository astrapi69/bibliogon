import type { JSONContent } from "@tiptap/core";
import type { PageLayout } from "../../api/client";

/**
 * Picture-book page text (de)serialization helpers.
 *
 * Extracted from `PageCanvas.tsx` (Batch 1 god-file burn-down). Pure,
 * framework-free functions: no React, no storage, no network. They
 * convert between `Page.text_content` (a stringified field) and TipTap
 * `JSONContent`, and harvest plain text from either shape.
 *
 * App-bound (TipTap doc shape + the `PageLayout` union), so this lives
 * under `lib/utils/` rather than the cross-app `shared/`.
 */

/**
 * Layouts whose text region is edited as rich TipTap content (large
 * text regions where formatting matters) rather than a plain textarea.
 */
const TIPTAP_LAYOUTS: ReadonlySet<PageLayout> = new Set([
  "image_top_text_bottom",
  "image_left_text_right",
  "text_only",
  // Mirror layouts inherit the TipTap text-content shape from their
  // geometric parents. image_full_no_text has NO text region, so it is
  // deliberately absent.
  "image_bottom_text_top",
  "image_right_text_left",
]);

/**
 * Whether `layout` edits its text as rich TipTap content.
 *
 * @example
 * ```ts
 * if (isTipTapLayout(page.layout)) renderRichEditor();
 * ```
 */
export function isTipTapLayout(layout: PageLayout): boolean {
  return TIPTAP_LAYOUTS.has(layout);
}

/**
 * Parse a stringified `page.text_content` into a TipTap JSON doc.
 *
 * Legacy plain-text rows are wrapped into a minimal TipTap doc on first
 * read (no Alembic migration; backward-compat lives here). Returns
 * `null` for empty input.
 */
export function parseTextContentToJson(
  textContent: string | null | undefined,
): JSONContent | null {
  if (!textContent) return null;
  // Heuristic: TipTap JSON always starts with `{`. Anything else is
  // legacy plain text.
  const trimmed = textContent.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(textContent);
      if (parsed && typeof parsed === "object" && parsed.type === "doc") {
        return parsed as JSONContent;
      }
      // Fall through to wrap: parsed but not a TipTap doc.
    } catch {
      // Fall through to wrap: invalid JSON.
    }
  }
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: textContent }],
      },
    ],
  };
}

/** Serialize a TipTap JSON doc back to a `page.text_content` string. */
export function serializeJsonToText(json: JSONContent | null): string | null {
  if (!json) return null;
  return JSON.stringify(json);
}

/**
 * Extract plain text from a `page.text_content` value regardless of
 * whether it is a legacy plain string OR a JSON-shaped TipTap doc.
 *
 * Walking strategy: recursively descend `content` arrays, harvest every
 * `text` field, and join paragraph/heading boundaries with newlines.
 * Lossy by design — formatting marks are dropped, which is the correct
 * shape for the Tier-Property textarea (a small plain input). On
 * non-JSON or malformed JSON, the string is returned as-is.
 *
 * @example
 * ```ts
 * const draft = extractPlainText(page.text_content);
 * ```
 */
export function extractPlainText(
  textContent: string | null | undefined,
): string {
  if (!textContent) return "";
  const trimmed = textContent.trimStart();
  if (!trimmed.startsWith("{")) return textContent;
  let parsed: unknown;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    return textContent;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: unknown }).type !== "doc"
  ) {
    return textContent;
  }
  const pieces: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      text?: string;
      content?: unknown[];
    };
    if (n.type === "text" && typeof n.text === "string") {
      pieces.push(n.text);
      return;
    }
    if (Array.isArray(n.content)) {
      const before = pieces.length;
      for (const child of n.content) walk(child);
      // Insert a newline between paragraph-shaped children so the
      // textarea preserves visual block boundaries.
      if (n.type === "paragraph" || n.type?.startsWith("heading")) {
        if (pieces.length > before) pieces.push("\n");
      }
    }
  };
  walk(parsed);
  return pieces.join("").replace(/\n+$/, "");
}
