/**
 * Build a filesystem-safe slug from a free-text title for use as a download
 * filename stem.
 *
 * Rules (in order):
 * - lowercase
 * - whitespace runs collapse to a single hyphen
 * - German umlauts and eszett are KEPT verbatim (ä, ö, ü, ß) — German users
 *   expect "Über uns" → `über-uns`, not `ueber-uns` or `ber-uns`
 * - every other character outside `[a-z0-9-]` (plus the kept umlauts) is dropped
 * - repeated hyphens collapse to one; leading/trailing hyphens are trimmed
 *
 * A degenerate input (empty, or made entirely of stripped characters) returns
 * the empty string so callers can apply their own fallback.
 *
 * No application imports, no network, no framework — usable in any browser app.
 *
 * @param title - The free-text title to slugify.
 * @returns The slug, or `""` when the input has no usable characters.
 *
 * @example
 * ```ts
 * slugify("Mein Erstes Buch");        // "mein-erstes-buch"
 * slugify("Über uns!");               // "über-uns"
 * slugify("  Straße   2  ");          // "straße-2"
 * slugify("***");                     // ""  (caller applies a fallback)
 * const filename = `${slugify(book.title) || "audiobook"}.mp3`;
 * ```
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9äöüß-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
