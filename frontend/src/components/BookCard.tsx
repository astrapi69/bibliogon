import {useState} from "react";
import {Book} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {Trash2, Clock, MoreVertical, AlertTriangle} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import CoverPlaceholder from "./CoverPlaceholder";
import styles from "./BookCard.module.css";

interface Props {
    book: Book;
    onClick: () => void;
    onDelete: () => void;
    onDeletePermanent?: () => void;
}

export default function BookCard({book, onClick, onDelete, onDeletePermanent}: Props) {
    const {t} = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const updated = new Date(book.updated_at).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

    // Extract cover filename from path (e.g. "uploads/abc/cover/cover.png" -> "cover.png")
    const coverFilename = book.cover_image ? book.cover_image.split("/").pop() : null;
    const coverUrl = coverFilename ? `/api/books/${book.id}/assets/file/${coverFilename}` : null;

    return (
        <div
            className={styles.card}
            data-testid={`book-card-${book.id}`}
            onClick={() => { if (!menuOpen) onClick(); }}
        >
            {coverUrl ? (
                <img
                    src={coverUrl}
                    alt={`${book.title} cover`}
                    className={styles.coverImage}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
            ) : (
                <div className={styles.coverImage}>
                    <CoverPlaceholder
                        title={book.title}
                        subtitle={book.subtitle}
                        data-testid={`book-card-placeholder-${book.id}`}
                    />
                </div>
            )}
            <div className={styles.content}>
                <h3 className={styles.title}>{book.title}</h3>
                {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
                <p className={styles.author}>
                    {book.author && book.author.trim()
                        ? book.author
                        : t("ui.dashboard.book_no_author", "—")}
                </p>
                {book.genre && (
                    <span className={styles.genre}>
                        {t(`ui.genres.${book.genre}`, book.genre)}
                    </span>
                )}
                {book.series && (
                    <p className={styles.series}>
                        {book.series}
                        {book.series_index != null ? ` - Band ${book.series_index}` : ""}
                    </p>
                )}
                <div className={styles.footer}>
                    <span className={styles.date}>
                        <Clock size={12}/>
                        {updated}
                    </span>
                    <span className={styles.lang}>{book.language.toUpperCase()}</span>
                    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                        <DropdownMenu.Trigger asChild>
                            <button
                                className="btn-icon"
                                data-testid={`book-card-menu-${book.id}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{marginLeft: "auto"}}
                            >
                                <MoreVertical size={16}/>
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content className="hamburger-menu-content" align="end" sideOffset={4}>
                                <DropdownMenu.Item
                                    className="hamburger-menu-item"
                                    data-testid={`book-card-menu-delete-${book.id}`}
                                    onSelect={(e) => { e.preventDefault(); onDelete(); }}
                                >
                                    <Trash2 size={14}/> {t("ui.dashboard.move_to_trash", "In den Papierkorb")}
                                </DropdownMenu.Item>
                                {onDeletePermanent && (
                                    <>
                                        <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                        <DropdownMenu.Item
                                            className="hamburger-menu-item"
                                            data-testid={`book-card-menu-delete-permanent-${book.id}`}
                                            onSelect={(e) => { e.preventDefault(); onDeletePermanent(); }}
                                            style={{color: "var(--danger)"}}
                                        >
                                            <AlertTriangle size={14}/> {t("ui.dashboard.delete_permanent", "Endgültig löschen")}
                                        </DropdownMenu.Item>
                                    </>
                                )}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>
            </div>
        </div>
    );
}

