import { useI18n } from "../../../hooks/useI18n";
import type {
    DetectedBookSummary,
    DetectedProject,
} from "../../../api/import";

type PerBookAction = "skip" | "overwrite" | "create_new";

export interface MultiBookSelectionState {
    selectedSourceIds: string[];
    perBookDuplicateAction: Record<string, PerBookAction>;
}

/**
 * Multi-book preview Step 3.
 *
 * Renders one row per book in the .bgb archive. Default selection
 * is all-on; user toggles per-row. No per-book detail editing —
 * post-import the metadata editor handles that, consistent with
 * the multi-cover decision in CIO-08 Block 1.
 *
 * Per-row duplicate handling: when ``duplicate_of`` is set on the
 * summary, the row also exposes a Skip / Overwrite / Create-new
 * dropdown. Default is Skip (avoids accidental overwrites). Only
 * the rows the user actually decided are sent in the
 * ``per_book_duplicate`` override; the backend defaults the rest
 * to skip.
 */
export function PreviewMultiBookStep({
    detected,
    selection,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onSetDuplicateAction,
    onConfirm,
    onBack,
}: {
    detected: DetectedProject;
    selection: MultiBookSelectionState;
    onToggle: (sourceId: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onSetDuplicateAction: (
        sourceId: string,
        action: PerBookAction,
    ) => void;
    onConfirm: () => void;
    onBack: () => void;
}) {
    const { t } = useI18n();
    const books = detected.books ?? [];
    const total = books.length;
    const selectedCount = selection.selectedSourceIds.length;

    return (
        <div data-testid="preview-multi-book-step">
            <header style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>
                    {t(
                        "ui.import_wizard.multi_book_count",
                        "{count} books in this backup",
                    ).replace("{count}", String(total))}
                </h3>
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginTop: 6,
                        fontSize: "0.8125rem",
                    }}
                >
                    <button
                        type="button"
                        data-testid="multi-book-select-all"
                        onClick={onSelectAll}
                        className="btn btn-ghost btn-sm"
                    >
                        {t("ui.import_wizard.multi_book_select_all", "Select all")}
                    </button>
                    <button
                        type="button"
                        data-testid="multi-book-deselect-all"
                        onClick={onDeselectAll}
                        className="btn btn-ghost btn-sm"
                    >
                        {t(
                            "ui.import_wizard.multi_book_deselect_all",
                            "Deselect all",
                        )}
                    </button>
                    <span
                        data-testid="multi-book-selected-count"
                        style={{ color: "var(--text-muted)" }}
                    >
                        {t(
                            "ui.import_wizard.multi_book_selected_count",
                            "{count} of {total} selected",
                        )
                            .replace("{count}", String(selectedCount))
                            .replace("{total}", String(total))}
                    </span>
                </div>
            </header>

            <ul
                data-testid="multi-book-list"
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: "55vh",
                    overflowY: "auto",
                }}
            >
                {books.map((book) => (
                    <BookRow
                        key={book.source_identifier}
                        book={book}
                        selected={selection.selectedSourceIds.includes(
                            book.source_identifier,
                        )}
                        duplicateAction={
                            selection.perBookDuplicateAction[
                                book.source_identifier
                            ] ?? "skip"
                        }
                        onToggle={() => onToggle(book.source_identifier)}
                        onSetDuplicateAction={(action) =>
                            onSetDuplicateAction(book.source_identifier, action)
                        }
                    />
                ))}
            </ul>

            <div
                data-testid="preview-multi-book-step-footer"
                style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 16,
                    paddingTop: 12,
                    paddingBottom: 12,
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-primary)",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                }}
            >
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onBack}
                    data-testid="multi-book-back"
                >
                    {t("ui.import_wizard.button_back", "Back")}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onConfirm}
                    disabled={selectedCount === 0}
                    data-testid="multi-book-confirm"
                    title={
                        selectedCount === 0
                            ? t(
                                  "ui.import_wizard.multi_book_no_selection_disabled",
                                  "Select at least one book",
                              )
                            : undefined
                    }
                >
                    {t(
                        "ui.import_wizard.multi_book_import_button",
                        "Import {count} books",
                    ).replace("{count}", String(selectedCount))}
                </button>
            </div>
        </div>
    );
}

