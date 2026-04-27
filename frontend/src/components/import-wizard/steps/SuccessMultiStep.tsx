import { CheckCircle, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../../hooks/useI18n";
import type { DetectedBookSummary } from "../../../api/import";

/** Per-book summary surfaced after a multi-book import (.bgb).
 *
 * Lists every successfully created book with title + per-book "Open
 * in editor" link. No auto-redirect: the user picks which book to
 * open or dismisses the wizard. */
export function SuccessMultiStep({
    bookIds,
    books,
    onClose,
    onAnother,
}: {
    /** Backend-returned ids in creation order. */
    bookIds: string[];
    /** Per-book summaries from the original detect response (the
     * source_identifier suffix ``::<uuid>`` matches each book id). */
    books: DetectedBookSummary[];
    onClose: () => void;
    onAnother: () => void;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();

    const items = bookIds.map((id) => {
        const summary = books.find((b) =>
            b.source_identifier.endsWith(`::${id}`),
        );
        return { id, title: summary?.title ?? id };
    });

    return (
        <div
            data-testid="success-multi-step"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: "32px 0",
            }}
        >
            <CheckCircle size={48} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0 }}>
                {t(
                    "ui.import_wizard.success_multi_title",
                    "{n} books imported",
                ).replace("{n}", String(items.length))}
            </h3>
            <p
                style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    textAlign: "center",
                }}
            >
                {t(
                    "ui.import_wizard.success_multi_subtitle",
                    "Open one to start editing, or close the wizard to return to the dashboard.",
                )}
            </p>
            <ul
                data-testid="success-multi-list"
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "8px 0 0",
                    width: "100%",
                    maxWidth: 520,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                }}
            >
                {items.map((it) => (
                    <li
                        key={it.id}
                        data-testid={`success-multi-row-${it.id}`}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 14px",
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                        }}
                    >
                        <span
                            style={{
                                fontSize: "0.9375rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                            }}
                            title={it.title}
                        >
                            {it.title}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            data-testid={`success-multi-open-${it.id}`}
                            onClick={() => {
                                onClose();
                                navigate(`/book/${it.id}`);
                            }}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                flexShrink: 0,
                            }}
                        >
                            <BookOpen size={14} />
                            {t("ui.import_wizard.success_multi_open", "Open")}
                        </button>
                    </li>
                ))}
            </ul>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                    className="btn btn-primary"
                    data-testid="success-multi-done"
                    onClick={onClose}
                >
                    {t("ui.import_wizard.success_multi_done", "Done")}
                </button>
                <button
                    className="btn btn-secondary"
                    data-testid="success-multi-import-another"
                    onClick={onAnother}
                >
                    {t(
                        "ui.import_wizard.success_import_another",
                        "Import another",
                    )}
                </button>
            </div>
        </div>
    );
}
