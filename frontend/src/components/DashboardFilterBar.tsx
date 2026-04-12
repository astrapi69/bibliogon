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
import * as Select from "@radix-ui/react-select";
import {ChevronDownIcon} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import type {BookFilters, SortField} from "../hooks/useBookFilters";

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
            style={isStack ? styles.stack : styles.row}
        >
            {/* Search */}
            <div style={isStack ? styles.searchStack : styles.searchRow}>
                <Search size={16} style={{color: "var(--text-muted)", flexShrink: 0}}/>
                <input
                    className="input"
                    data-testid="filter-search-input"
                    value={filters.searchQuery}
                    onChange={(e) => filters.setSearchQuery(e.target.value)}
                    placeholder={t("ui.dashboard.search_placeholder", "Suche nach Titel, Autor, Genre oder Sprache...")}
                    style={{border: "none", background: "transparent", flex: 1, padding: "4px 0"}}
                />
                {filters.hasActiveFilters && (
                    <button
                        className="btn-icon btn-sm"
                        data-testid="filter-reset"
                        onClick={filters.resetFilters}
                        title={t("ui.dashboard.reset_filters", "Filter zurücksetzen")}
                        style={{flexShrink: 0}}
                    >
                        <X size={14}/>
                    </button>
                )}
            </div>

            {/* Dropdowns + sort */}
            <div style={isStack ? styles.controlsStack : styles.controlsRow}>
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
                <div style={{display: "flex", gap: 2, flexShrink: 0}}>
                    {SORT_FIELDS.map((field) => (
                        <button
                            key={field}
                            className="btn btn-ghost btn-sm"
                            data-testid={`filter-sort-${field}`}
                            style={{
                                padding: "2px 8px",
                                fontSize: "0.6875rem",
                                ...(filters.sortBy === field
                                    ? {background: "var(--accent-light)", color: "var(--accent)"}
                                    : {}),
                            }}
                            onClick={() => filters.setSortBy(field)}
                        >
                            {sortLabel(field)}
                        </button>
                    ))}
                    <button
                        className="btn-icon btn-sm"
                        data-testid="filter-sort-direction"
                        onClick={filters.toggleSortOrder}
                        title={filters.sortOrder === "asc"
                            ? t("ui.dashboard.sort_asc", "Aufsteigend")
                            : t("ui.dashboard.sort_desc", "Absteigend")}
                        style={{padding: 2}}
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
    // Radix Select does not support empty-string as a value natively,
    // so we use a sentinel "__all__" for "no filter" and convert on
    // the boundary.
    const radixValue = value || "__all__";
    const handleChange = (v: string) => onChange(v === "__all__" ? "" : v);

    return (
        <Select.Root value={radixValue} onValueChange={handleChange}>
            <Select.Trigger
                className="radix-select-trigger"
                data-testid={`${testId}-trigger`}
                style={{fontSize: "0.8125rem", padding: "4px 10px", minWidth: 120}}
            >
                <Select.Value/>
                <Select.Icon><ChevronDownIcon size={14}/></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Content
                    className="radix-select-content"
                    position="popper"
                    sideOffset={4}
                >
                    <Select.Viewport>
                        <Select.Item
                            value="__all__"
                            className="radix-select-item"
                            data-testid={`${testId}-item-all`}
                        >
                            <Select.ItemText>{allLabel}</Select.ItemText>
                        </Select.Item>
                        {options.map((opt) => (
                            <Select.Item
                                key={opt.value}
                                value={opt.value}
                                className="radix-select-item"
                                data-testid={`${testId}-item-${opt.value}`}
                            >
                                <Select.ItemText>{opt.label}</Select.ItemText>
                            </Select.Item>
                        ))}
                    </Select.Viewport>
                </Select.Content>
            </Select.Portal>
        </Select.Root>
    );
}

const styles: Record<string, React.CSSProperties> = {
    row: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "0 0 12px",
    },
    stack: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
    },
    searchRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
    },
    searchStack: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
    },
    controlsRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
    },
    controlsStack: {
        display: "flex",
        flexDirection: "column",
        gap: 12,
    },
};