function BookRow({
    book,
    selected,
    duplicateAction,
    onToggle,
    onSetDuplicateAction,
}: {
    book: DetectedBookSummary;
    selected: boolean;
    duplicateAction: PerBookAction;
    onToggle: () => void;
    onSetDuplicateAction: (action: PerBookAction) => void;
}) {
    const { t } = useI18n();
    const isDuplicate = book.duplicate_of !== null;
    return (
        <li
            data-testid={`multi-book-row-${book.source_identifier}`}
            data-selected={selected ? "true" : "false"}
            style={{
                display: "flex",
                gap: 10,
                padding: 10,
                border: selected
                    ? "2px solid var(--accent)"
                    : "1px solid var(--border)",
                borderRadius: 6,
                background: selected
                    ? "var(--bg-hover)"
                    : "var(--bg-primary)",
            }}
        >
            <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                data-testid={`multi-book-checkbox-${book.source_identifier}`}
                aria-label={book.title}
                style={{ marginTop: 4 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontWeight: 600,
                        fontSize: "0.9375rem",
                    }}
                >
                    {book.title}
                </div>
                {book.subtitle && (
                    <div
                        style={{
                            fontSize: "0.8125rem",
                            color: "var(--text-secondary)",
                            marginTop: 1,
                        }}
                    >
                        {book.subtitle}
                    </div>
                )}
                <div
                    style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        marginTop: 2,
                    }}
                >
                    {book.author ?? "—"}
                </div>
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 4,
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                    }}
                >
                    <span data-testid={`multi-book-chapters-${book.source_identifier}`}>
                        {t(
                            "ui.import_wizard.multi_book_chapters",
                            "{count} chapters",
                        ).replace("{count}", String(book.chapter_count))}
                    </span>
                    <span>
                        {book.has_cover
                            ? t(
                                  "ui.import_wizard.multi_book_has_cover",
                                  "Has cover",
                              )
                            : t(
                                  "ui.import_wizard.multi_book_no_cover",
                                  "No cover",
                              )}
                    </span>
                </div>
                {isDuplicate && (
                    <div
                        data-testid={`multi-book-duplicate-${book.source_identifier}`}
                        style={{
                            marginTop: 6,
                            padding: 6,
                            borderRadius: 4,
                            background:
                                "var(--bg-warning, var(--bg-secondary))",
                            fontSize: "0.75rem",
                        }}
                    >
                        <span style={{ marginRight: 8 }}>
                            {t(
                                "ui.import_wizard.multi_book_duplicate_already",
                                "Already imported",
                            )}
                            :
                        </span>
                        <select
                            value={duplicateAction}
                            onChange={(e) =>
                                onSetDuplicateAction(
                                    e.target.value as PerBookAction,
                                )
                            }
                            data-testid={`multi-book-dup-action-${book.source_identifier}`}
                            style={{
                                fontSize: "0.75rem",
                                padding: "1px 4px",
                            }}
                        >
                            <option value="skip">
                                {t(
                                    "ui.import_wizard.multi_book_duplicate_action_skip",
                                    "Skip",
                                )}
                            </option>
                            <option value="overwrite">
                                {t(
                                    "ui.import_wizard.multi_book_duplicate_action_overwrite",
                                    "Overwrite",
                                )}
                            </option>
                            <option value="create_new">
                                {t(
                                    "ui.import_wizard.multi_book_duplicate_action_create_new",
                                    "Create new copy",
                                )}
                            </option>
                        </select>
                    </div>
                )}
            </div>
        </li>
    );
}
