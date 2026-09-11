import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import type { PortfolioBoard, PortfolioBookRow } from "../../api/platform";
import { useI18n } from "../../hooks/useI18n";
import { Badge } from "../../lib/components/Badge";
import { PortfolioFormatCell } from "./PortfolioFormatCell";
import { formatLabelKey, statusLabelKey } from "./portfolioLabels";
import { portfolioTestId } from "./portfolioTestIds";

export interface PortfolioMatrixProps {
    board: PortfolioBoard;
    /** Book ids with a write in flight; their row locks. */
    busyBookIds: ReadonlySet<string>;
    onStatusChange: (bookId: string, bookFormat: string, status: string) => void;
    onStoreUrlSave: (bookId: string, bookFormat: string, storeUrl: string) => void;
    onUniversalLinkSave: (bookId: string, universalLink: string) => void;
}

/** One row's universal-link editor, kept next to the row it belongs to. */
function UniversalLinkCell({
    row,
    busy,
    onSave,
}: {
    row: PortfolioBookRow;
    busy: boolean;
    onSave: (bookId: string, universalLink: string) => void;
}) {
    const { t } = useI18n();
    const [draft, setDraft] = useState(row.universal_link ?? "");

    useEffect(() => {
        setDraft(row.universal_link ?? "");
    }, [row.universal_link]);

    const dirty = draft.trim() !== (row.universal_link ?? "");

    return (
        <td className="border-b border-border p-2 align-top">
            <div className="flex flex-col gap-1.5">
                <input
                    type="url"
                    className="input min-h-11"
                    value={draft}
                    placeholder={t("ui.portfolio.universal_link_placeholder", "books2read.com/…")}
                    aria-label={t("ui.portfolio.universal_link", "Universal-Link")}
                    data-testid={portfolioTestId.universalLink(row.book_id)}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") onSave(row.book_id, draft.trim());
                    }}
                />
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-11"
                    data-testid={portfolioTestId.universalLinkSave(row.book_id)}
                    disabled={busy || !dirty}
                    onClick={() => onSave(row.book_id, draft.trim())}
                >
                    {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </td>
    );
}

/**
 * The board itself: one row per book, one column per canonical format,
 * plus the book-level universal link.
 *
 * Both axes come from the backend response rather than from a local
 * constant, so adding a fourth format server-side grows the table
 * without a frontend change. Gap formats carry `data-gap="true"` and a
 * per-row gap summary, which is the whole reason the board exists - the
 * hand-maintained "hardcover fehlt" list it replaces was prose.
 *
 * The table scrolls horizontally in its own container: at phone width
 * four columns cannot fit, and the page body must never scroll sideways.
 */
export function PortfolioMatrix({
    board,
    busyBookIds,
    onStatusChange,
    onStoreUrlSave,
    onUniversalLinkSave,
}: PortfolioMatrixProps) {
    const { t } = useI18n();

    return (
        <div className="overflow-x-auto">
            <table
                className="w-full min-w-[44rem] border-collapse text-sm"
                data-testid={portfolioTestId.matrix}
            >
                <thead>
                    <tr className="text-left">
                        <th className="border-b border-border p-2 font-semibold">
                            {t("ui.portfolio.column_book", "Buch")}
                        </th>
                        {board.formats.map((bookFormat) => (
                            <th
                                key={bookFormat}
                                className="border-b border-border p-2 font-semibold"
                                data-testid={portfolioTestId.column(bookFormat)}
                            >
                                {t(...formatLabelKey(bookFormat))}
                            </th>
                        ))}
                        <th className="border-b border-border p-2 font-semibold">
                            {t("ui.portfolio.universal_link", "Universal-Link")}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {board.books.map((row) => {
                        const busy = busyBookIds.has(row.book_id);
                        const gaps = new Set(row.gaps);
                        return (
                            <tr key={row.book_id} data-testid={portfolioTestId.row(row.book_id)}>
                                <th
                                    scope="row"
                                    className="border-b border-border p-2 align-top text-left font-normal"
                                >
                                    <div className="flex flex-col gap-1">
                                        <span
                                            className="font-semibold"
                                            data-testid={portfolioTestId.title(row.book_id)}
                                        >
                                            {row.title}
                                        </span>
                                        <span className="text-xs text-[var(--text-muted)]">
                                            {[row.author, row.language?.toUpperCase()]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                        {row.gaps.length > 0 ? (
                                            <Badge
                                                variant="warning"
                                                size="sm"
                                                icon={<AlertTriangle size={11} />}
                                                testId={portfolioTestId.gaps(row.book_id)}
                                            >
                                                {row.gaps
                                                    .map((bookFormat) =>
                                                        t(...formatLabelKey(bookFormat)),
                                                    )
                                                    .join(", ")}
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="success"
                                                size="sm"
                                                testId={portfolioTestId.gaps(row.book_id)}
                                            >
                                                {t("ui.portfolio.no_gaps", "vollständig")}
                                            </Badge>
                                        )}
                                    </div>
                                </th>
                                {board.formats.map((bookFormat) => {
                                    const entry = row.formats.find(
                                        (candidate) => candidate.book_format === bookFormat,
                                    );
                                    if (!entry) {
                                        return (
                                            <td
                                                key={bookFormat}
                                                className="border-b border-border p-2 align-top text-xs text-[var(--text-muted)]"
                                                data-testid={portfolioTestId.cell(
                                                    row.book_id,
                                                    bookFormat,
                                                )}
                                                data-gap="false"
                                            >
                                                {t(...statusLabelKey("missing"))}
                                            </td>
                                        );
                                    }
                                    return (
                                        <PortfolioFormatCell
                                            key={bookFormat}
                                            bookId={row.book_id}
                                            entry={entry}
                                            statuses={board.statuses}
                                            isGap={gaps.has(bookFormat)}
                                            busy={busy}
                                            onStatusChange={(fmt, status) =>
                                                onStatusChange(row.book_id, fmt, status)
                                            }
                                            onStoreUrlSave={(fmt, url) =>
                                                onStoreUrlSave(row.book_id, fmt, url)
                                            }
                                        />
                                    );
                                })}
                                <UniversalLinkCell
                                    row={row}
                                    busy={busy}
                                    onSave={onUniversalLinkSave}
                                />
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
