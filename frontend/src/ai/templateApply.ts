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
 * the backend prompts were tuned against. It now comes from
 * `lib/ai/template/bodyPreview.ts` (#745 stage 2), which adds the HTML
 * fallback the backend gained in #824: an imported article is HTML until
 * someone opens and saves it, and the version here returned "" for exactly
 * that case - so offline AI-fill was handing the model an empty body for
 * every never-opened import.
 */

/**
 * The per-field write rules now live in `lib/ai/template/applyField.ts`.
 *
 * They moved there in #745 stage 2, which needed them from `lib/` - a
 * module under `lib/` may not import app code, and two copies of the
 * same rules is the thing the move avoids. Re-exported here so every
 * existing importer is unchanged.
 */
export {
  APPLY_SKIP_EMPTY,
  APPLY_SKIP_POPULATED,
  APPLY_UPDATED,
  applyField,
  isColumnPopulated,
  isTemplateValueEmpty,
  type ApplyResult,
  type EntityRecord,
} from "../lib/ai/template/applyField";

export {extractBodyText} from "../lib/ai/template/bodyPreview";

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
