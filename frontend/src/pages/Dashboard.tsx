import {useEffect, useState, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {api, Book, BookCreate} from "../api/client";
import CreateBookModal from "../components/CreateBookModal";
import BookCard from "../components/BookCard";
import {
    Plus, BookOpen, Download, Upload, FolderUp,
    Settings, HelpCircle, Rocket,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

export default function Dashboard() {
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
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

    useEffect(() => {
        loadBooks();
    }, []);

    const handleCreate = async (data: BookCreate) => {
        const book = await api.books.create(data);
        setBooks((prev) => [book, ...prev]);
        setShowModal(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Buch wirklich loeschen?")) return;
        await api.books.delete(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
    };

    const handleBackupExport = () => {
        window.open(api.backup.exportUrl(), "_blank");
    };

    const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await api.backup.import(file);
            alert(`${result.imported_books} Buch/Buecher importiert.`);
            loadBooks();
        } catch (err) {
            alert(`Import fehlgeschlagen: ${err}`);
        }
        e.target.value = "";
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const result = await api.backup.importProject(file);
            alert(`"${result.title}" importiert (${result.chapter_count} Kapitel).`);
            loadBooks();
            navigate(`/book/${result.book_id}`);
        } catch (err) {
            alert(`Import fehlgeschlagen: ${err}`);
        }
        e.target.value = "";
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.logo}>
                        <BookOpen size={28} strokeWidth={1.5}/>
                        <h1 style={styles.logoText}>Bibliogon</h1>
                    </div>
                    <div style={styles.headerActions}>
                        {/* Navigation icons */}
                        <ThemeToggle/>
                        <button className="btn-icon" onClick={() => navigate("/get-started")} title="Erste Schritte">
                            <Rocket size={18}/>
                        </button>
                        <button className="btn-icon" onClick={() => navigate("/help")} title="Hilfe">
                            <HelpCircle size={18}/>
                        </button>
                        <button className="btn-icon" onClick={() => navigate("/settings")} title="Einstellungen">
                            <Settings size={18}/>
                        </button>

                        <div style={styles.headerSeparator}/>

                        {/* Actions */}
                        <button className="btn btn-secondary btn-sm" onClick={handleBackupExport} title="Backup exportieren">
                            <Download size={14}/> Backup
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => backupInputRef.current?.click()} title="Backup importieren">
                            <Upload size={14}/> Restore
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => projectInputRef.current?.click()} title="Projekt importieren">
                            <FolderUp size={14}/> Import
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <Plus size={16}/> Neues Buch
                        </button>

                        <input ref={backupInputRef} type="file" accept=".zip" style={{display: "none"}} onChange={handleBackupImport}/>
                        <input ref={projectInputRef} type="file" accept=".zip" style={{display: "none"}} onChange={handleProjectImport}/>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main style={styles.main}>
                {loading ? (
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
                            <h2 style={styles.mainTitle}>Meine Buecher</h2>
                            <span style={styles.bookCount}>{books.length} {books.length === 1 ? "Buch" : "Buecher"}</span>
                        </div>
                        <div style={styles.grid}>
                            {books.map((book) => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    onClick={() => navigate(`/book/${book.id}`)}
                                    onDelete={() => handleDelete(book.id)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </main>

            {showModal && (
                <CreateBookModal
                    onClose={() => setShowModal(false)}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: "100vh",
        background: "var(--bg-primary)",
    },
    header: {
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
    },
    headerInner: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
    },
    logo: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--accent)",
        flexShrink: 0,
    },
    logoText: {
        fontFamily: "var(--font-display)",
        fontSize: "1.5rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        letterSpacing: "-0.02em",
    },
    headerActions: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
    },
    headerSeparator: {
        width: 1,
        height: 24,
        background: "var(--border)",
        margin: "0 4px",
    },
    main: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px",
    },
    mainHeader: {
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 20,
    },
    mainTitle: {
        fontFamily: "var(--font-display)",
        fontSize: "1.25rem",
        fontWeight: 600,
        color: "var(--text-primary)",
    },
    bookCount: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 20,
    },
    empty: {
        textAlign: "center" as const,
        color: "var(--text-muted)",
        marginTop: 80,
    },
    emptyState: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        marginTop: 80,
        gap: 8,
    },
    emptyTitle: {
        fontFamily: "var(--font-display)",
        fontSize: "1.5rem",
        fontWeight: 600,
        marginTop: 16,
    },
    emptyText: {
        color: "var(--text-muted)",
        fontSize: "0.9375rem",
        textAlign: "center" as const,
        maxWidth: 480,
        lineHeight: 1.6,
    },
};
