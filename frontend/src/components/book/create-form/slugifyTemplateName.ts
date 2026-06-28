/**
 * TPL-I18N-01: derive an i18n key suffix from a builtin template's
 * English name. Stable across languages because the key is built from
 * the canonical (English) name stored in the DB. Lowercase + ASCII
 * alphanum + underscore so YAML keys stay simple. Extracted from
 * CreateBookForm.tsx (#677).
 *
 * ``Children's Picture Book`` -> ``childrens_picture_book``
 * ``Sci-Fi Novel``           -> ``sci_fi_novel``
 * ``Non-Fiction / How-To``   -> ``non_fiction_how_to``
 */
export function slugifyTemplateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
