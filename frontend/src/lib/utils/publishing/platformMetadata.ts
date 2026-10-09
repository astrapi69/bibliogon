/**
 * Platform-metadata validation, mirrored from
 * `app/services/platform_schema.py` (#747).
 *
 * Pure: it reads the schema object it is handed and the metadata blob,
 * and returns the same `(valid, errors)` the backend returns. Nothing
 * here fetches the schema - the caller gets it from the storage seam,
 * which serves the seeded map offline (#1015).
 *
 * The Python stays the authority, because the backend path still runs it
 * on every create and update: a divergence would mean the same
 * publication is legal in one storage mode and rejected in the other.
 *
 * @example
 * const schemas = await getStorage().articlePlatforms.list();
 * const { valid, errors } = validatePlatformMetadata(schemas[platform], metadata);
 */

/** The parts of a platform schema this validator reads. */
export interface PlatformLimits {
  required_metadata?: string[];
  max_tags?: number | null;
  max_chars_per_post?: number | null;
}

/** `(valid, errors)` as the backend's tuple, in object form. */
export interface MetadataValidation {
  valid: boolean;
  errors: string[];
}

/**
 * The backend's emptiness test is `value is None or value == "" or value
 * == [] or value == {}`. Python's `==` on those three literals is a
 * value comparison, so an empty array and an empty object count as
 * absent while `0` and `false` do not - which this has to reproduce
 * rather than fall back to JavaScript's truthiness.
 */
function isAbsent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Thrown when metadata fails the schema, carrying the field-level
 * `errors` list rather than only a sentence.
 *
 * The online path gets that list from the endpoint's 400 body
 * (`{errors: [...]}`) and renders it under the form's fields. An offline
 * refusal has to arrive in the same shape or the panel degrades to one
 * generic line, which is the difference between "section is missing" and
 * "validation failed".
 */
export class PlatformMetadataError extends Error {
  constructor(
    public readonly platform: string,
    public readonly errors: string[],
  ) {
    super(`Invalid platform_metadata for '${platform}': ${errors.join("; ")}`);
    this.name = "PlatformMetadataError";
  }
}

export function validatePlatformMetadata(
  schema: PlatformLimits | undefined | null,
  metadata: Record<string, unknown>,
): MetadataValidation {
  // Unknown platform passes, deliberately: the user may publish to a
  // platform Bibliogon ships no schema for.
  if (!schema) return { valid: true, errors: [] };

  const errors: string[] = [];

  for (const field of schema.required_metadata ?? []) {
    if (isAbsent(metadata[field])) errors.push(`missing required field: ${field}`);
  }

  const maxTags = schema.max_tags;
  if (typeof maxTags === "number" && "tags" in metadata) {
    const tags = metadata.tags ?? [];
    if (Array.isArray(tags) && tags.length > maxTags) {
      errors.push(`tags exceed platform limit (${tags.length} > ${maxTags})`);
    }
  }

  const maxChars = schema.max_chars_per_post;
  if (typeof maxChars === "number") {
    const body = metadata.body;
    if (typeof body === "string" && body.length > maxChars) {
      errors.push(`body exceeds platform limit (${body.length} > ${maxChars} chars)`);
    }
  }

  return { valid: errors.length === 0, errors };
}
