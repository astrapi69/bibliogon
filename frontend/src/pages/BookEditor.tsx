import {useEffect, useState, useCallback} from "react";
import {useParams, useNavigate} from "react-router-dom";
import {api, BookDetail, Chapter, ChapterType} from "../api/client";
import ChapterSidebar from "../components/ChapterSidebar";
import Editor from "../components/Editor";
import ExportDialog from "../components/ExportDialog";
import BookMetadataEditor from "../components/BookMetadataEditor";
import {useDialog} from "../components/AppDialog";
import {toast} from "react-toastify";
import {useI18n} from "../hooks/useI18n";
import {Menu} from "lucide-react";

export default function BookEditor() {
    const {bookId} = useParams<{ bookId: string }>();
    const navigate = useNavigate();
    const dialog = useDialog();
    const {t} = useI18n();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const TYPE_LABELS: Record<ChapterType, string> = {
        chapter: t("ui.chapter_types.chapter", "Kapitel"),
        preface: t("ui.chapter_types.preface", "Vorwort"),
        foreword: t("ui.chapter_types.foreword", "Geleitwort"),
        acknowledgments: t("ui.chapter_types.acknowledgments", "Danksagung"),
        about_author: t("ui.chapter_types.about_author", "Über den Autor"),
        appendix: t("ui.chapter_types.appendix", "Anhang"),
        bibliography: t("ui.chapter_types.bibliography", "Literatur"),
        glossary: t("ui.chapter_types.glossary", "Glossar"),
        epilogue: t("ui.chapter_types.epilogue", "Epilog"),
        imprint: t("ui.chapter_types.imprint", "Impressum"),
        next_in_series: t("ui.chapter_types.next_in_series", "Nächster Band"),
        part_intro: t("ui.chapter_types.part_intro", "Teil-Einleitung"),
        interlude: t("ui.chapter_types.interlude", "Interludium"),
        toc: t("ui.chapter_types.toc", "Inhaltsverzeichnis"),
        dedication: t("ui.chapter_types.dedication", "Widmung"),
        prologue: t("ui.chapter_types.prologue", "Prolog"),
        introduction: t("ui.chapter_types.introduction", "Einleitung"),
        afterword: t("ui.chapter_types.afterword", "Nachwort"),
        index: t("ui.chapter_types.index", "Stichwortverzeichnis"),
        epigraph: t("ui.chapter_types.epigraph", "Motto"),
        endnotes: t("ui.chapter_types.endnotes", "Endnoten"),
    };
    const [book, setBook] = useState<BookDetail | null>(null);
    const [allBooks, setAllBooks] = useState<import("../api/client").Book[]>([]);
    const [showExport, setShowExport] = useState(false);
    const [showMetadata, setShowMetadata] = useState(false);
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const activeChapter = book?.chapters.find((c) => c.id === activeChapterId) ?? null;

    const loadBook = useCallback(async () => {
        if (!bookId) return;
        try {
            const data = await api.books.get(bookId);
            setBook(data);
            // Select first chapter if none active or active no longer exists
            if (data.chapters.length > 0) {
                setActiveChapterId((prev) => {
                    if (prev && data.chapters.some((c) => c.id === prev)) return prev;
                    return data.chapters[0].id;
                });
            } else {
                setActiveChapterId(null);
            }
        } catch (err) {
            console.error("Failed to load book:", err);
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        loadBook();
        api.books.list().then(setAllBooks).catch(() => {});
    }, [loadBook]);

    const handleSaveMetadata = async (data: Record<string, unknown>) => {
        if (!bookId) return;
        const updated = await api.books.update(bookId, data as Partial<import("../api/client").BookCreate>);
        setBook((prev) => prev ? {...prev, ...updated} : prev);
    };

    const handleAddChapter = async (chapterType?: ChapterType) => {
        if (!bookId) return;
        const typeLabel = chapterType ? TYPE_LABELS[chapterType] : "Kapitel";
        const title = await dialog.prompt(`${typeLabel} erstellen`, `Titel für das neue ${typeLabel}:`, `z.B. Mein ${typeLabel}`);
        if (!title) return;
        const chapter = await api.chapters.create(bookId, {
            title: title.trim(),
            chapter_type: chapterType || "chapter",
        });
        setBook((prev) => {
            if (!prev) return prev;
            return {...prev, chapters: [...prev.chapters, chapter]};
        });
        setActiveChapterId(chapter.id);
    };

    const handleDeleteChapter = async (chapterId: string) => {
        if (!bookId) return;
        if (!await dialog.confirm("Kapitel loeschen", "Kapitel wirklich loeschen?", "danger")) return;
        await api.chapters.delete(bookId, chapterId);
        setBook((prev) => {
            if (!prev) return prev;
            const chapters = prev.chapters.filter((c) => c.id !== chapterId);
            return {...prev, chapters};
        });
        if (activeChapterId === chapterId) {
            setActiveChapterId(book?.chapters.find((c) => c.id !== chapterId)?.id ?? null);
        }
    };

    const handleSaveContent = async (content: string) => {
        if (!bookId || !activeChapterId) return;
        try {
            const updated = await api.chapters.update(bookId, activeChapterId, {
                content,
            });
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) =>
                        c.id === updated.id ? updated : c
                    ),
                };
            });
        } catch (err) {
            console.error("Autosave failed:", err);
        }
    };

    const handleReorder = async (chapterIds: string[]) => {
        if (!bookId) return;
        try {
            const reordered = await api.chapters.reorder(bookId, chapterIds);
            setBook((prev) => {
                if (!prev) return prev;
                return {...prev, chapters: reordered};
            });
        } catch (err) {
            console.error("Reorder failed:", err);
        }
    };

    const handleExport = () => {
        setShowExport(true);
    };

    if (loading) {
        return (
            <div style={styles.loading}>
                <p>Laden...</p>
            </div>
        );
    }

    if (!book) {
        return (
            <div style={styles.loading}>
                <p>Buch nicht gefunden.</p>
            </div>
        );
    }

    return (
        <div style={styles.layout}>
            {/* Mobile sidebar toggle */}
            {!sidebarOpen && (
                <button
                    className="show-mobile-only btn-icon"
                    style={{position: "fixed", top: 12, left: 12, zIndex: 100, background: "var(--bg-card)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)"}}
                    onClick={() => setSidebarOpen(true)}
                >
                    <Menu size={20}/>
                </button>
            )}
            <div className={sidebarOpen ? "sidebar-wrapper sidebar-open" : "sidebar-wrapper sidebar-closed"}>
            <ChapterSidebar
                bookTitle={book.title}
                chapters={book.chapters}
                activeChapterId={showMetadata ? null : activeChapterId}
                onSelect={(id) => { setActiveChapterId(id); setShowMetadata(false); setSidebarOpen(false); }}
                onAdd={handleAddChapter}
                onDelete={handleDeleteChapter}
                onBack={() => navigate("/")}
                onExport={handleExport}
                onMetadata={() => setShowMetadata(true)}
                showMetadata={showMetadata}
                onReorder={handleReorder}
                hasToc={book.chapters.some((ch) => ch.chapter_type === "toc")}
                onValidateToc={async () => {
                    if (!bookId) return;
                    try {
                        const result = await api.chapters.validateToc(bookId);
                        if (!result.toc_found) {
                            toast.info("Kein Inhaltsverzeichnis gefunden.");
                        } else if (result.valid) {
                            toast.success(`TOC gültig: ${result.total_links} Links geprüft, alle korrekt.`);
                        } else {
                            const broken = result.broken.map((b) => b.text).join(", ");
                            toast.error(`${result.broken_count} ungültige Links: ${broken}`);
                        }
                    } catch {
                        toast.error("Fehler bei der TOC-Validierung.");
                    }
                }}
            />
            </div>

            {showMetadata ? (
                <BookMetadataEditor
                    book={book}
                    onSave={handleSaveMetadata}
                    onBack={() => setShowMetadata(false)}
                    allBooks={allBooks}
                />
            ) : activeChapter ? (
                <Editor
                    key={activeChapter.id}
                    content={activeChapter.content}
                    onSave={handleSaveContent}
                    bookId={bookId}
                    placeholder={`Schreibe "${activeChapter.title}"...`}
                />
            ) : (
                <div style={styles.noChapter}>
                    <p style={styles.noChapterText}>
                        Erstelle dein erstes Kapitel, um zu beginnen.
                    </p>

                    <div style={styles.chapterTypeGrid}>
                        <div style={styles.typeGroup}>
                            <span style={styles.typeGroupLabel}>Front Matter</span>
                            {(["toc", "dedication", "epigraph", "preface", "foreword", "prologue", "introduction"] as ChapterType[]).map((ct) => (
                                <button key={ct} className="btn btn-secondary btn-sm" onClick={() => handleAddChapter(ct)}>
                                    {TYPE_LABELS[ct]}
                                </button>
                            ))}
                        </div>
                        <div style={styles.typeGroup}>
                            <span style={styles.typeGroupLabel}>{t("ui.chapter_types.chapter", "Kapitel")}</span>
                            <button className="btn btn-primary" onClick={() => handleAddChapter("chapter")}>
                                {t("ui.editor.new_chapter", "Neues Kapitel")}
                            </button>
                            {(["part_intro", "interlude"] as ChapterType[]).map((ct) => (
                                <button key={ct} className="btn btn-secondary btn-sm" onClick={() => handleAddChapter(ct)}>
                                    {TYPE_LABELS[ct]}
                                </button>
                            ))}
                        </div>
                        <div style={styles.typeGroup}>
                            <span style={styles.typeGroupLabel}>Back Matter</span>
                            {(["epilogue", "afterword", "about_author", "acknowledgments", "appendix", "bibliography", "endnotes", "glossary", "index", "imprint", "next_in_series"] as ChapterType[]).map((ct) => (
                                <button key={ct} className="btn btn-secondary btn-sm" onClick={() => handleAddChapter(ct)}>
                                    {TYPE_LABELS[ct]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {bookId && (
                <ExportDialog
                    open={showExport}
                    bookId={bookId}
                    bookTitle={book.title}
                    hasManualToc={book.chapters.some((ch) => ch.chapter_type === "toc")}
                    onClose={() => setShowExport(false)}
                />
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    layout: {
        display: "flex",
        height: "100vh",
        overflow: "hidden",
    },
    loading: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "var(--text-muted)",
    },
    noChapter: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
    },
    noChapterText: {
        color: "var(--text-muted)",
        fontFamily: "var(--font-display)",
        fontSize: "1.125rem",
    },
    chapterTypeGrid: {
        display: "flex",
        gap: 24,
        marginTop: 8,
    },
    typeGroup: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "stretch",
        minWidth: 140,
    },
    typeGroupLabel: {
        fontSize: "0.6875rem",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        color: "var(--text-muted)",
        marginBottom: 4,
    },
};
