/**
 * Pure preview/selection helpers for ConvertToBookWizard. Extracted
 * from ConvertToBookWizard.tsx; logic is byte-identical.
 */

import {
    Article,
    BookFromArticlesSortStrategy,
} from "../../../api/client"

/** Sort the article list according to a sort strategy. Pure preview
 *  logic; the backend re-sorts with the same rules so the displayed
 *  order matches the persisted chapter order. */
export function sortArticlesPreview(
    articles: Article[],
    strategy: BookFromArticlesSortStrategy,
    manualOrder: string[],
): Article[] {
    if (strategy === "manual") {
        const orderIndex = new Map(manualOrder.map((id, i) => [id, i]))
        return [...articles].sort(
            (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
        )
    }
    if (strategy === "title_asc") {
        return [...articles].sort((a, b) =>
            a.title.localeCompare(b.title, undefined, {sensitivity: "base"}),
        )
    }
    if (strategy === "title_desc") {
        return [...articles].sort((a, b) =>
            b.title.localeCompare(a.title, undefined, {sensitivity: "base"}),
        )
    }
    // date_asc / date_desc - use original_published_at, fall back to
    // created_at. Mirrors the backend.
    const dateKey = (a: Article) => a.original_published_at || a.created_at
    if (strategy === "date_desc") {
        return [...articles].sort((a, b) => dateKey(b).localeCompare(dateKey(a)))
    }
    return [...articles].sort((a, b) => dateKey(a).localeCompare(dateKey(b)))
}

/** Top tags across a selection, with article counts. Powers the
 *  "22 articles with tag X" helper in Step 0. Returns at most 5
 *  entries so the bar never grows beyond the dialog width. */
export function topTagsWithCounts(
    articles: Article[],
    limit = 5,
): Array<{tag: string; count: number}> {
    const counts = new Map<string, number>()
    for (const a of articles) {
        for (const tag of a.tags) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1)
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([tag, count]) => ({tag, count}))
}
