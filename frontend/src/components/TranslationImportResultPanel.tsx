import { AlertTriangle, BookOpen, Check, FileQuestion } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
    TranslationImportedBook,
    TranslationSkippedBranch,
} from "../api/client";
import { useI18n } from "../hooks/useI18n";

/**
 * PGS-04-FU-01 result panel for the multi-branch translation-group
 * import. Renders two sections:
 *
 * - Imported books, each with language badge + title + Open button.
 * - Skipped branches (when any) with reason badge + diagnostic line
 *   so silent skips never happen again.
 *
 * Pure presentational - no fetch, no state machine. Future callers
 * (the multi-branch import wizard, a Settings panel, an admin script
 * surface) embed it after running ``api.translations.importMultiBranch``.
 */
export function TranslationImportResultPanel({
    result,
}: {
    result: {
        translation_group_id: string | null;
        books: TranslationImportedBook[];
        skipped: TranslationSkippedBranch[];
    };
}) {
    const { t } = useI18n();
    const navigate = useNavigate();

    return (
        <div data-testid="translation-import-result" style={panelStyles.root}>
            <ImportedSection
                books={result.books}
                onOpen={(id) => navigate(`/book/${id}`)}
            />
            {result.skipped.length > 0 && (
                <SkippedSection skipped={result.skipped} />
            )}
        </div>
    );
}

function ImportedSection({
    books,
    onOpen,
}: {
    books: TranslationImportedBook[];
    onOpen: (id: string) => void;
}) {
    const { t } = useI18n();

    if (books.length === 0) {
        return (
            <div
                data-testid="translation-import-result-empty"
                style={panelStyles.notice}
            >
                {t(
                    "ui.translations.import_result_empty",
                    "Es wurden keine Buecher importiert.",
                )}
            </div>
        );
    }

    return (
        <section data-testid="translation-import-result-imported">
            <h4 style={panelStyles.heading}>
                <Check size={14} style={{ color: "var(--success, #16a34a)" }} />
                {t(
                    "ui.translations.import_result_imported_heading",
                    "{n} Buch/Buecher importiert",
                ).replace("{n}", String(books.length))}
            </h4>
            <ul style={panelStyles.list}>
                {books.map((b) => (
                    <li
                        key={b.book_id}
                        data-testid={`translation-import-result-row-${b.branch}`}
                        style={panelStyles.row}
                    >
                        <strong style={panelStyles.langBadge}>
                            {(b.language || "??").toUpperCase()}
                        </strong>
                        <span style={panelStyles.branch}>{b.branch}</span>
                        <span style={panelStyles.title} title={b.title}>
                            {b.title || b.branch}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            data-testid={`translation-import-result-open-${b.branch}`}
                            onClick={() => onOpen(b.book_id)}
                            style={panelStyles.openBtn}
                        >
                            <BookOpen size={12} />
                            {t("ui.translations.import_result_open", "Oeffnen")}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function SkippedSection({
    skipped,
}: {
    skipped: TranslationSkippedBranch[];
}) {
    const { t } = useI18n();

    function reasonLabel(reason: string): string {
        switch (reason) {
            case "no_wbt_layout":
                return t(
                    "ui.translations.import_result_reason_no_wbt_layout",
                    "Kein Buch-Layout (config/metadata.yaml fehlt)",
                );
            case "import_failed":
                return t(
                    "ui.translations.import_result_reason_import_failed",
                    "Import fehlgeschlagen (inkompatible Struktur)",
                );
            default:
                return reason;
        }
    }

    return (
        <section
            data-testid="translation-import-result-skipped"
            style={panelStyles.skippedSection}
        >
            <h4 style={panelStyles.heading}>
                <AlertTriangle size={14} style={{ color: "var(--warning, #b45309)" }} />
                {t(
                    "ui.translations.import_result_skipped_heading",
                    "{n} Branch/Branches benoetigen Aufmerksamkeit",
                ).replace("{n}", String(skipped.length))}
            </h4>
            <p style={panelStyles.skippedHint}>
                {t(
                    "ui.translations.import_result_skipped_hint",
                    "Diese Branches wurden uebersprungen. Behebe das Problem im Repository und importiere die Uebersetzungsgruppe danach erneut.",
                )}
            </p>
            <ul style={panelStyles.list}>
                {skipped.map((s) => (
                    <li
                        key={s.branch}
                        data-testid={`translation-import-result-skipped-row-${s.branch}`}
                        style={{
                            ...panelStyles.row,
                            background: "var(--bg-warning, #fff8e6)",
                            borderColor: "var(--warning, #b45309)",
                            alignItems: "flex-start",
                            flexDirection: "column",
                            gap: 4,
                        }}
                    >
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <FileQuestion size={12} />
                            <strong>{s.branch}</strong>
                            <span
                                data-testid={`translation-import-result-skipped-reason-${s.branch}`}
                                style={panelStyles.reasonBadge}
                            >
                                {reasonLabel(s.reason)}
                            </span>
                        </div>
                        <code
                            data-testid={`translation-import-result-skipped-detail-${s.branch}`}
                            style={panelStyles.detail}
                        >
                            {s.detail}
                        </code>
                    </li>
                ))}
            </ul>
        </section>
    );
}

const panelStyles: Record<string, React.CSSProperties> = {
    root: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
    },
    heading: {
        margin: 0,
        marginBottom: 8,
        fontSize: "0.9375rem",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    list: {
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    row: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg-card)",
        fontSize: "0.875rem",
    },
    langBadge: {
        minWidth: 36,
        textAlign: "center",
        fontSize: "0.75rem",
        color: "var(--text-secondary)",
    },
    branch: {
        color: "var(--text-muted)",
        fontFamily: "monospace",
        fontSize: "0.75rem",
        minWidth: 80,
    },
    title: {
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    openBtn: {
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
    },
    notice: {
        padding: 16,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        color: "var(--text-muted)",
    },
    skippedSection: {
        marginTop: 8,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
    },
    skippedHint: {
        margin: "0 0 8px 0",
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    reasonBadge: {
        fontSize: "0.6875rem",
        padding: "2px 6px",
        borderRadius: 4,
        background: "var(--accent-light, #fff8e6)",
        color: "var(--warning, #b45309)",
        fontWeight: 500,
    },
    detail: {
        display: "block",
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        background: "var(--bg-primary)",
        padding: "4px 8px",
        borderRadius: 4,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        width: "100%",
    },
};
