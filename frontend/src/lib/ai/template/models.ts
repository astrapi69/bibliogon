/**
 * The shape of a `.biblio.yaml` template (#745).
 *
 * Mirrors `backend/app/ai/template_models.py`. Two things carry over that a
 * plain interface would lose:
 *
 * - **Key order.** Pydantic preserves declaration order in `model_dump`,
 *   and the backend serializes with `sort_keys=False`, so the field order
 *   in that class IS the order in the file. TypeScript object literals
 *   preserve insertion order too, but a refactor can silently reorder
 *   them, so the order lives in an explicit array the serializer reads.
 * - **The three-keys-per-field contract.** `description` + `example` +
 *   `current_value`, and `current_value: null` stays in the output for an
 *   unset field. Only the optional ROOT keys (`reference`, `language`) are
 *   dropped when null.
 *
 * @example
 * const kind = templateKind(parsed); // "book" | "article"
 * for (const name of FIELD_ORDER[kind]) { ... }
 */

/** One fillable field: documentation for the assistant, plus the value. */
export interface TemplateField {
    description: string;
    example?: unknown;
    current_value?: unknown;
}

/** The read-only block the per-record export carries. Absent on an empty
 *  template, where `language` sits at the root instead. */
export interface TemplateReference {
    id: string;
    language: string;
    body_word_count: number;
    body_preview: string;
}

export type TemplateKind = "article" | "book";

export interface BiblioTemplate {
    type: TemplateKind;
    schema_version: number;
    reference?: TemplateReference | null;
    language?: string | null;
    [field: string]: unknown;
}

/** Root keys that are metadata rather than fillable fields. */
export const ROOT_KEYS = ["type", "schema_version", "reference", "language"] as const;

/** Root keys dropped from the output when null - the only keys that are,
 *  because dropping a null `current_value` would break the
 *  three-keys-per-field contract the assistant reads. */
export const OPTIONAL_ROOT_KEYS = ["reference", "language"] as const;

/** Fillable fields in file order, per kind. */
export const FIELD_ORDER: Record<TemplateKind, readonly string[]> = {
    article: [
        "title",
        "seo_title",
        "seo_description",
        "excerpt",
        "tags",
        "topic",
        "featured_image_prompt",
        "inline_image_prompts",
    ],
    book: [
        "title",
        "subtitle",
        "description",
        "genre",
        "keywords",
        "html_description",
        "backpage_description",
        "backpage_author_bio",
        "cover_image_prompt",
        "chapter_summaries",
    ],
};

/** Raised when a template fails structural validation, mirroring
 *  `TemplateSchemaError` so a caller can tell a malformed file from a
 *  transport failure. */
export class TemplateSchemaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TemplateSchemaError";
    }
}
