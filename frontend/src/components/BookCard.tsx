import {Book} from "../api/client";
import {Trash2, Clock, MoreVertical, AlertTriangle} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface Props {
    book: Book;
    onClick: () => void;
    onDelete: () => void;
    onDeletePermanent?: () => void;
}

export default function BookCard({book, onClick, onDelete, onDeletePermanent}: Props) {
    const updated = new Date(book.updated_at).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

    return (
        <div style={styles.card} onClick={onClick}>
            <div style={styles.accent}/>
            <div style={styles.content}>
                <h3 style={styles.title}>{book.title}</h3>
                {book.subtitle && <p style={styles.subtitle}>{book.subtitle}</p>}
                <p style={styles.author}>{book.author}</p>
                {book.genre && <span style={styles.genre}>{book.genre}</span>}
                {book.series && (
                    <p style={styles.series}>
                        {book.series}
                        {book.series_index != null ? ` - Band ${book.series_index}` : ""}
                    </p>
                )}
                <div style={styles.footer}>
                    <span style={styles.date}>
                        <Clock size={12}/>
                        {updated}
                    </span>
                    <span style={styles.lang}>{book.language.toUpperCase()}</span>
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button
                                className="btn-icon"
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
                                    onSelect={(e) => { e.preventDefault(); onDelete(); }}
                                >
                                    <Trash2 size={14}/> In den Papierkorb
                                </DropdownMenu.Item>
                                {onDeletePermanent && (
                                    <>
                                        <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                        <DropdownMenu.Item
                                            className="hamburger-menu-item"
                                            onSelect={(e) => { e.preventDefault(); onDeletePermanent(); }}
                                            style={{color: "var(--danger)"}}
                                        >
                                            <AlertTriangle size={14}/> Endgueltig loeschen
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

const styles: Record<string, React.CSSProperties> = {
    card: {
        background: "var(--bg-card)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "all 180ms ease",
        display: "flex",
        flexDirection: "column",
    },
    accent: {
        height: 4,
        background: "var(--accent)",
    },
    content: {
        padding: "20px 20px 16px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
    },
    title: {
        fontFamily: "var(--font-display)",
        fontSize: "1.25rem",
        fontWeight: 600,
        lineHeight: 1.3,
        marginBottom: 4,
    },
    subtitle: {
        color: "var(--text-secondary)",
        fontSize: "0.9375rem",
        marginBottom: 4,
    },
    author: {
        color: "var(--text-muted)",
        fontSize: "0.875rem",
        marginBottom: 4,
    },
    genre: {
        display: "inline-block",
        fontSize: "0.6875rem",
        fontWeight: 600,
        background: "var(--accent-light)",
        color: "var(--accent)",
        padding: "2px 8px",
        borderRadius: 4,
        marginBottom: 8,
        alignSelf: "flex-start",
    },
    series: {
        fontSize: "0.8125rem",
        color: "var(--accent)",
        fontWeight: 500,
        marginBottom: 8,
    },
    footer: {
        marginTop: "auto",
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    date: {
        display: "flex",
        alignItems: "center",
        gap: 4,
    },
    lang: {
        fontSize: "0.6875rem",
        fontWeight: 600,
        background: "var(--bg-secondary)",
        padding: "2px 6px",
        borderRadius: 3,
        letterSpacing: "0.05em",
    },
};
