/**
 * MEDIUM-COMMENTS-UI-01 commit 3: read-only sidebar panel for
 * imported article comments.
 *
 * Comments are short reply-shaped responses imported by per-source
 * plugins (Medium is the first; WordPress + Hashnode can follow
 * without UI changes). The panel renders each comment as a small
 * card with author + date + plain-text body. Plain-text rendering
 * is deliberate for v1: by the heuristic's definition every
 * imported comment has no structural elements (no headings,
 * no lists, no images), so a CSS `white-space: pre-wrap` on the
 * body is enough. body_json stays in the schema for a future
 * rich-renderer commit if user demand emerges.
 *
 * Deletion is intentionally NOT exposed here. The editor view
 * stays focused on writing; orphan / unwanted-comment cleanup
 * lives in the Settings comments-admin tab (commit 5 + 6).
 */

import {useEffect, useState} from "react";

import {api, ApiError, type ArticleComment} from "../../api/client";
import {getStorage} from "../../storage";
import {useI18n} from "../../hooks/useI18n";
import {formatLocaleDate} from "../../utils/formatDate";

interface Props {
    articleId: string;
}

function formatDate(iso: string | null, lang: string): string {
    return formatLocaleDate(iso, lang);
}

export default function ArticleCommentsPanel({articleId}: Props) {
    const {t, lang} = useI18n();
    const [comments, setComments] = useState<ArticleComment[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (getStorage().mode === "dexie") {
            setComments([]);
            return;
        }
        let cancelled = false;
        setLoadError(null);
        api.articles
            .getComments(articleId)
            .then((rows) => {
                if (!cancelled) setComments(rows);
            })
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof ApiError) {
                    setLoadError(err.detail);
                } else {
                    setLoadError(
                        t(
                            "ui.comments.editor.load_error",
                            "Could not load comments",
                        ),
                    );
                }
                setComments([]);
            });
        return () => {
            cancelled = true;
        };
    }, [articleId, t]);

    // Hide the section completely until the first fetch resolves
    // (the loading state is intentionally invisible - the panel is
    // a low-stakes sidebar surface, a spinner here would be noise).
    if (comments === null && loadError === null) return null;

    return (
        <div data-testid="article-comments-panel">
            <h4
                className="layout-section-heading"
                data-testid="article-comments-panel-heading"
            >
                {t("ui.comments.editor.heading", "Comments")}
                {comments && comments.length > 0 && (
                    <span
                        data-testid="article-comments-panel-count"
                        style={{
                            marginLeft: 8,
                            fontSize: "0.85em",
                            color: "var(--text-muted, #6b7280)",
                            fontWeight: "normal",
                        }}
                    >
                        ({comments.length})
                    </span>
                )}
            </h4>

            {loadError !== null && (
                <div
                    data-testid="article-comments-panel-error"
                    style={{
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

            {comments !== null && comments.length === 0 && loadError === null && (
                <p
                    data-testid="article-comments-panel-empty"
                    style={{
                        color: "var(--text-muted, #6b7280)",
                        fontSize: "0.875rem",
                        fontStyle: "italic",
                    }}
                >
                    {t(
                        "ui.comments.editor.empty",
                        "No comments imported for this article.",
                    )}
                </p>
            )}

            {comments !== null && comments.length > 0 && (
                <ul
                    data-testid="article-comments-panel-list"
                    style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    {comments.map((c) => (
                        <li
                            key={c.id}
                            data-testid={`article-comment-${c.id}`}
                            style={{
                                border: "1px solid var(--border, #e5e7eb)",
                                borderLeft: "3px solid var(--accent, #2563eb)",
                                background: "var(--surface-2, #f5f5f5)",
                                borderRadius: 6,
                                padding: "10px 12px",
                                fontSize: "0.875rem",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    gap: 8,
                                    marginBottom: 6,
                                    color: "var(--text-muted, #6b7280)",
                                    fontSize: "0.8125rem",
                                }}
                            >
                                <span data-testid={`article-comment-author-${c.id}`}>
                                    {c.author?.trim() ||
                                        t("ui.comments.editor.no_author", "Unknown")}
                                </span>
                                {c.published_at && (
                                    <span
                                        data-testid={`article-comment-date-${c.id}`}
                                    >
                                        {formatDate(c.published_at, lang)}
                                    </span>
                                )}
                            </div>
                            <div
                                data-testid={`article-comment-body-${c.id}`}
                                style={{
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    color: "var(--text)",
                                }}
                            >
                                {c.body_text}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
