import {Search, X as XIcon, ArrowUp, ArrowDown} from "lucide-react";
import {ArticleStatus} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";
import {useArticleFilters} from "../../hooks/useArticleFilters";
import layout from "../../pages/ArticleList.module.css";

export const STATUS_FILTERS: (ArticleStatus | "all")[] = [
    "all",
    "draft",
    "published",
    "archived",
];

export function ArticleFilterBar({filters}: {filters: ReturnType<typeof useArticleFilters>}) {
    const {t} = useI18n();

    return (
        <div data-testid="article-list-filter" className={layout.filterBar}>
            <div className={layout.searchInputWrapper}>
                <Search size={14} className={layout.searchIcon} aria-hidden />
                <input
                    type="search"
                    value={filters.searchQuery}
                    onChange={(e) => filters.setSearchQuery(e.target.value)}
                    placeholder={t("ui.articles.search_placeholder", "Suche...")}
                    data-testid="article-list-search"
                    className={layout.searchInput}
                />
                {filters.searchQuery ? (
                    <button
                        type="button"
                        className={`btn-icon ${layout.searchClear}`}
                        aria-label={t("ui.common.clear", "Löschen")}
                        onClick={() => filters.setSearchQuery("")}
                    >
                        <XIcon size={12} />
                    </button>
                ) : null}
            </div>

            {/* Status: button row, mirrors the previous quick filter so
                the existing testid contract for ``filter_${s}`` keeps
                working in smoke specs. */}
            {STATUS_FILTERS.map((s) => (
                <button
                    key={s}
                    type="button"
                    className={`btn btn-sm ${
                        s === filters.status ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => filters.setStatus(s)}
                    data-testid={`article-list-filter-${s}`}
                >
                    {t(
                        `ui.articles.filter_${s}`,
                        s === "all"
                            ? "Alle"
                            : s.charAt(0).toUpperCase() + s.slice(1),
                    )}
                </button>
            ))}

            {filters.availableTopics.length > 0 ? (
                <select
                    value={filters.topic}
                    onChange={(e) => filters.setTopic(e.target.value)}
                    data-testid="article-list-filter-topic"
                    className={layout.filterSelect}
                    aria-label={t("ui.articles.filter_topic", "Thema")}
                >
                    <option value="">
                        {t("ui.articles.filter_topic_any", "Alle Themen")}
                    </option>
                    {filters.availableTopics.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : null}

            {filters.availableLanguages.length > 1 ? (
                <select
                    value={filters.language}
                    onChange={(e) => filters.setLanguage(e.target.value)}
                    data-testid="article-list-filter-language"
                    className={layout.filterSelect}
                    aria-label={t("ui.articles.filter_language", "Sprache")}
                >
                    <option value="">
                        {t("ui.articles.filter_language_any", "Alle Sprachen")}
                    </option>
                    {filters.availableLanguages.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : null}

            {filters.availableSeries.length > 0 ? (
                <select
                    value={filters.series}
                    onChange={(e) => filters.setSeries(e.target.value)}
                    data-testid="article-list-filter-series"
                    className={layout.filterSelect}
                    aria-label={t("ui.articles.filter_series_label", "Serie")}
                >
                    <option value="">
                        {t("ui.articles.filter_series_any", "Alle Serien")}
                    </option>
                    {filters.availableSeries.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : null}

            {filters.availableTags.length > 0 ? (
                <select
                    value={filters.tag}
                    onChange={(e) => filters.setTag(e.target.value)}
                    data-testid="article-list-filter-tag"
                    className={layout.filterSelect}
                    aria-label={t("ui.articles.filter_tag_label", "Tag")}
                >
                    <option value="">
                        {t("ui.articles.filter_tag_any", "Alle Tags")}
                    </option>
                    {filters.availableTags.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : null}

            <select
                value={filters.sortBy}
                onChange={(e) =>
                    filters.setSortBy(e.target.value as "date" | "title" | "author")
                }
                data-testid="article-list-sort-by"
                className={layout.filterSelect}
                aria-label={t("ui.articles.sort_by", "Sortieren nach")}
            >
                <option value="date">{t("ui.articles.sort_date", "Datum")}</option>
                <option value="title">{t("ui.articles.sort_title", "Titel")}</option>
                <option value="author">{t("ui.articles.sort_author", "Autor")}</option>
            </select>
            <button
                type="button"
                className="btn-icon"
                onClick={filters.toggleSortOrder}
                data-testid="article-list-sort-order"
                aria-label={t("ui.articles.sort_order", "Sortierreihenfolge")}
                title={t("ui.articles.sort_order", "Sortierreihenfolge")}
            >
                {filters.sortOrder === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </button>

            {filters.hasActiveFilters ? (
                <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={filters.resetFilters}
                    data-testid="article-list-filter-clear"
                >
                    {t("ui.articles.reset_filters", "Filter zurücksetzen")}
                </button>
            ) : null}
        </div>
    );
}
