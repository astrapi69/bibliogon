/**
 * The per-field write rules a template or an AI answer applies (#745).
 *
 * A port of `apply_field`, `is_template_value_empty` and
 * `is_column_populated` from `backend/app/ai/template_apply.py`, against
 * the browser entity shape. Two divergences from the backend, both from
 * the shape rather than the rules: lists are native arrays, not
 * JSON-text, so a write assigns the array and the populated-check
 * measures its length.
 *
 * Lived in `src/ai/templateApply.ts` until #745 stage 2 needed it from
 * `lib/`, which may not import app code. That module re-exports these
 * so the offline AI-fill path is unchanged.
 *
 * @example
 * applyField(draft, "title", "Neuer Titel", {force: false, isList: false});
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
 * An incoming value is "empty" - and therefore always skipped - when it
 * is null/undefined, a whitespace-only string, or an empty array.
 */
export function isTemplateValueEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

/**
 * Whether the current column is non-empty, which `force: false`
 * preserves. List columns are real arrays here, so there is no
 * JSON-decode step.
 */
export function isColumnPopulated(value: unknown, isList: boolean): boolean {
    if (isList) return Array.isArray(value) && value.length > 0;
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    return Boolean(value);
}

/**
 * Apply one field to a record, mutating it on a write.
 *
 * - an empty `newValue` skips, whatever `force` says;
 * - a populated column skips unless `force`;
 * - otherwise the value is assigned as-is, arrays included.
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
