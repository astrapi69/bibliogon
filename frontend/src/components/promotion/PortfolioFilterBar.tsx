import { RotateCcw } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { RadixSelect } from "../shared/RadixSelect";
import { portfolioTestId } from "./portfolioTestIds";

export interface PortfolioFilterState {
    author: string;
    language: string;
    gapsOnly: boolean;
}

export interface PortfolioFilterBarProps {
    filters: PortfolioFilterState;
    /** Pen names offered in the dropdown, from the unfiltered board. */
    authors: string[];
    /** Language codes offered in the dropdown, from the unfiltered board. */
    languages: string[];
    busy: boolean;
    onChange: (next: PortfolioFilterState) => void;
}

/**
 * Pen-name / language / gaps-only filters for the board.
 *
 * The option lists are passed in rather than derived from the rows on
 * screen: the filters run server-side, so a filtered board reports only
 * the matching pen name and deriving the options from it would strand
 * the user on their first pick.
 */
export function PortfolioFilterBar({
    filters,
    authors,
    languages,
    busy,
    onChange,
}: PortfolioFilterBarProps) {
    const { t } = useI18n();
    const active = filters.author !== "" || filters.language !== "" || filters.gapsOnly;

    return (
        <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                {t("ui.portfolio.filter_author", "Pen Name")}
                <RadixSelect
                    value={filters.author}
                    onValueChange={(author) => onChange({ ...filters, author })}
                    options={authors.map((author) => ({ value: author, label: author }))}
                    allOption={{ label: t("ui.portfolio.filter_all", "Alle") }}
                    testId={portfolioTestId.filterAuthor}
                    disabled={busy}
                    ariaLabel={t("ui.portfolio.filter_author", "Pen Name")}
                    className="min-h-11"
                />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                {t("ui.portfolio.filter_language", "Sprache")}
                <RadixSelect
                    value={filters.language}
                    onValueChange={(language) => onChange({ ...filters, language })}
                    options={languages.map((language) => ({
                        value: language,
                        label: language.toUpperCase(),
                    }))}
                    allOption={{ label: t("ui.portfolio.filter_all", "Alle") }}
                    testId={portfolioTestId.filterLanguage}
                    disabled={busy}
                    ariaLabel={t("ui.portfolio.filter_language", "Sprache")}
                    className="min-h-11"
                />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={filters.gapsOnly}
                    disabled={busy}
                    data-testid={portfolioTestId.filterGaps}
                    onChange={(event) => onChange({ ...filters, gapsOnly: event.target.checked })}
                />
                {t("ui.portfolio.filter_gaps_only", "Nur Lücken")}
            </label>

            {active ? (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-11"
                    data-testid={portfolioTestId.filterReset}
                    onClick={() => onChange({ author: "", language: "", gapsOnly: false })}
                >
                    <RotateCcw size={14} /> {t("ui.portfolio.filter_reset", "Filter zurücksetzen")}
                </button>
            ) : null}
        </div>
    );
}
