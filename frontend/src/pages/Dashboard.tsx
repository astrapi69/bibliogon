import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api, Book, BookCreate} from "../api/client";
import CreateBookModal from "../components/CreateBookModal";
import BookCard from "../components/BookCard";
import {Plus, BookOpen} from "lucide-react";

export default function Dashboard() {
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();

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
        setShowModal(false);
        navigate(`/book/${book.id}`);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Buch wirklich loeschen?")) return;
        await api.books.delete(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.logo}>
                        <BookOpen size={28} strokeWidth={1.5}/>
                        <h1 style={styles.logoText}>Bibliogon</h1>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={16}/>
                        Neues Buch
                    </button>
                </div>
            </header>

            <main style={styles.main}>
                {loading ? (
                    <p style={styles.empty}>Laden...</p>
                ) : books.length === 0 ? (
                    <div style={styles.emptyState}>
                        <BookOpen size={48} strokeWidth={1} color="var(--text-muted)"/>
                        <p style={styles.emptyTitle}>Noch keine Buecher</p>
                        <p style={styles.emptyText}>
                            Erstelle dein erstes Buch und beginne zu schreiben.
                        </p>
                        <button
                            className="btn btn-primary mt-2"
                            onClick={() => setShowModal(true)}
                        >
                            <Plus size={16}/>
                            Buch erstellen
                        </button>
                    </div>
                ) : (
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
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    logo: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--accent)",
    },
    logoText: {
        fontFamily: "var(--font-display)",
        fontSize: "1.5rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        letterSpacing: "-0.02em",
    },
    main: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "40px 24px",
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
        fontSize: "1.25rem",
        fontWeight: 600,
        marginTop: 12,
    },
    emptyText: {
        color: "var(--text-muted)",
        fontSize: "0.9375rem",
    },
};
