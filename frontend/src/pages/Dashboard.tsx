import {useEffect, useState, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {api, Book, BookCreate} from "../api/client";
import CreateBookModal from "../components/CreateBookModal";
import BookCard from "../components/BookCard";
import {
    Plus, BookOpen, Download, Upload, FolderUp,
    Settings, HelpCircle, Rocket, Trash2, RotateCcw, Trash, ChevronLeft,
    Menu, Search,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import ThemeToggle from "../components/ThemeToggle";
import {useDialog} from "../components/AppDialog";
import {toast} from "react-toastify";
import {useI18n} from "../hooks/useI18n";

export default function Dashboard() {
    const dialog = useDialog();
    const {t} = useI18n();
    const [books, setBooks] = useState<Book[]>([]);
    const [trash, setTrash] = useState<Book[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();
    const backupInputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);

    const loadBooks = async () => {
        try {
            const data = await api.books.list();
            setBooks(data);
        } catch (err) {
            console.error("Failed to load books:", err);
        } finally {
            setLoading(false);
        }
    };

    const loadTrash = async () => {
        try {
            const data = await api.books.listTrash();
            setTrash(data);
        } catch (err) {
            console.error("Failed to load trash:", err);
        }
    };

    useEffect(() => {
        loadBooks();
        loadTrash();
    }, []);

    const handleCreate = async (data: BookCreate) => {
        const book = await api.books.create(data);
        setBooks((prev) => [book, ...prev]);
        setShowModal(false);
    };

    const handleDelete = async (id: string) => {
        await api.books.delete(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
        loadTrash();
        toast.info(t("ui.dashboard.moved_to_trash", "In den Papierkorb verschoben"));
    };

    const handleDeletePermanent = async (id: string) => {
        if (!await dialog.confirm(
            t("ui.dashboard.delete_permanent_title", "Endgueltig loeschen"),
            t("ui.dashboard.delete_permanent_warning", "Das Buch wird unwiderruflich geloescht. Diese Aktion kann NICHT rueckgaengig gemacht werden. Nur fuer erfahrene Benutzer."),
            "danger",
        )) return;
        await api.books.delete(id);
        try { await api.books.permanentDelete(id); } catch { /* already in trash */ }
        setBooks((prev) => prev.filter((b) => b.id !== id));
        toast.success(t("ui.dashboard.deleted_permanently", "Buch endgueltig geloescht"));
    };

    const handleRestore = async (id: string) => {
        await api.books.restore(id);
        setTrash((prev) => prev.filter((b) => b.id !== id));
        loadBooks();
    };

    const handlePermanentDelete = async (id: string) => {
        if (!await dialog.confirm("Endgültig löschen", "Buch endgültig löschen? Dies kann nicht rückgängig gemacht werden.", "danger")) return;
        await api.books.permanentDelete(id);
        setTrash((prev) => prev.filter((b) => b.id !== id));
    };

    const handleEmptyTrash = async () => {
        if (!await dialog.confirm("Papierkorb leeren", `Alle ${trash.length} Bücher im Papierkorb werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`, "danger")) return;
        await api.books.emptyTrash();
        setTrash([]);
    };

    const handleBackupExport = () => {
        window.open(api.backup.exportUrl(), "_blank");
    };

    const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await api.backup.import(file);
            toast.success(`${result.imported_books} Buch/Bücher importiert.`);
            loadBooks();
        } catch (err) {
            toast.error(`Import fehlgeschlagen: ${err}`);
        }
        e.target.value = "";
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await api.backup.importProject(file);
            toast.success(`"${result.title}" mit ${result.chapter_count} Kapiteln importiert.`);
            loadBooks();
        } catch (err) {
            toast.error(`Import fehlgeschlagen: ${err}`);
        }
        e.target.value = "";
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.logo} onClick={() => navigate("/")} role="button" title="Dashboard">
                        <BookOpen size={28} strokeWidth={1.5}/>
                        <h1 style={styles.logoText}>Bibliogon</h1>
                    </div>
                    <div style={styles.headerActions}>
                        {/* Always visible */}
                        <ThemeToggle/>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <Plus size={16}/> <span className="hide-mobile">{t("ui.dashboard.new_book", "Neues Buch")}</span>
                        </button>

                        {/* Desktop: inline buttons */}
                        <div className="hide-mobile" style={{display: "flex", alignItems: "center", gap: 6}}>
                            <div style={styles.headerSeparator}/>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleBackupExport}
                                disabled={books.length === 0}
                            >
                                <Download size={14}/> Backup
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => backupInputRef.current?.click()}>
                                <Upload size={14}/> Restore
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => projectInputRef.current?.click()}>
                                <FolderUp size={14}/> Import
                            </button>
                            <div style={styles.headerSeparator}/>
                            <button className="btn-icon" onClick={() => navigate("/get-started")} title="Erste Schritte">
                                <Rocket size={18}/>
                            </button>
                            <button className="btn-icon" onClick={() => navigate("/help")} title="Hilfe">
                                <HelpCircle size={18}/>
                            </button>
                            <button className="btn-icon" onClick={() => navigate("/settings")} title="Einstellungen">
                                <Settings size={18}/>
                            </button>
                            <button
                                className="btn-icon"
                                onClick={() => setShowTrash(!showTrash)}
                                style={showTrash ? {color: "var(--accent)"} : undefined}
                            >
                                <Trash2 size={18}/>
                                {trash.length > 0 && <span style={styles.trashBadge}>{trash.length}</span>}
                            </button>
                        </div>

                        {/* Mobile: hamburger menu */}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button className="btn-icon show-mobile-only">
                                    <Menu size={20}/>
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content className="hamburger-menu-content" align="end" sideOffset={4}>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={handleBackupExport}>
                                        <Download size={16}/> Backup
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => backupInputRef.current?.click()}>
                                        <Upload size={16}/> Restore
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => projectInputRef.current?.click()}>
                                        <FolderUp size={16}/> Import
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => navigate("/get-started")}>
                                        <Rocket size={16}/> Erste Schritte
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => navigate("/help")}>
                                        <HelpCircle size={16}/> Hilfe
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => navigate("/settings")}>
                                        <Settings size={16}/> Einstellungen
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => setShowTrash(!showTrash)}>
                                        <Trash2 size={16}/> Papierkorb {trash.length > 0 && `(${trash.length})`}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>

                        <input ref={backupInputRef} type="file" accept=".bgb" style={{display: "none"}} onChange={handleBackupImport}/>
                        <input ref={projectInputRef} type="file" accept=".bgp,.zip" style={{display: "none"}} onChange={handleProjectImport}/>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main style={styles.main}>
                {showTrash ? (
                    /* Trash view */
                    <>
                        <div style={styles.mainHeader}>
                            <button className="btn-icon" onClick={() => setShowTrash(false)} title="Zurück">
                                <ChevronLeft size={18}/>
                            </button>
                            <Trash2 size={20} style={{color: "var(--text-muted)"}}/>
                            <h2 style={styles.mainTitle}>Papierkorb</h2>
                            <span style={styles.bookCount}>{trash.length} {trash.length === 1 ? "Buch" : "Bücher"}</span>
                            <div style={{flex: 1}}/>
                            {trash.length > 0 && (
                                <button className="btn btn-danger btn-sm" onClick={handleEmptyTrash}>
                                    <Trash size={14}/> Papierkorb leeren
                                </button>
                            )}
                        </div>
                        {trash.length === 0 ? (
                            <div style={styles.emptyState}>
                                <Trash2 size={48} strokeWidth={1} color="var(--text-muted)"/>
                                <p style={styles.emptyTitle}>Papierkorb ist leer</p>
                            </div>
                        ) : (
                            <div style={styles.grid}>
                                {trash.map((book) => (
                                    <div key={book.id} style={styles.trashCard}>
                                        <div style={{flex: 1}}>
                                            <strong>{book.title}</strong>
                                            <p style={{color: "var(--text-muted)", fontSize: "0.8125rem"}}>{book.author}</p>
                                        </div>
                                        <div style={{display: "flex", gap: 6, flexShrink: 0}}>
                                            <button className="btn btn-primary btn-sm" onClick={() => handleRestore(book.id)}>
                                                <RotateCcw size={12}/> Wiederherstellen
                                            </button>
                                            <button className="btn btn-danger btn-sm" onClick={() => handlePermanentDelete(book.id)}>
                                                <Trash size={12}/> Endgueltig loeschen
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : loading ? (
                    <p style={styles.empty}>Laden...</p>
                ) : books.length === 0 ? (
                    <div style={styles.emptyState}>
                        <BookOpen size={56} strokeWidth={1} color="var(--text-muted)"/>
                        <p style={styles.emptyTitle}>Willkommen bei Bibliogon</p>
                        <p style={styles.emptyText}>
                            Erstelle dein erstes Buch, importiere ein bestehendes Projekt,
                            oder schaue dir die Erste-Schritte-Anleitung an.
                        </p>
                        <div style={{display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", justifyContent: "center"}}>
                            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                                <Plus size={16}/> Buch erstellen
                            </button>
                            <button className="btn btn-secondary" onClick={() => projectInputRef.current?.click()}>
                                <FolderUp size={16}/> Projekt importieren
                            </button>
                            <button className="btn btn-secondary" onClick={() => navigate("/get-started")}>
                                <Rocket size={16}/> Erste Schritte
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={styles.mainHeader}>
                            <h2 style={styles.mainTitle}>{t("ui.dashboard.title", "Meine Bücher")}</h2>
                            <span style={styles.bookCount}>{books.length} {books.length === 1 ? "Buch" : "Bücher"}</span>
                        </div>
                        {books.length > 3 && (
                            <div style={styles.searchBar}>
                                <Search size={16} style={{color: "var(--text-muted)", flexShrink: 0}}/>
                                <input
                                    className="input"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t("ui.dashboard.search_placeholder", "Suche nach Titel, Autor, Genre oder Sprache...")}
                                    style={{border: "none", background: "transparent", flex: 1, padding: "4px 0"}}
                                />
                            </div>
                        )}
                        <div style={styles.grid}>
                            {books.filter((book) => {
                                if (!searchQuery.trim()) return true;
                                const q = searchQuery.toLowerCase();
                                return (
                                    book.title.toLowerCase().includes(q) ||
                                    book.author.toLowerCase().includes(q) ||
                                    (book.genre || "").toLowerCase().includes(q) ||
                                    book.language.toLowerCase().includes(q) ||
                                    (book.series || "").toLowerCase().includes(q) ||
                                    (book.subtitle || "").toLowerCase().includes(q)
                                );
                            }).map((book) => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    onClick={() => navigate(`/book/${book.id}`)}
                                    onDelete={() => handleDelete(book.id)}
                                    onDeletePermanent={() => handleDeletePermanent(book.id)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </main>

            <CreateBookModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onCreate={handleCreate}
            />
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {minHeight: "100vh", background: "var(--bg-primary)"},
    header: {borderBottom: "1px solid var(--border)", background: "var(--bg-card)"},
    headerInner: {
        maxWidth: 1100, margin: "0 auto", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    },
    logo: {display: "flex", alignItems: "center", gap: 10, color: "var(--accent)", flexShrink: 0, cursor: "pointer"},
    logoText: {
        fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600,
        color: "var(--text-primary)", letterSpacing: "-0.02em",
    },
    headerActions: {
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end",
    },
    headerSeparator: {width: 1, height: 24, background: "var(--border)", margin: "0 4px"},
    trashBadge: {
        position: "absolute" as const, top: -4, right: -4,
        background: "var(--danger)", color: "white", fontSize: "0.625rem",
        fontWeight: 700, width: 16, height: 16, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
    },
    main: {maxWidth: 1100, margin: "0 auto", padding: "32px 24px"},
    mainHeader: {
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
    },
    mainTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600,
        color: "var(--text-primary)",
    },
    bookCount: {fontSize: "0.875rem", color: "var(--text-muted)"},
    searchBar: {
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", marginBottom: 16,
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
    },
    grid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20,
    },
    empty: {textAlign: "center" as const, color: "var(--text-muted)", marginTop: 80},
    emptyState: {
        display: "flex", flexDirection: "column" as const, alignItems: "center", marginTop: 80, gap: 8,
    },
    emptyTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600, marginTop: 16,
    },
    emptyText: {
        color: "var(--text-muted)", fontSize: "0.9375rem",
        textAlign: "center" as const, maxWidth: 480, lineHeight: 1.6,
    },
    trashCard: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap" as const,
        gap: 12, padding: 16, background: "var(--bg-card)",
        border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
    },
};
