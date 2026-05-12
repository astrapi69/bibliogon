/**
 * MEDIUM-COMMENTS-UI-01 commit 5: Settings comments-admin tab.
 *
 * Cross-article admin view for imported comments. Lists comments
 * filtered by source (``imported_from``) + orphan-status, with
 * "Load more" pagination (default page size 100, server cap 500).
 *
 * Single soft-delete per row lands in commit 6; this commit ships
 * list + filter + pagination only.
 */

import {useCallback, useEffect, useState} from "react";

import {api, ApiError, type ArticleComment} from "../api/client";
import {useI18n} from "../hooks/useI18n";

const PAGE_SIZE = 100;

interface FilterState {
    importedFrom: string; // "" = all sources
    orphansOnly: boolean;
}

const DEFAULT_FILTERS: FilterState = {
    importedFrom: "",
    orphansOnly: false,
};

function formatDate(iso: string | null, lang: string): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(
            lang === "de" ? "de-DE" : "en-US",
            {day: "numeric", month: "short", year: "numeric"},
        );
    } catch {
        return iso;
    }
}

export default function CommentsAdminSection() {
    const {t, lang} = useI18n();
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [rows, setRows] = useState<ArticleComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    // ``pageLimit`` only grows; "Load more" bumps it by PAGE_SIZE.
    // The backend caps at 500, so the UI caps at 500 too.
    const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

    const fetchRows = useCallback(
        (currentFilters: FilterState, currentLimit: number) => {
            let cancelled = false;
            setLoading(true);
            setLoadError(null);
            api.comments
                .list({
                    importedFrom: currentFilters.importedFrom || undefined,
                    orphansOnly: currentFilters.orphansOnly,
                    limit: currentLimit,
                })
                .then((data) => {
                    if (!cancelled) {
                        setRows(data);
                        setLoading(false);
                    }
                })
                .catch((err) => {
                    if (cancelled) return;
                    if (err instanceof ApiError) {
                        setLoadError(err.detail);
                    } else {
                        setLoadError(
                            t(
                                "ui.comments.admin.load_error",
                                "Could not load comments",
                            ),
                        );
                    }
                    setLoading(false);
                });
            return () => {
                cancelled = true;
            };
        },
        [t],
    );

    useEffect(() => {
        const cancel = fetchRows(filters, pageLimit);
        return cancel;
    }, [filters, pageLimit, fetchRows]);

    const updateFilter = (patch: Partial<FilterState>) => {
        // Resetting the page limit on filter change is intentional:
        // a new filter shouldn't inherit the prior "load more"
        // expansions, which would otherwise produce confusing
        // mid-page jumps.
        setFilters((prev) => ({...prev, ...patch}));
        setPageLimit(PAGE_SIZE);
    };

    const showLoadMore =
        !loading &&
        rows.length === pageLimit &&
        pageLimit < 500; // backend cap

    return (
        <section data-testid="comments-admin-section">
            <h2>{t("ui.comments.admin.heading", "Imported comments")}</h2>
            <p
                style={{
                    color: "var(--text-muted, #6b7280)",
                    fontSize: "0.875rem",
                    marginTop: 4,
                }}
            >
                {t(
                    "ui.comments.admin.description",
                    "Cross-article view of comments imported from external sources.",
                )}
            </p>

            <div
                data-testid="comments-admin-filters"
                style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 16,
                    padding: 12,
                    background: "var(--surface-2, #f5f5f5)",
                    borderRadius: 6,
                }}
            >
                <label style={{display: "flex", alignItems: "center", gap: 6}}>
                    {t("ui.comments.admin.filter_source", "Source:")}
                    <select
                        data-testid="comments-admin-filter-source"
                        value={filters.importedFrom}
                        onChange={(e) =>
                            updateFilter({importedFrom: e.target.value})
                        }
                        style={{padding: "4px 8px"}}
                    >
                        <option value="">
                            {t("ui.comments.admin.filter_source_any", "Any")}
                        </option>
                        <option value="medium">Medium</option>
                        <option value="wordpress">WordPress</option>
                        <option value="hashnode">Hashnode</option>
                    </select>
                </label>

                <label style={{display: "flex", alignItems: "center", gap: 6}}>
                    <input
                        type="checkbox"
                        data-testid="comments-admin-filter-orphans"
                        checked={filters.orphansOnly}
                        onChange={(e) =>
                            updateFilter({orphansOnly: e.target.checked})
                        }
                    />
                    {t(
                        "ui.comments.admin.filter_orphans",
                        "Orphans only (no parent article)",
                    )}
                </label>
            </div>

            {loadError && (
                <div
                    data-testid="comments-admin-error"
                    style={{
                        marginTop: 16,
                        padding: "8px 12px",
                        background: "var(--danger-bg, #fef2f2)",
                        color: "var(--danger, #b91c1c)",
                        borderRadius: 6,
                        fontSize: "0.875rem",
                    }}
                >
                    {loadError}
                </div>
            )}

            {loading && rows.length === 0 && (
                <p
                    data-testid="comments-admin-loading"
                    style={{
                        marginTop: 16,
                        color: "var(--text-muted, #6b7280)",
                        fontSize: "0.875rem",
                    }}
                >
                    {t("ui.comments.admin.loading", "Loading...")}
                </p>
            )}

            {!loading && rows.length === 0 && !loadError && (
                <p
                    data-testid="comments-admin-empty"
                    style={{
                        marginTop: 16,
                        color: "var(--text-muted, #6b7280)",
                        fontSize: "0.875rem",
                        fontStyle: "italic",
                    }}
                >
                    {t(
                        "ui.comments.admin.empty",
                        "No comments match the current filters.",
                    )}
                </p>
            )}

            {rows.length > 0 && (
                <table
                    data-testid="comments-admin-table"
                    style={{
                        marginTop: 16,
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.875rem",
                    }}
                >
                    <thead>
                        <tr>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t(
                                    "ui.comments.admin.col_author",
                                    "Author",
                                )}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t("ui.comments.admin.col_body", "Body")}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t(
                                    "ui.comments.admin.col_source",
                                    "Source",
                                )}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t(
                                    "ui.comments.admin.col_status",
                                    "Status",
                                )}
                            </th>
                            <th
                                style={{
                                    textAlign: "left",
                                    borderBottom:
                                        "1px solid var(--border, #e5e7eb)",
                                    padding: "8px 6px",
                                }}
                            >
                                {t("ui.comments.admin.col_date", "Imported")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                key={row.id}
                                data-testid={`comments-admin-row-${row.id}`}
                                style={{
                                    borderBottom:
                                        "1px solid var(--border, #f3f4f6)",
                                }}
                            >
                                <td style={{padding: "6px"}}>
                                    {row.author?.trim() ||
                                        t(
                                            "ui.comments.admin.no_author",
                                            "Unknown",
                                        )}
                                </td>
                                <td
                                    style={{
                                        padding: "6px",
                                        maxWidth: 400,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                    title={row.body_text}
                                >
                                    {row.body_text}
                                </td>
                                <td style={{padding: "6px"}}>{row.imported_from}</td>
                                <td style={{padding: "6px"}}>
                                    {row.responds_to_article_id === null ? (
                                        <span
                                            data-testid={`comments-admin-row-${row.id}-orphan`}
                                            style={{
                                                color: "var(--warning, #b45309)",
                                            }}
                                        >
                                            {t(
                                                "ui.comments.admin.orphan",
                                                "Orphan",
                                            )}
                                        </span>
                                    ) : (
                                        t("ui.comments.admin.linked", "Linked")
                                    )}
                                </td>
                                <td style={{padding: "6px"}}>
                                    {formatDate(row.imported_at, lang)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {showLoadMore && (
                <div style={{marginTop: 16, textAlign: "center"}}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        data-testid="comments-admin-load-more"
                        onClick={() =>
                            setPageLimit((prev) => Math.min(prev + PAGE_SIZE, 500))
                        }
                    >
                        {t("ui.comments.admin.load_more", "Load more")}
                    </button>
                </div>
            )}
        </section>
    );
}
