/**
 * Offline AI-template apply primitives (offline AI 1b, #34 P4).
 *
 * A faithful TypeScript port of the field-application logic in
 * `backend/app/ai/template_schema.py` (`apply_field`,
 * `is_template_value_empty`, `is_column_populated`) plus the AI-response
 * parser from `backend/app/routers/article_ai_fill.py`
 * (`_parse_ai_yaml_fragment`).
 *
 * Two deliberate divergences from the backend, both consequences of running
 * against the browser/Dexie entity shape instead of the SQLAlchemy column shape:
 *
 * 1. JSON, not YAML. The browser has no YAML parser; the offline AI prompts
 *    request a JSON object (mirroring the 1a marketing path, where keywords
 *    already come back as a JSON array). `parseAiObject` therefore strips code
 *    fences and runs `JSON.parse`.
 * 2. Lists are native arrays. The backend stores `tags` / `keywords` as
 *    JSON-text and `json.dumps`-es on write; the Dexie/API entity carries them
 *    as `string[]`. So `applyField` writes the array directly and the
 *    populated-check measures array length rather than decoding JSON text.
 *
 * `extractBodyText` mirrors the backend's plain-text TipTap walker (raw text
 * concatenation, no list/heading/image markers) rather than reusing
 * `utils/tiptap-markdown.nodeToPlainText`, so the LLM sees the same body shape
 * the backend prompts were tuned against.
 */

/** Apply result for one field, mirroring the backend's three reasons. */
export const APPLY_UPDATED = "updated";
export const APPLY_SKIP_EMPTY = "value-is-empty";
export const APPLY_SKIP_POPULATED = "field-already-populated";

export type ApplyResult =
  | typeof APPLY_UPDATED
  | typeof APPLY_SKIP_EMPTY
  | typeof APPLY_SKIP_POPULATED;

/** A mutable entity record (Dexie/API article or book shape). */
export type EntityRecord = Record<string, unknown>;

/**
 * Walk a serialised TipTap doc and return concatenated plain text. Returns
 * `""` on parse failure or empty input. Mirrors
 * `template_schema.extract_body_text`.
 */
export function extractBodyText(contentJson: string | null | undefined): string {
  if (!contentJson) return "";
  let doc: unknown;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return "";
  }
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") parts.push(record.text);
    const children = record.content;
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(doc);
  return parts.filter(Boolean).join("\n").trim();
}

/**
 * An AI- or template-supplied value is "empty" (always skip on apply) when it
 * is null/undefined, a whitespace-only string, or an empty array. Mirrors
 * `is_template_value_empty`.
 */
export function isTemplateValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Whether the current entity column is non-empty; `force=false` preserves it.
 * Operates on the native Dexie/API shape: list columns are real arrays, scalar
 * columns are strings. Mirrors `is_column_populated`, minus the JSON-decode
 * step (the browser shape never stores JSON-text lists).
 */
export function isColumnPopulated(value: unknown, isList: boolean): boolean {
  if (isList) return Array.isArray(value) && value.length > 0;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return Boolean(value);
}

/**
 * Apply a single field to an entity record (mutates `record` in place on an
 * update). Returns the apply reason. Mirrors `apply_field`:
 * - empty `newValue`: always skip, regardless of `force`;
 * - existing column populated + `force=false`: skip;
 * - otherwise: write (the value is assigned directly, arrays included).
 */
export function applyField(
  record: EntityRecord,
  columnName: string,
  newValue: unknown,
  opts: { force: boolean; isList: boolean },
): ApplyResult {
  if (isTemplateValueEmpty(newValue)) return APPLY_SKIP_EMPTY;
  const existing = record[columnName];
  if (!opts.force && isColumnPopulated(existing, opts.isList)) {
    return APPLY_SKIP_POPULATED;
  }
  record[columnName] = newValue;
  return APPLY_UPDATED;
}

/**
 * Parse an LLM response into a JSON object. Strips an optional ``` / ```json
 * code fence, then `JSON.parse`s. When the model wraps the object in prose, a
 * fallback slices from the first `{` to the last `}`. Returns `{}` on any
 * failure or a non-object result, so the caller treats the class as having
 * produced nothing usable. Mirrors `_parse_ai_yaml_fragment`'s contract,
 * adapted to JSON.
 */
export function parseAiObject(text: string): Record<string, unknown> {
  if (!text) return {};
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split(/\r?\n/);
    if (lines.length && lines[0].startsWith("```")) lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    cleaned = lines.join("\n").trim();
  }
  const asObject = (parsed: unknown): Record<string, unknown> =>
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  try {
    return asObject(JSON.parse(cleaned));
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return asObject(JSON.parse(cleaned.slice(start, end + 1)));
      } catch {
        return {};
      }
    }
    return {};
  }
}
