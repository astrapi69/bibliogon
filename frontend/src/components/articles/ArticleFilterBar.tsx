import {Search, ArrowUp, ArrowDown} from "lucide-react";
import {ArticleStatus} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";
import {useArticleFilters} from "../../hooks/useArticleFilters";
import SearchClearButton from "../SearchClearButton";
import {RadixSelect} from "../RadixSelect";
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
                <SearchClearButton
                    value={filters.searchQuery}
                    onClear={() => filters.setSearchQuery("")}
                    className={`btn-icon ${layout.searchClear}`}
                    data-testid="article-list-search-clear"
                />
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
                <RadixSelect
                    value={filters.topic}
                    onValueChange={filters.setTopic}
                    testId="article-list-filter-topic"
                    className={layout.filterSelect}
                    ariaLabel={t("ui.articles.filter_topic", "Thema")}
                    allOption={{
                        label: t("ui.articles.filter_topic_any", "Alle Themen"),
                    }}
                    options={filters.availableTopics}
                />
            ) : null}

            {filters.availableLanguages.length > 1 ? (
                <RadixSelect
                    value={filters.language}
                    onValueChange={filters.setLanguage}
                    testId="article-list-filter-language"
                    className={layout.filterSelect}
                    ariaLabel={t("ui.articles.filter_language", "Sprache")}
                    allOption={{
                        label: t(
                            "ui.articles.filter_language_any",
                            "Alle Sprachen",
                        ),
                    }}
                    options={filters.availableLanguages}
                />
            ) : null}

            {filters.availableSeries.length > 0 ? (
                <RadixSelect
                    value={filters.series}
                    onValueChange={filters.setSeries}
                    testId="article-list-filter-series"
                    className={layout.filterSelect}
                    ariaLabel={t("ui.articles.filter_series_label", "Serie")}
                    allOption={{
                        label: t("ui.articles.filter_series_any", "Alle Serien"),
                    }}
                    options={filters.availableSeries}
                />
            ) : null}

            {filters.availableTags.length > 0 ? (
                <RadixSelect
                    value={filters.tag}
                    onValueChange={filters.setTag}
                    testId="article-list-filter-tag"
                    className={layout.filterSelect}
                    ariaLabel={t("ui.articles.filter_tag_label", "Tag")}
                    allOption={{
                        label: t("ui.articles.filter_tag_any", "Alle Tags"),
                    }}
                    options={filters.availableTags}
                />
            ) : null}

            <RadixSelect
                value={filters.sortBy}
                onValueChange={(next) =>
                    filters.setSortBy(next as "date" | "title" | "author")
                }
                testId="article-list-sort-by"
                className={layout.filterSelect}
                ariaLabel={t("ui.articles.sort_by", "Sortieren nach")}
                options={[
                    {value: "date", label: t("ui.articles.sort_date", "Datum")},
                    {value: "title", label: t("ui.articles.sort_title", "Titel")},
                    {
                        value: "author",
                        label: t("ui.articles.sort_author", "Autor"),
                    },
                ]}
            />
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
