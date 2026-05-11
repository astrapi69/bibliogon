/**
 * Format the active filter set of an Articles / Books dashboard into
 * a single human-readable string for the bulk-delete confirm dialog.
 *
 * Example output (de):
 *
 *   "Suche=\"deutsch\", Status=Entwurf, Sprache=de"
 *
 * Returns ``null`` when no filter is active so callers can omit the
 * filter clause entirely (the dialog's filter block is hidden when
 * the description is null).
 *
 * Designed as a pure function — easy to unit-test, no React deps —
 * because the same shape powers both the Articles dashboard
 * (status / topic / series / tag / language / search) and the Books
 * dashboard (genre / language / search). Sort fields are intentionally
 * NOT surfaced: they don't change the set of items being deleted.
 */
import type { ArticleFilters } from "../hooks/useArticleFilters";
import type { BookFilters } from "../hooks/useBookFilters";

type Translator = (key: string, fallback?: string) => string;


export function formatActiveArticleFilters(
    f: ArticleFilters,
    t: Translator,
): string | null {
    if (!f.hasActiveFilters) return null;
    const parts: string[] = [];
    if (f.searchQuery) {
        parts.push(
            `${t("ui.bulk_delete.filter_search", "Suche")}="${f.searchQuery}"`,
        );
    }
    if (f.status !== "all") {
        const label = t(`ui.articles.status_${f.status}`, f.status);
        parts.push(`${t("ui.bulk_delete.filter_status", "Status")}=${label}`);
    }
    if (f.topic) {
        parts.push(`${t("ui.bulk_delete.filter_topic", "Topic")}=${f.topic}`);
    }
    if (f.language) {
        parts.push(`${t("ui.bulk_delete.filter_language", "Sprache")}=${f.language}`);
    }
    if (f.series) {
        parts.push(`${t("ui.bulk_delete.filter_series", "Serie")}=${f.series}`);
    }
    if (f.tag) {
        parts.push(`${t("ui.bulk_delete.filter_tag", "Tag")}=${f.tag}`);
    }
    return parts.length > 0 ? parts.join(", ") : null;
}


export function formatActiveBookFilters(
    f: BookFilters,
    t: Translator,
): string | null {
    if (!f.hasActiveFilters) return null;
    const parts: string[] = [];
    if (f.searchQuery) {
        parts.push(
            `${t("ui.bulk_delete.filter_search", "Suche")}="${f.searchQuery}"`,
        );
    }
    if (f.genre) {
        parts.push(`${t("ui.bulk_delete.filter_genre", "Genre")}=${f.genre}`);
    }
    if (f.language) {
        parts.push(`${t("ui.bulk_delete.filter_language", "Sprache")}=${f.language}`);
    }
    return parts.length > 0 ? parts.join(", ") : null;
}
