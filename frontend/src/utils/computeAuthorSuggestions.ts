import type {Article, Author} from "../api/client"

/** Compute the deduplicated suggestion pool for the wizard's
 *  Step-2 author datalist (Bug 8 Phase 2).
 *
 *  Combines two sources:
 *
 *  1. The ``author`` field of every selected Article. These are
 *     "likely relevant" because the user just selected those
 *     articles to convert into a book — the author of the source
 *     material is the most probable author of the resulting book.
 *  2. The global Authors-Database (entries created via the
 *     Settings → "Autoren-Datenbank" tab, Bug 8 Phase 1).
 *
 *  Dedup rules:
 *
 *  - Trim leading + trailing whitespace before comparing.
 *  - Case-insensitive: "Asterios" and "asterios" collide.
 *  - First-seen wins: when two strings collide, the one
 *    encountered first in the merge keeps its display form
 *    (because Article-authors come first in the iteration,
 *    the article casing wins over the DB casing for shared
 *    entries — which matches user expectation that "this is
 *    how I wrote it on the article" is the canonical form).
 *
 *  Sort order: Article-authors first (more contextually
 *  relevant for the current conversion), then DB-only entries
 *  in their original list order. Within each group, insertion
 *  order is preserved (which mirrors the order the user sees
 *  in the Settings UI for the DB tail).
 *
 *  Skipped values: null author fields, empty strings, all-
 *  whitespace strings.
 */
export function computeAuthorSuggestions(
    selectedArticles: ReadonlyArray<Pick<Article, "author">>,
    globalAuthors: ReadonlyArray<Pick<Author, "name">>,
): string[] {
    const seen = new Set<string>() // case-insensitive trim-aware key
    const ordered: string[] = []

    const add = (raw: string | null | undefined): void => {
        const trimmed = (raw ?? "").trim()
        if (!trimmed) return
        const key = trimmed.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        ordered.push(trimmed)
    }

    for (const article of selectedArticles) add(article.author)
    for (const author of globalAuthors) add(author.name)

    return ordered
}
