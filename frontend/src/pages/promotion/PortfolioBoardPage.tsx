import { useCallback, useEffect, useState } from "react";
import { LibraryBig, RefreshCw } from "lucide-react";
import { useFeature } from "@astrapi69/feature-strategy-react";

import { api, ApiError } from "../../api/client";
import type { PortfolioBoard, PortfolioBookRow } from "../../api/platform";
import { FEATURES } from "../../features/featureConfig";
import { FeatureNotice } from "../../features/FeatureNotice";
import { useI18n } from "../../hooks/useI18n";
import { useGoBack } from "../../hooks/navigation/useGoBack";
import { notify } from "../../utils/platform/notify";
import { EmptyState } from "../../lib/components/EmptyState";
import { PageLayout } from "../../components/shared/PageLayout";
import {
    PortfolioFilterBar,
    type PortfolioFilterState,
} from "../../components/promotion/PortfolioFilterBar";
import { PortfolioMatrix } from "../../components/promotion/PortfolioMatrix";
import { portfolioTestId } from "../../components/promotion/portfolioTestIds";

const NO_FILTERS: PortfolioFilterState = { author: "", language: "", gapsOnly: false };

/**
 * Portfolio board (#810) at `/portfolio`: which of the author's books
 * exist in which retail format, and which formats are still missing.
 *
 * Replaces the hand-maintained CSV + "hardcover fehlt" prose list the
 * promotion plugin was built to retire (#782). The matrix is the whole
 * point - a per-book detail page would hide exactly the cross-book
 * comparison that makes a gap obvious.
 *
 * Writes go straight through per interaction and patch the one changed
 * row from the response rather than reloading the board, so changing a
 * status does not reshuffle the table under the cursor. The one case
 * that does need a reload is the gaps-only filter, where a fixed row can
 * legitimately leave the view.
 *
 * Desktop-only: the per-format state lives in a backend table with no
 * Dexie mirror, so offline the page explains itself (policy #78) instead
 * of rendering an empty grid. Test ids live in
 * `components/promotion/portfolioTestIds.ts`.
 */
