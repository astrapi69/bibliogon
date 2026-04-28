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
            style={styles.table}
        >
            <div role="row" style={styles.headerRow}>
                <div role="columnheader" style={styles.colCover}>
                    {t("ui.dashboard.col_cover", "Cover")}
                </div>
                <div role="columnheader" style={styles.colMain}>
                    {t("ui.dashboard.col_title", "Titel")}
                </div>
                <div role="columnheader" style={styles.colAuthor}>
                    {t("ui.dashboard.col_author", "Autor")}
                </div>
                <div role="columnheader" style={styles.colLang}>
                    {t("ui.dashboard.col_language", "Sprache")}
                </div>
                <div role="columnheader" style={styles.colDate}>
                    {t("ui.dashboard.col_last_edit", "Zuletzt bearbeitet")}
                </div>
                <div role="columnheader" style={styles.colActions} aria-hidden="true" />
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
            style={styles.row}
            onClick={() => {
                if (!menuOpen) onClick();
            }}
        >
            <div role="cell" style={styles.colCover}>
                <div style={styles.coverThumb}>
                    {coverUrl ? (
                        <img
                            src={coverUrl}
                            alt={`${book.title} cover`}
                            style={styles.coverThumbImg}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                            }}
                        />
                    ) : (
                        <CoverPlaceholder title={book.title} compact />
                    )}
                </div>
            </div>
            <div role="cell" style={styles.colMain}>
                <div style={styles.titleCell}>
                    <span style={styles.title}>{book.title}</span>
                    {book.subtitle ? <span style={styles.subtitle}>{book.subtitle}</span> : null}
                </div>
            </div>
            <div role="cell" style={styles.colAuthor}>
                {book.author?.trim()
                    ? book.author
                    : t("ui.dashboard.book_no_author", "—")}
            </div>
            <div role="cell" style={styles.colLang}>
                {book.language.toUpperCase()}
            </div>
            <div role="cell" style={styles.colDate}>
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <Clock size={12} />
                    {updated}
                </span>
            </div>
            <div role="cell" style={styles.colActions}>
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

const styles: Record<string, React.CSSProperties> = {
    table: {
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
    },
    headerRow: {
        display: "grid",
        gridTemplateColumns: "50px 1fr 180px 80px 160px 50px",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        fontSize: "0.8125rem",
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
    },
    row: {
        display: "grid",
        gridTemplateColumns: "50px 1fr 180px 80px 160px 50px",
        gap: 12,
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        transition: "background 120ms ease",
    },
    colCover: { width: 50 },
    colMain: { minWidth: 0 },
    colAuthor: { color: "var(--text-muted)", fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    colLang: { fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-muted)" },
    colDate: { fontSize: "0.8125rem", color: "var(--text-muted)" },
    colActions: { textAlign: "right" },
    coverThumb: {
        width: 40,
        height: 60,
        borderRadius: 2,
        overflow: "hidden",
        background: "var(--bg-secondary)",
    },
    coverThumbImg: {
        width: "100%",
        height: "100%",
        objectFit: "cover" as const,
    },
    titleCell: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    title: {
        fontWeight: 600,
        fontSize: "0.9375rem",
        color: "var(--text)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    subtitle: {
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
};
