import { useEffect, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";

import type { PortfolioFormatEntry } from "../../api/platform";
import { useI18n } from "../../hooks/useI18n";
import { RadixSelect } from "../shared/RadixSelect";
import { portfolioTestId } from "./portfolioTestIds";
import { statusLabelKey } from "./portfolioLabels";

export interface PortfolioFormatCellProps {
    bookId: string;
    entry: PortfolioFormatEntry;
    /** Canonical status set, as the backend reports it. */
    statuses: string[];
    /** Whether this format counts as a gap for its book. */
    isGap: boolean;
    /** A write for this book is in flight; the controls lock. */
    busy: boolean;
    onStatusChange: (bookFormat: string, status: string) => void;
    onStoreUrlSave: (bookFormat: string, storeUrl: string) => void;
}

/**
 * One cell of the portfolio matrix: the format's retail status, its
 * store link and the ASIN the book already carries.
 *
 * The status is a direct select - one interaction, one write - because
 * the board's job is to move a format from "missing" to "live" in as
 * few clicks as possible. The store URL is the one field long enough to
 * need a real input, so it hides behind an edit toggle instead of
 * sitting open in every cell of the grid.
 *
 * The ASIN is read-only here on purpose: it lives on the book's own
 * `asin_*` column, which the KDP plugin also reads, so editing it from
 * the board would need the book metadata editor's validation rather
 * than a bare text box.
 */
export function PortfolioFormatCell({
    bookId,
    entry,
    statuses,
    isGap,
    busy,
    onStatusChange,
    onStoreUrlSave,
}: PortfolioFormatCellProps) {
    const { t } = useI18n();
    const [editing, setEditing] = useState(false);
    const [draftUrl, setDraftUrl] = useState(entry.store_url ?? "");

    useEffect(() => {
        setDraftUrl(entry.store_url ?? "");
    }, [entry.store_url]);

    const bookFormat = entry.book_format;

    function save(): void {
        onStoreUrlSave(bookFormat, draftUrl.trim());
        setEditing(false);
    }

    return (
        <td
            className="border-b border-border border-l-4 border-l-transparent p-2 align-top data-[gap=true]:border-l-warning"
            data-testid={portfolioTestId.cell(bookId, bookFormat)}
            data-gap={isGap ? "true" : "false"}
            data-status={entry.status}
        >
            <div className="flex flex-col gap-1.5">
                <RadixSelect
                    value={entry.status}
                    onValueChange={(next) => onStatusChange(bookFormat, next)}
                    options={statuses.map((status) => ({
                        value: status,
                        label: t(...statusLabelKey(status)),
                    }))}
                    testId={portfolioTestId.cellStatus(bookId, bookFormat)}
                    disabled={busy}
                    ariaLabel={t("ui.portfolio.status_label", "Status")}
                    className="min-h-11"
                />

                {editing ? (
                    <div className="flex flex-col gap-1.5">
                        <input
                            type="url"
                            className="input min-h-11"
                            value={draftUrl}
                            placeholder={t("ui.portfolio.store_url_placeholder", "Shop-Link")}
                            aria-label={t("ui.portfolio.store_url", "Shop-Link")}
                            data-testid={portfolioTestId.cellUrl(bookId, bookFormat)}
                            onChange={(event) => setDraftUrl(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") save();
                                if (event.key === "Escape") setEditing(false);
                            }}
                        />
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                className="btn btn-primary btn-sm min-h-11"
                                data-testid={portfolioTestId.cellUrlSave(bookId, bookFormat)}
                                disabled={busy}
                                onClick={save}
                            >
                                {t("ui.common.save", "Speichern")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm min-h-11"
                                data-testid={portfolioTestId.cellUrlCancel(bookId, bookFormat)}
                                onClick={() => {
                                    setDraftUrl(entry.store_url ?? "");
                                    setEditing(false);
                                }}
                            >
                                {t("ui.common.cancel", "Abbrechen")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        {entry.store_url ? (
                            <a
                                href={entry.store_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-11 items-center gap-1 text-xs text-primary underline"
                                data-testid={portfolioTestId.cellLink(bookId, bookFormat)}
                            >
                                <ExternalLink size={12} />
                                {t("ui.portfolio.open_store", "Shop")}
                            </a>
                        ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                                {t("ui.portfolio.no_store_url", "kein Link")}
                            </span>
                        )}
                        <button
                            type="button"
                            className="btn-icon"
                            data-testid={portfolioTestId.cellEdit(bookId, bookFormat)}
                            aria-label={t("ui.portfolio.edit_store_url", "Shop-Link bearbeiten")}
                            title={t("ui.portfolio.edit_store_url", "Shop-Link bearbeiten")}
                            onClick={() => setEditing(true)}
                        >
                            <Pencil size={14} />
                        </button>
                    </div>
                )}

                {entry.asin ? (
                    <span
                        className="font-mono text-[0.6875rem] text-[var(--text-muted)]"
                        data-testid={portfolioTestId.cellAsin(bookId, bookFormat)}
                    >
                        {entry.asin}
                    </span>
                ) : null}
            </div>
        </td>
    );
}
