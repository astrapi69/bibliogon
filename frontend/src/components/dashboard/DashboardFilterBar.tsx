/**
 * Filter bar for the dashboard. Contains: search input, genre
 * dropdown, language dropdown, sort buttons with direction toggle,
 * and a reset button. Used by both the inline desktop layout and
 * the responsive filter sheet.
 *
 * The ``layout`` prop switches between "row" (horizontal, inline
 * on desktop) and "stack" (vertical, inside the mobile sheet).
 * Both render the same Radix Select dropdowns and the same sort
 * buttons - no duplicated JSX.
 */

import {Search, X, ChevronUp, ChevronDown} from "lucide-react";
import {RadixSelect} from "../RadixSelect";
import {useI18n} from "../../hooks/useI18n";
import type {BookFilters, SortField} from "../../hooks/book/useBookFilters";
import SearchClearButton from "../SearchClearButton";
import styles from "../DashboardFilterBar.module.css";

interface Props {
    filters: BookFilters;
    layout?: "row" | "stack";
}

const SORT_FIELDS: SortField[] = ["date", "title", "author"];

export default function DashboardFilterBar({filters, layout = "row"}: Props) {
    const {t} = useI18n();
    const isStack = layout === "stack";

    const sortLabel = (field: SortField): string => {
        if (field === "date") return t("ui.dashboard.sort_date", "Datum");
        if (field === "title") return t("ui.dashboard.sort_title", "Titel");
        return t("ui.dashboard.sort_author", "Autor");
    };

    return (
        <div
            data-testid="filter-bar"
            className={isStack ? styles.stack : styles.row}
        >
            {/* Search */}
            <div className={isStack ? styles.searchStack : styles.searchRow}>
                <Search size={16} className={styles.searchIcon}/>
                <input
                    id="dashboard-filter-search"
                    name="dashboard-filter-search"
                    className={`input ${styles.searchInput}`}
                    data-testid="filter-search-input"
                    type="search"
                    value={filters.searchQuery}
                    onChange={(e) => filters.setSearchQuery(e.target.value)}
                    placeholder={t("ui.dashboard.search_placeholder", "Suche nach Titel, Autor, Genre oder Sprache...")}
                />
                <SearchClearButton
                    value={filters.searchQuery}
                    onClear={() => filters.setSearchQuery("")}
                    className={`btn-icon btn-sm ${styles.resetBtn}`}
                    data-testid="filter-search-clear"
                />
                {filters.hasActiveFilters && (
                    <button
                        className={`btn-icon btn-sm ${styles.resetBtn}`}
                        data-testid="filter-reset"
                        onClick={filters.resetFilters}
                        title={t("ui.dashboard.reset_filters", "Filter zurücksetzen")}
                    >
                        <X size={14}/>
                    </button>
                )}
            </div>

            {/* Dropdowns + sort */}
            <div className={isStack ? styles.controlsStack : styles.controlsRow}>
                {/* Genre */}
                <FilterSelect
                    testId="filter-genre"
                    value={filters.genre}
                    onChange={filters.setGenre}
                    allLabel={t("ui.dashboard.all_genres", "Alle Genres")}
                    options={filters.availableGenres}
                />

                {/* Language */}
                <FilterSelect
                    testId="filter-language"
                    value={filters.language}
                    onChange={filters.setLanguage}
                    allLabel={t("ui.dashboard.all_languages", "Alle Sprachen")}
                    options={filters.availableLanguages}
                />

                {/* Sort */}
                <div className={styles.sortGroup}>
                    {SORT_FIELDS.map((field) => (
                        <button
                            key={field}
                            className={`btn btn-ghost btn-sm ${styles.sortBtn} ${filters.sortBy === field ? styles.sortBtnActive : ""}`}
                            data-testid={`filter-sort-${field}`}
                            onClick={() => filters.setSortBy(field)}
                        >
                            {sortLabel(field)}
                        </button>
                    ))}
                    <button
                        className={`btn-icon btn-sm ${styles.sortDirBtn}`}
                        data-testid="filter-sort-direction"
                        onClick={filters.toggleSortOrder}
                        title={filters.sortOrder === "asc"
                            ? t("ui.dashboard.sort_asc", "Aufsteigend")
                            : t("ui.dashboard.sort_desc", "Absteigend")}
                    >
                        {filters.sortOrder === "asc"
                            ? <ChevronUp size={14}/>
                            : <ChevronDown size={14}/>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- FilterSelect (reusable Radix Select with an "all" option) ---

function FilterSelect({testId, value, onChange, allLabel, options}: {
    testId: string;
    value: string;
    onChange: (v: string) => void;
    allLabel: string;
    options: {value: string; label: string}[];
}) {
    // Delegates to the canonical RadixSelect, which owns the
    // empty-value "__all__" sentinel handling (allOption). 2026-05-30
    // component-consistency sweep (Session 2B): removed the local
    // raw-Radix duplicate.
    return (
        <RadixSelect
            value={value}
            onValueChange={onChange}
            testId={testId}
            className={styles.selectTrigger}
            allOption={{label: allLabel}}
            options={options}
        />
    );
}
