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
import styles from "./BookListView.module.css";

interface Props {
    books: Book[];
    onClick: (book: Book) => void;
    onDelete: (book: Book) => void;
    onDeletePermanent?: (book: Book) => void;
}

export default function BookListView({ books, onClick, onDelete, onDeletePermanent }: Props) {
    const { t } = useI18n();
    return (
        <div
            data-testid="book-list-view"
            role="table"
            aria-label={t("ui.dashboard.list_aria_label", "Bücherliste")}
            className={styles.table}
        >
            <div role="row" className={styles.headerRow}>
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
}

function BookListRow({ book, onClick, onDelete, onDeletePermanent }: RowProps) {
    const { t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const updated = new Date(book.updated_at).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    const coverFilename = book.cover_image ? book.cover_image.split("/").pop() : null;
    const coverUrl = coverFilename
        ? `/api/books/${book.id}/assets/file/${coverFilename}`
        : null;

    return (
        <div
            role="row"
            data-testid={`book-list-row-${book.id}`}
            className={styles.row}
            onClick={() => {
                if (!menuOpen) onClick();
            }}
        >
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
                                onSelect={(e) => {
                                    e.preventDefault();
                                    onDelete();
                                }}
                            >
                                <Trash2 size={14} /> {t("ui.dashboard.move_to_trash", "In den Papierkorb")}
                            </DropdownMenu.Item>
                            {onDeletePermanent ? (
                                <>
                                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        data-testid={`book-list-row-menu-delete-permanent-${book.id}`}
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            onDeletePermanent();
                                        }}
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
