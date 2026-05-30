/**
 * Detailed list-view alternative to the grid of ``BookCard`` tiles.
 * Surfaces cover thumbnail, title, author, language, last edit, and
 * an actions menu so the user can pick by metadata at a glance.
 *
 * Reuses the same trash + delete-permanent semantics as ``BookCard``
 * via the shared ``onDelete`` / ``onDeletePermanent`` callbacks - the
 * Dashboard owns the row and just hands them down.
 */
import { useState } from "react";
import { Book } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { AlertTriangle, Clock, MoreVertical, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import CoverPlaceholder from "./CoverPlaceholder";
import { formatLocaleDate } from "../utils/formatDate";
import {Badge} from "./Badge";
import {publicationStatusVariant} from "../utils/publicationStatusBadge";
import styles from "./BookListView.module.css";

interface Props {
    books: Book[];
    onClick: (book: Book) => void;
    onDelete: (book: Book) => void;
    onDeletePermanent?: (book: Book) => void;
    // Per-row selection state. When BOTH are provided the row renders
    // a leading checkbox cell wired to the parent's selection store
    // (matching ArticleRow's checkbox shape). When omitted (e.g. the
    // trash view's read-only listings) the checkbox column is hidden.
    isSelected?: (book: Book) => boolean;
    onToggleSelect?: (book: Book) => void;
}

export default function BookListView({
    books,
    onClick,
    onDelete,
    onDeletePermanent,
    isSelected,
    onToggleSelect,
}: Props) {
    const { t } = useI18n();
    const showSelection = isSelected != null && onToggleSelect != null;
    return (
        <div
            data-testid="book-list-view"
            role="table"
            aria-label={t("ui.dashboard.list_aria_label", "Bücherliste")}
            className={`${styles.table}${showSelection ? ` ${styles.tableSelectable}` : ""}`}
        >
            <div role="row" className={styles.headerRow}>
                {showSelection ? (
                    <div
                        role="columnheader"
                        className={styles.colCheckbox}
                        aria-label={t("ui.dashboard.col_select", "Auswählen")}
                    />
                ) : null}
                <div role="columnheader" className={styles.colCover}>
                    {t("ui.dashboard.col_cover", "Cover")}
                </div>
                <div role="columnheader" className={styles.colMain}>
                    {t("ui.dashboard.col_title", "Titel")}
                </div>
                <div role="columnheader" className={styles.colAuthor}>
                    {t("ui.dashboard.col_author", "Autor")}
                </div>
                <div role="columnheader" className={styles.colLang}>
                    {t("ui.dashboard.col_language", "Sprache")}
                </div>
                <div role="columnheader" className={styles.colDate}>
                    {t("ui.dashboard.col_last_edit", "Zuletzt bearbeitet")}
                </div>
                <div role="columnheader" className={styles.colActions} aria-hidden="true" />
            </div>
            {books.map((book) => (
                <BookListRow
                    key={book.id}
                    book={book}
                    onClick={() => onClick(book)}
                    onDelete={() => onDelete(book)}
                    onDeletePermanent={onDeletePermanent ? () => onDeletePermanent(book) : undefined}
                    isSelected={isSelected ? isSelected(book) : undefined}
                    onToggleSelect={onToggleSelect ? () => onToggleSelect(book) : undefined}
                />
            ))}
        </div>
    );
}

interface RowProps {
    book: Book;
    onClick: () => void;
    onDelete: () => void;
    onDeletePermanent?: () => void;
    // Mirrors ArticleRow's selection props. When ``onToggleSelect`` is
    // provided the row renders a leading checkbox cell; when omitted
    // the cell is hidden (callers that want read-only listings).
    isSelected?: boolean;
    onToggleSelect?: () => void;
}

function BookListRow({
    book,
    onClick,
    onDelete,
    onDeletePermanent,
    isSelected,
    onToggleSelect,
}: RowProps) {
    const { t, lang } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const updated = formatLocaleDate(book.updated_at, lang);
    const coverFilename = book.cover_image ? book.cover_image.split("/").pop() : null;
    const coverUrl = coverFilename
        ? `/api/books/${book.id}/assets/file/${coverFilename}`
        : null;

    const showSelection = onToggleSelect != null;
    return (
        <div
            role="row"
            data-testid={`book-list-row-${book.id}`}
            // View-agnostic id attribute — paired with the
            // ``data-book-id`` on BookCard so E2E specs can
            // target a book wrapper without knowing whether
            // grid or list view is active. See
            // VIEW-MODE-TESTID-PARITY-01.
            data-book-id={book.id}
            className={`${styles.row}${isSelected ? ` ${styles.rowSelected}` : ""}`}
            onClick={() => {
                if (!menuOpen) onClick();
            }}
        >
            {showSelection ? (
                <div role="cell" className={styles.colCheckbox}>
                    <input
                        type="checkbox"
                        className={styles.checkbox}
                        data-testid={`book-bulk-check-${book.id}`}
                        checked={!!isSelected}
                        onChange={onToggleSelect}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("ui.dashboard.bulk.select_row", "Buch auswählen")}
                    />
                </div>
            ) : null}
            <div role="cell" className={styles.colCover}>
                <div className={styles.coverThumb}>
                    {coverUrl ? (
                        <img
                            src={coverUrl}
                            alt={`${book.title} cover`}
                            className={styles.coverThumbImg}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                            }}
                        />
                    ) : (
                        <CoverPlaceholder title={book.title} compact />
                    )}
                </div>
            </div>
            <div role="cell" className={styles.colMain}>
                <div className={styles.titleCell}>
                    <span className={styles.title}>{book.title}</span>
                    {book.subtitle ? <span className={styles.subtitle}>{book.subtitle}</span> : null}
                </div>
            </div>
            <div role="cell" className={styles.colAuthor}>
                {book.author?.trim()
                    ? book.author
                    : t("ui.dashboard.book_no_author", "—")}
            </div>
            <div role="cell" className={styles.colLang}>
                {/* PUBLICATION-STATUS-BOOK-PARITY-01 (T0 C2):
                 *  publication-lifecycle badge mirrors the
                 *  list-view article-list-row-status-{id}
                 *  pattern. Reuses ``ui.articles.status_*``
                 *  i18n keys (the labels are identical between
                 *  the two surfaces). */}
                <Badge
                    testId={`book-list-row-status-${book.id}`}
                    variant={publicationStatusVariant(book.status ?? "draft")}
                    size="sm"
                    style={{ marginRight: 6 }}
                >
                    {t(
                        `ui.articles.status_${book.status ?? "draft"}`,
                        book.status ?? "draft",
                    )}
                </Badge>
                {book.language.toUpperCase()}
            </div>
            <div role="cell" className={styles.colDate}>
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <Clock size={12} />
                    {updated}
                </span>
            </div>
            <div role="cell" className={styles.colActions}>
                <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenu.Trigger asChild>
                        <button
                            className="btn-icon"
                            data-testid={`book-list-row-menu-${book.id}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreVertical size={16} />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            className="hamburger-menu-content"
                            align="end"
                            sideOffset={4}
                        >
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                data-testid={`book-list-row-menu-delete-${book.id}`}
                                onSelect={() => onDelete()}
                            >
                                <Trash2 size={14} /> {t("ui.dashboard.move_to_trash", "In den Papierkorb")}
                            </DropdownMenu.Item>
                            {onDeletePermanent ? (
                                <>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        data-testid={`book-list-row-menu-delete-permanent-${book.id}`}
                                        onSelect={() => onDeletePermanent()}
                                        style={{ color: "var(--danger)" }}
                                    >
                                        <AlertTriangle size={14} />{" "}
                                        {t("ui.dashboard.delete_permanent", "Endgültig löschen")}
                                    </DropdownMenu.Item>
                                </>
                            ) : null}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            </div>
        </div>
    );
}