export default function PortfolioBoardPage() {
    const { t } = useI18n();
    const board = useFeature(FEATURES.PORTFOLIO_BOARD);
    const goBack = useGoBack("/");

    const [data, setData] = useState<PortfolioBoard | null>(null);
    const [filters, setFilters] = useState<PortfolioFilterState>(NO_FILTERS);
    const [loading, setLoading] = useState(false);
    const [busyBookIds, setBusyBookIds] = useState<ReadonlySet<string>>(new Set());

    // Filter options come from the first unfiltered load. A filtered
    // board reports only the matching pen name, so deriving them from
    // the visible rows would strand the user on their first pick.
    const [options, setOptions] = useState<{ authors: string[]; languages: string[] }>({
        authors: [],
        languages: [],
    });

    const filtersActive = filters.author !== "" || filters.language !== "" || filters.gapsOnly;

    const load = useCallback(
        async (next: PortfolioFilterState): Promise<void> => {
            setLoading(true);
            try {
                const loaded = await api.promotion.portfolio({
                    author: next.author,
                    language: next.language,
                    gapsOnly: next.gapsOnly,
                });
                setData(loaded);
                const unfiltered =
                    next.author === "" && next.language === "" && !next.gapsOnly;
                if (unfiltered) {
                    setOptions({
                        authors: unique(loaded.books.map((row) => row.author)),
                        languages: unique(loaded.books.map((row) => row.language)),
                    });
                }
            } catch (err) {
                notify.error(
                    t("ui.portfolio.load_failed", "Portfolio konnte nicht geladen werden"),
                    err instanceof ApiError ? err : undefined,
                );
            } finally {
                setLoading(false);
            }
        },
        // `t` is deliberately out of the dep list: the i18n hook returns a
        // fresh `t` on every render under Vitest, so including it would
        // rebuild `load` each render and the mount effect would loop (see
        // lessons-learned "React useEffect deps + i18n test mocks"). The
        // request shape does not depend on the language; only a toast
        // fallback string does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    useEffect(() => {
        if (!board.isActive) return;
        void load(NO_FILTERS);
    }, [board.isActive, load]);

    function applyFilters(next: PortfolioFilterState): void {
        setFilters(next);
        void load(next);
    }

    /** Swap one row in place, so a write never reshuffles the table. */
    function patchRow(updated: PortfolioBookRow): void {
        setData((current) =>
            current
                ? {
                      ...current,
                      books: current.books.map((row) =>
                          row.book_id === updated.book_id ? updated : row,
                      ),
                  }
                : current,
        );
    }

    async function withBusy(bookId: string, write: () => Promise<PortfolioBookRow>): Promise<void> {
        setBusyBookIds((current) => new Set(current).add(bookId));
        try {
            patchRow(await write());
            notify.saved(t("ui.portfolio.saved", "Gespeichert"));
        } catch (err) {
            notify.error(
                t("ui.portfolio.save_failed", "Speichern fehlgeschlagen"),
                err instanceof ApiError ? err : undefined,
            );
        } finally {
            setBusyBookIds((current) => {
                const next = new Set(current);
                next.delete(bookId);
                return next;
            });
        }
    }

    const actions = board.isActive ? (
        <button
            type="button"
            className="btn-icon"
            data-testid={portfolioTestId.reload}
            aria-label={t("ui.common.refresh", "Aktualisieren")}
            title={t("ui.common.refresh", "Aktualisieren")}
            disabled={loading}
            onClick={() => void load(filters)}
        >
            <RefreshCw size={18} />
        </button>
    ) : undefined;

    return (
        <PageLayout
            title={t("ui.portfolio.title", "Portfolio")}
            testId={portfolioTestId.page}
            maxWidth="xl"
            onBack={goBack}
            backLabel={t("ui.common.back", "Zurück")}
            actions={actions}
        >
            {!board.isActive ? (
                <FeatureNotice reason={board.reason} testId={portfolioTestId.disabled} />
            ) : (
                <>
                    <p className="mb-4 text-sm text-[var(--text-muted)]">
                        {t(
                            "ui.portfolio.intro",
                            "Welches Buch existiert in welchem Format - und welches Format fehlt noch.",
                        )}
                    </p>

                    <PortfolioFilterBar
                        filters={filters}
                        authors={options.authors}
                        languages={options.languages}
                        busy={loading}
                        onChange={applyFilters}
                    />

                    {loading && !data ? (
                        <p
                            className="text-sm text-[var(--text-muted)]"
                            data-testid={portfolioTestId.loading}
                        >
                            {t("ui.common.loading", "Lädt...")}
                        </p>
                    ) : data && data.books.length > 0 ? (
                        <PortfolioMatrix
                            board={data}
                            busyBookIds={busyBookIds}
                            onStatusChange={(bookId, bookFormat, status) =>
                                void withBusy(bookId, () =>
                                    api.promotion.setFormatState(bookId, bookFormat, { status }),
                                )
                            }
                            onStoreUrlSave={(bookId, bookFormat, storeUrl) =>
                                void withBusy(bookId, () =>
                                    api.promotion.setFormatState(bookId, bookFormat, {
                                        store_url: storeUrl,
                                    }),
                                )
                            }
                            onUniversalLinkSave={(bookId, universalLink) =>
                                void withBusy(bookId, () =>
                                    api.promotion.setUniversalLink(bookId, universalLink),
                                )
                            }
                        />
                    ) : filtersActive ? (
                        <EmptyState
                            testId={portfolioTestId.noMatches}
                            title={t("ui.portfolio.no_matches_title", "Keine Treffer")}
                            body={t(
                                "ui.portfolio.no_matches_body",
                                "Kein Buch passt zu diesem Filter.",
                            )}
                        />
                    ) : (
                        <EmptyState
                            testId={portfolioTestId.empty}
                            icon={<LibraryBig size={40} />}
                            title={t("ui.portfolio.empty_title", "Noch kein Buch im Portfolio")}
                            body={t(
                                "ui.portfolio.empty_body",
                                "Sobald Bücher angelegt oder importiert sind, erscheinen sie hier mit einer Zeile pro Buch.",
                            )}
                        />
                    )}
                </>
            )}
        </PageLayout>
    );
}

/** Non-empty values, de-duplicated, alphabetically ordered. */
function unique(values: (string | null)[]): string[] {
    return Array.from(new Set(values.filter((value): value is string => !!value))).sort((a, b) =>
        a.localeCompare(b),
    );
}
