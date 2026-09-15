/**
 * Shape detection for free-text fields that may hold HTML or Markdown.
 *
 * Bibliogon's book marketing fields are stored as whatever bytes arrived:
 * `html_description` comes from a `.html` sidecar, `backpage_description`
 * and `backpage_author_bio` from `.md` sidecars kept verbatim, and the
 * user can paste either shape into any of them afterwards. So the shape
 * is a property of the row, not of the column, and a consumer that wants
 * to render one of them has to ask.
 *
 * The heuristic mirrors the backend's own convention - the export
 * scaffolder decides with `content.strip().startswith("<")` - so both
 * sides of the stack classify the same value the same way rather than
 * drifting apart on two similar-but-different rules.
 *
 * Known edge: a Markdown autolink (`<https://example.com>`) starts with
 * `<` and is therefore read as HTML. That is the same blind spot the
 * backend rule has, and it is preferable to a cleverer rule that
 * disagrees with the backend on some other input.
 *
 * @example
 * looksLikeHtml("<p>Text</p>");   // true
 * looksLikeHtml("**Text**");      // false
 */
export function looksLikeHtml(value: string): boolean {
    return value.trimStart().startsWith("<");
}
