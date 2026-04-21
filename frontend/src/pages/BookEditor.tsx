import {useEffect, useState, useCallback} from "react";
import {useParams, useNavigate, useSearchParams} from "react-router-dom";
import {api, ApiError, SaveAbortedError, BookDetail, Chapter, ChapterType} from "../api/client";
import ConflictResolutionDialog, {type ConflictInfo} from "../components/ConflictResolutionDialog";
import ChapterVersionsModal from "../components/ChapterVersionsModal";
import ChapterSidebar from "../components/ChapterSidebar";
import Editor from "../components/Editor";
import ExportDialog from "../components/ExportDialog";
import GitBackupDialog from "../components/GitBackupDialog";
import BookMetadataEditor from "../components/BookMetadataEditor";
import type {NavigableFindingType} from "../components/QualityTab";
import SaveAsTemplateModal from "../components/SaveAsTemplateModal";
import ChapterTemplatePickerModal from "../components/ChapterTemplatePickerModal";
import SaveAsChapterTemplateModal from "../components/SaveAsChapterTemplateModal";
import {useDialog} from "../components/AppDialog";
import {notify} from "../utils/notify";
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
        part: t("ui.chapter_types.part", "Teil"),
        part_intro: t("ui.chapter_types.part_intro", "Teil-Einleitung"),
        interlude: t("ui.chapter_types.interlude", "Interludium"),
        toc: t("ui.chapter_types.toc", "Inhaltsverzeichnis"),
        dedication: t("ui.chapter_types.dedication", "Widmung"),
        prologue: t("ui.chapter_types.prologue", "Prolog"),
        introduction: t("ui.chapter_types.introduction", "Einleitung"),
        afterword: t("ui.chapter_types.afterword", "Nachwort"),
        final_thoughts: t("ui.chapter_types.final_thoughts", "Schlussgedanken"),
        index: t("ui.chapter_types.index", "Stichwortverzeichnis"),
        epigraph: t("ui.chapter_types.epigraph", "Motto"),
        endnotes: t("ui.chapter_types.endnotes", "Endnoten"),
        also_by_author: t("ui.chapter_types.also_by_author", "Weitere Bücher"),
        excerpt: t("ui.chapter_types.excerpt", "Leseprobe"),
        call_to_action: t("ui.chapter_types.call_to_action", "Aufruf zur Aktion"),
    };
    const [book, setBook] = useState<BookDetail | null>(null);
    const [allBooks, setAllBooks] = useState<import("../api/client").Book[]>([]);
    const [showExport, setShowExport] = useState(false);
    const [showGitBackup, setShowGitBackup] = useState(false);
    const [gitSyncState, setGitSyncState] = useState<string | null>(null);
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [showChapterTemplatePicker, setShowChapterTemplatePicker] = useState(false);
    const [saveChapterTemplateId, setSaveChapterTemplateId] = useState<string | null>(null);
    const [versionsChapterId, setVersionsChapterId] = useState<string | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [showMetadata, setShowMetadata] = useState(searchParams.get("view") === "metadata");

    // Keep ``?view=metadata`` in sync so the audiobook badge can deep-link
    // here after a completed export and so a browser back/forward retains
    // the user's view choice.
    useEffect(() => {
        const wantsMetadata = searchParams.get("view") === "metadata";
        if (wantsMetadata !== showMetadata) {
            setShowMetadata(wantsMetadata);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const _setShowMetadata = (next: boolean) => {
        setShowMetadata(next);
        const params = new URLSearchParams(searchParams);
        if (next) params.set("view", "metadata");
        else params.delete("view");
        setSearchParams(params, {replace: true});
    };
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
    const [pendingFocus, setPendingFocus] = useState<{chapterId: string; type: NavigableFindingType; seq: number} | null>(null);
    const [conflict, setConflict] = useState<ConflictInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [editorSettings, setEditorSettings] = useState<{
        autosave_debounce_ms?: number;
        draft_save_debounce_ms?: number;
        draft_max_age_days?: number;
        ai_context_chars?: number;
    }>({});

    const activeChapterMeta = book?.chapters.find((c) => c.id === activeChapterId) ?? null;
    // Loaded chapter content (fetched on demand, not with the book)
    const [loadedContent, setLoadedContent] = useState<{id: string; content: string} | null>(null);
    const [contentLoading, setContentLoading] = useState(false);

    // Fetch chapter content when active chapter changes
    useEffect(() => {
        if (!bookId || !activeChapterId) { setLoadedContent(null); return; }
        if (loadedContent?.id === activeChapterId) return;
        setContentLoading(true);
        api.chapters.get(bookId, activeChapterId)
            .then((ch) => setLoadedContent({id: ch.id, content: ch.content}))
            .catch(() => notify.error(t("ui.common.error", "Fehler beim Laden")))
            .finally(() => setContentLoading(false));
    }, [bookId, activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshGitSync = useCallback(async () => {
        if (!bookId) return;
        try {
            const sync = await api.git.syncStatus(bookId);
            setGitSyncState(sync.state);
        } catch {
            // Non-fatal: repo may not be initialized yet.
            setGitSyncState(null);
        }
    }, [bookId]);

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
            void refreshGitSync();
        } catch (err) {
            console.error("Failed to load book:", err);
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        loadBook();
        api.settings.getApp().then((cfg) => {
            const ed = (cfg as Record<string, unknown>).editor as Record<string, number> | undefined;
            if (ed) setEditorSettings(ed);
        }).catch(() => {});
        api.books.list().then(setAllBooks).catch(() => {});
    }, [loadBook]);

    const handleNavigateToIssue = (chapterId: string, findingType: NavigableFindingType) => {
        setPendingFocus((prev) => ({
            chapterId,
            type: findingType,
            seq: (prev?.seq ?? 0) + 1,
        }));
        setActiveChapterId(chapterId);
        _setShowMetadata(false);
        setSidebarOpen(false);
    };

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

    const handleAddChapterFromTemplate = async (template: import("../api/client").ChapterTemplate) => {
        if (!bookId) return;
        try {
            const chapter = await api.chapters.create(bookId, {
                title: template.name,
                chapter_type: template.chapter_type,
                content: template.content ?? "",
            });
            setBook((prev) => {
                if (!prev) return prev;
                return {...prev, chapters: [...prev.chapters, chapter]};
            });
            setActiveChapterId(chapter.id);
            notify.success(t("ui.chapter_template_picker.inserted", "Kapitel aus Vorlage eingefuegt"));
        } catch (err) {
            notify.error(
                t("ui.chapter_template_picker.insert_failed", "Einfuegen fehlgeschlagen"),
            );
            throw err;
        }
    };

    const handleRenameChapter = async (chapterId: string, newTitle: string) => {
        if (!bookId) return;
        const current = book?.chapters.find((c) => c.id === chapterId);
        if (!current) return;
        try {
            const updated = await api.chapters.update(bookId, chapterId, {
                title: newTitle,
                version: current.version,
            });
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) => c.id === updated.id ? {...c, title: updated.title, version: updated.version} : c),
                };
            });
        } catch (err) {
            // A newer rename superseded this one; the later one will
            // resolve state. No user-visible error.
            if (err instanceof SaveAbortedError) return;
            notify.error(t("ui.editor.rename_failed", "Umbenennen fehlgeschlagen"));
        }
    };

    const handleDeleteChapter = async (chapterId: string) => {
        if (!bookId) return;
        if (!await dialog.confirm(t("ui.editor.delete_chapter_title", "Kapitel löschen"), t("ui.editor.delete_chapter_confirm", "Kapitel wirklich löschen?"), "danger")) return;
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
        const current = book?.chapters.find((c) => c.id === activeChapterId);
        if (!current) return;
        try {
            // Rethrow on failure so the Editor sees the error and sets
            // its status to "error" instead of lying with "saved". 409
            // (version_conflict) is caught below and routed into the
            // conflict resolution dialog.
            const updated = await api.chapters.update(bookId, activeChapterId, {
                content,
                version: current.version,
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
            if (err instanceof ApiError && err.status === 409 && err.detailBody) {
                const body = err.detailBody as {
                    current_version?: number;
                    server_content?: string;
                    server_title?: string;
                    server_updated_at?: string;
                };
                if (typeof body.current_version === "number" && typeof body.server_content === "string") {
                    setConflict({
                        chapterId: activeChapterId,
                        localContent: content,
                        serverContent: body.server_content,
                        serverVersion: body.current_version,
                        serverTitle: body.server_title,
                        serverUpdatedAt: body.server_updated_at,
                    });
                }
            }
            throw err;
        }
    };

    const resolveConflictKeepLocal = async (info: ConflictInfo) => {
        if (!bookId) return;
        try {
            const updated = await api.chapters.update(bookId, info.chapterId, {
                content: info.localContent,
                version: info.serverVersion,
            });
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
                };
            });
            setLoadedContent({id: updated.id, content: updated.content});
            setConflict(null);
            notify.success(t("ui.conflict.saved_local", "Deine Änderungen wurden gespeichert."));
        } catch {
            notify.error(t("ui.conflict.save_failed_again", "Speichern fehlgeschlagen. Bitte erneut versuchen."));
        }
    };

    const resolveConflictDiscardLocal = (info: ConflictInfo) => {
        if (!bookId) return;
        setBook((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                chapters: prev.chapters.map((c) =>
                    c.id === info.chapterId ? {...c, content: info.serverContent, version: info.serverVersion} : c,
                ),
            };
        });
        setLoadedContent({id: info.chapterId, content: info.serverContent});
        setConflict(null);
        notify.info(t("ui.conflict.server_restored", "Server-Version geladen."));
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
                onSelect={(id) => { setActiveChapterId(id); _setShowMetadata(false); setSidebarOpen(false); }}
                onAdd={handleAddChapter}
                onDelete={handleDeleteChapter}
                onRename={handleRenameChapter}
                onBack={() => navigate("/")}
                onExport={handleExport}
                onGitBackup={() => setShowGitBackup(true)}
                gitSyncState={gitSyncState}
                onMetadata={() => _setShowMetadata(true)}
                onSaveAsTemplate={() => setShowSaveTemplate(true)}
                onAddFromTemplate={() => setShowChapterTemplatePicker(true)}
                onSaveAsChapterTemplate={(id) => setSaveChapterTemplateId(id)}
                onShowVersions={(id) => setVersionsChapterId(id)}
                showMetadata={showMetadata}
                onReorder={handleReorder}
                hasToc={book.chapters.some((ch) => ch.chapter_type === "toc")}
                onValidateToc={async () => {
                    if (!bookId) return;
                    try {
                        const result = await api.chapters.validateToc(bookId);
                        if (!result.toc_found) {
                            notify.info(t("ui.editor.toc_not_found", "Kein Inhaltsverzeichnis gefunden."));
                        } else if (result.valid) {
                            notify.success(t("ui.editor.toc_valid", "TOC gültig: alle Links korrekt."));
                        } else {
                            const broken = result.broken.map((b) => b.text).join(", ");
                            notify.error(t("ui.editor.toc_invalid", "Ungültige Links") + `: ${broken}`);
                        }
                    } catch {
                        notify.error(t("ui.editor.toc_error", "Fehler bei der TOC-Validierung."));
                    }
                }}
            />
            </div>

            {showMetadata ? (
                <BookMetadataEditor
                    book={book}
                    onSave={handleSaveMetadata}
                    onBack={() => _setShowMetadata(false)}
                    allBooks={allBooks}
                    onNavigateToIssue={handleNavigateToIssue}
                />
            ) : activeChapterMeta && loadedContent?.id === activeChapterMeta.id && !contentLoading ? (
                <Editor
                    key={activeChapterMeta.id}
                    content={loadedContent.content}
                    onSave={handleSaveContent}
                    bookId={bookId}
                    chapterId={activeChapterMeta.id}
                    chapterTitle={activeChapterMeta.title}
                    chapterType={activeChapterMeta.chapter_type}
                    chapterVersion={activeChapterMeta.version}
                    bookContext={{
                        title: book.title,
                        author: book.author,
                        language: book.language || "de",
                        genre: book.genre || "",
                        description: book.description || "",
                    }}
                    placeholder={`Schreibe "${activeChapterMeta.title}"...`}
                    autosaveDebounceMs={editorSettings.autosave_debounce_ms}
                    draftSaveDebounceMs={editorSettings.draft_save_debounce_ms}
                    draftMaxAgeDays={editorSettings.draft_max_age_days}
                    aiContextChars={editorSettings.ai_context_chars}
                    initialFocus={pendingFocus && pendingFocus.chapterId === activeChapterMeta.id ? {type: pendingFocus.type, seq: pendingFocus.seq} : undefined}
                />
            ) : activeChapterMeta && contentLoading ? (
                <div style={styles.loading}><p>{t("ui.common.loading", "Laden...")}</p></div>
            ) : (
                <div style={styles.noChapter}>
                    <p style={styles.noChapterText}>
                        Erstelle dein erstes Kapitel, um zu beginnen.
                    </p>

                    <div style={styles.chapterTypeGrid}>
                        <div style={styles.typeGroup}>
                            <span style={styles.typeGroupLabel}>{t("ui.sidebar.front_matter", "Front Matter")}</span>
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
                            <span style={styles.typeGroupLabel}>{t("ui.sidebar.back_matter", "Back Matter")}</span>
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

            {bookId && (
                <GitBackupDialog
                    open={showGitBackup}
                    bookId={bookId}
                    onClose={() => {
                        setShowGitBackup(false);
                        void refreshGitSync();
                    }}
                />
            )}

            <SaveAsTemplateModal
                open={showSaveTemplate}
                book={book}
                onClose={() => setShowSaveTemplate(false)}
            />

            <ChapterTemplatePickerModal
                open={showChapterTemplatePicker}
                onClose={() => setShowChapterTemplatePicker(false)}
                onInsert={handleAddChapterFromTemplate}
            />

            {saveChapterTemplateId && bookId && (() => {
                const ch = book.chapters.find((c) => c.id === saveChapterTemplateId);
                if (!ch) return null;
                return (
                    <SaveAsChapterTemplateModal
                        open={true}
                        chapter={ch}
                        bookId={bookId}
                        onClose={() => setSaveChapterTemplateId(null)}
                    />
                );
            })()}
            <ConflictResolutionDialog
                conflict={conflict}
                onKeepLocal={resolveConflictKeepLocal}
                onDiscardLocal={resolveConflictDiscardLocal}
            />
            {bookId ? (
                <ChapterVersionsModal
                    open={versionsChapterId !== null}
                    bookId={bookId}
                    chapterId={versionsChapterId}
                    onClose={() => setVersionsChapterId(null)}
                    onRestored={async (restoredId) => {
                        // Reload the book so the restored chapter's new content
                        // and bumped version land in state.
                        if (!bookId) return;
                        try {
                            const fresh = await api.books.get(bookId);
                            setBook(fresh);
                            if (restoredId === activeChapterId) {
                                const ch = fresh.chapters.find((c) => c.id === restoredId);
                                if (ch) setLoadedContent({id: ch.id, content: ch.content});
                            }
                        } catch {
                            /* next interaction will reload */
                        }
                    }}
                />
            ) : null}
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
