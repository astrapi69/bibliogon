import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError, SaveAbortedError, BookDetail, ChapterType } from "../api/client";
import ConflictResolutionDialog, {
    type ConflictInfo,
} from "../components/import/ConflictResolutionDialog";
import ChapterSidebar from "../components/book/ChapterSidebar";
import { OfflineToggleButton } from "../components/OfflineToggleButton";
import { getStorage } from "../storage";
import StoryBibleSidebar from "../components/StoryBibleSidebar";
import StoryEntityEditor from "../components/StoryEntityEditor";
import Storyboard from "../components/Storyboard";
import ProseStoryboard from "../components/ProseStoryboard";
import ChapterOutliner from "../components/book/ChapterOutliner";
import RelationshipGraphView from "../components/RelationshipGraphView";
import { pageableBookTypeIds, useBookTypes } from "../hooks/book/useBookTypes";
import Editor from "../components/editor/Editor";
import BookMetadataEditor from "../components/book/BookMetadataEditor";
import type { NavigableFindingType } from "../components/QualityTab";
import SaveAsTemplateModal from "../components/SaveAsTemplateModal";
import ChapterTemplatePickerModal from "../components/book/ChapterTemplatePickerModal";
import SaveAsChapterTemplateModal from "../components/SaveAsChapterTemplateModal";
import { useDialog } from "../components/shared/AppDialog";
import { notify } from "../utils/platform/notify";
import { useI18n } from "../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { useSidebarCollapse, SIDEBAR_MOBILE_BREAKPOINT_PX } from "../hooks/ui/useSidebarCollapse";
import { useExclusiveSidebars } from "../hooks/ui/useExclusiveSidebars";
import { useBookEditorViews } from "../hooks/book/useBookEditorViews";
import { SidebarToggleButton } from "../components/SidebarToggleButton";
import { SidebarOverlay } from "../lib/components/SidebarOverlay";
import { EditorMenu } from "../lib/components/EditorMenu";
import { buildBookEditorMenu } from "./buildBookEditorMenu";
import { chapterTypeLabels } from "../lib/chapterTypeLabels";
import { BookOpen, Plus } from "lucide-react";
import { EmptyState } from "../lib/components/EmptyState";
import { LoadingIndicator } from "../components/LoadingIndicator";
import styles from "./BookEditor.module.css";
import { EDITOR_COMPONENTS, STORYBOARD_BOOK_TYPES } from "./bookEditorDispatch";

export default function BookEditor() {
    const { bookId } = useParams<{ bookId: string }>();
    const navigate = useNavigate();
    const dialog = useDialog();
    const { t } = useI18n();
    const gitSync = useFeature(FEATURES.GIT_SYNC);
    const versionHistory = useFeature(FEATURES.VERSION_HISTORY);
    const offlineGate = !gitSync.isActive;
    const bookTypesSnapshot = useBookTypes();
    const {
        open: sidebarOpen,
        toggle: toggleSidebar,
        setOpen: setSidebarOpen,
    } = useSidebarCollapse("bibliogon-book-editor-sidebar");
    const closeSidebarOnNarrow = useCallback(() => {
        if (typeof window !== "undefined" && window.innerWidth < SIDEBAR_MOBILE_BREAKPOINT_PX) {
            setSidebarOpen(false);
        }
    }, [setSidebarOpen]);
    // Story Bible (plugin-story-bible). Availability is probed once
    // via getInfo (404 when the plugin is disabled); the panel + its
    // toggle only render when the plugin is mounted.
    const [storyBibleAvailable, setStoryBibleAvailable] = useState(false);
    const [storyBibleOpen, setStoryBibleOpen] = useState(false);
    // Mobile mutual-exclusion for the left ChapterSidebar + right
    // StoryBibleSidebar overlays (see useExclusiveSidebars).
    const { toggleLeft: toggleSidebarExclusive, openRight: openStoryBibleExclusive } =
        useExclusiveSidebars(sidebarOpen, toggleSidebar, setSidebarOpen, setStoryBibleOpen);
    // The Story Bible entry whose detail/edit view occupies the main
    // content area (C5). refreshKey re-fetches the sidebar list after
    // editor-driven changes.
    const [selectedStoryEntityId, setSelectedStoryEntityId] = useState<string | null>(null);
    const [storyBibleRefreshKey, setStoryBibleRefreshKey] = useState(0);
    const TYPE_LABELS = chapterTypeLabels(t);
    const [book, setBook] = useState<BookDetail | null>(null);
    const [allBooks, setAllBooks] = useState<import("../api/client").Book[]>([]);
    const [gitSyncState, setGitSyncState] = useState<string | null>(null);
    const [gitSyncMapped, setGitSyncMapped] = useState(false);
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [showChapterTemplatePicker, setShowChapterTemplatePicker] = useState(false);
    const [saveChapterTemplateId, setSaveChapterTemplateId] = useState<string | null>(null);
    const {
        showMetadata,
        showStoryboard,
        showOutline,
        showRelationships,
        _setShowMetadata,
        _setShowStoryboard,
        _setShowOutline,
        _setShowRelationships,
        activeChapterId,
        setActiveChapterId,
        selectChapter,
    } = useBookEditorViews(() => setSelectedStoryEntityId(null));

    // Probe Story-Bible availability once via the storage seam. Online,
    // getInfo rejects (404) when the plugin is disabled -> stays hidden.
    // Offline (Dexie) the seam returns availability, so the Story Bible
    // works against IndexedDB (Maximal Offline P3) instead of being gated.
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .storyBible.getInfo()
            .then(() => {
                if (!cancelled) setStoryBibleAvailable(true);
            })
            .catch(() => {
                if (!cancelled) setStoryBibleAvailable(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const [pendingFocus, setPendingFocus] = useState<{
        chapterId: string;
        type: NavigableFindingType;
        seq: number;
    } | null>(null);
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
    const [loadedContent, setLoadedContent] = useState<{
        id: string;
        content: string;
    } | null>(null);
    const [contentLoading, setContentLoading] = useState(false);

    // Authoritative per-chapter version (chapterId -> version). Seeded on
    // content load and updated synchronously from every successful save /
    // rename / conflict response, so a rapid second autosave sends the
    // post-bump version instead of the stale one from the lagging `book`
    // state (the 409 self-conflict). The api client's per-chapter
    // AbortController already gives latest-save-wins at the network layer.
    const chapterVersions = useRef<Record<string, number>>({});

    // Fetch chapter content when active chapter changes
    useEffect(() => {
        if (!bookId || !activeChapterId) {
            setLoadedContent(null);
            return;
        }
        if (loadedContent?.id === activeChapterId) return;
        setContentLoading(true);
        getStorage()
            .chapters.get(bookId, activeChapterId)
            .then((ch) => {
                chapterVersions.current[ch.id] = ch.version;
                setLoadedContent({ id: ch.id, content: ch.content });
            })
            .catch(() => notify.error(t("ui.common.error", "Fehler beim Laden")))
            .finally(() => setContentLoading(false));
    }, [bookId, activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshGitSync = useCallback(async () => {
        if (!bookId || offlineGate) return;
        try {
            const sync = await api.git.syncStatus(bookId);
            setGitSyncState(sync.state);
        } catch {
            // Non-fatal: repo may not be initialized yet.
            setGitSyncState(null);
        }
    }, [bookId, offlineGate]);

    const refreshGitSyncMapping = useCallback(async () => {
        if (!bookId || offlineGate) return;
        try {
            const mapping = await api.gitSync.status(bookId);
            setGitSyncMapped(mapping.mapped);
        } catch {
            // Non-fatal: 200/{mapped:false} is the normal "no mapping"
            // shape so anything that throws is a server/network blip;
            // hide the button rather than spam toasts.
            setGitSyncMapped(false);
        }
    }, [bookId, offlineGate]);

    // Bootstrap effect: load book + app settings + book list.
    //
    // StrictMode in dev mode (frontend/src/main.tsx) re-runs effects
    // after a synthetic unmount/remount cycle. Without the cancel
    // guard below, both mounts trigger ``loadBook``; the second
    // response calls ``setBook`` after the user has already started
    // editing, and the new ``book`` object reference cascades into
    // BookMetadataEditor's ``useEffect([book])`` which resets the
    // user's local form/keyword state. The keywords-editor smoke
    // tests caught this as "the first keyword added is dropped".
    useEffect(() => {
        let cancelled = false;
        const runLoad = async () => {
            if (!bookId) return;
            try {
                const data = await getStorage().books.get(bookId);
                if (cancelled) return;
                setBook(data);
                if (data.chapters.length > 0) {
                    setActiveChapterId((prev) => {
                        if (prev && data.chapters.some((c) => c.id === prev)) return prev;
                        return data.chapters[0].id;
                    });
                } else {
                    setActiveChapterId(null);
                }
                void refreshGitSync();
                void refreshGitSyncMapping();
            } catch (err) {
                if (!cancelled) console.error("Failed to load book:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void runLoad();
        getStorage()
            .settings.getApp()
            .then((cfg) => {
                if (cancelled) return;
                const ed = (cfg as Record<string, unknown>).editor as
                    | Record<string, number>
                    | undefined;
                if (ed) setEditorSettings(ed);
            })
            .catch(() => {});
        getStorage()
            .books.list()
            .then((list) => {
                if (cancelled) return;
                setAllBooks(list);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId]);

    const handleNavigateToIssue = (chapterId: string, findingType: NavigableFindingType) => {
        setPendingFocus((prev) => ({
            chapterId,
            type: findingType,
            seq: (prev?.seq ?? 0) + 1,
        }));
        selectChapter(chapterId);
        closeSidebarOnNarrow();
    };

    const handleSaveMetadata = async (data: Record<string, unknown>) => {
        if (!bookId) return;
        const updated = await getStorage().books.update(
            bookId,
            data as Partial<import("../api/client").BookCreate>,
        );
        setBook((prev) => (prev ? { ...prev, ...updated } : prev));
    };

    const handleAddChapter = async (chapterType?: ChapterType) => {
        if (!bookId) return;
        const typeLabel = chapterType ? TYPE_LABELS[chapterType] : "Kapitel";
        const title = await dialog.prompt(
            `${typeLabel} erstellen`,
            `Titel für das neue ${typeLabel}:`,
            `z.B. Mein ${typeLabel}`,
        );
        if (!title) return;
        const chapter = await getStorage().chapters.create(bookId, {
            title: title.trim(),
            chapter_type: chapterType || "chapter",
        });
        setBook((prev) => {
            if (!prev) return prev;
            return { ...prev, chapters: [...prev.chapters, chapter] };
        });
        setActiveChapterId(chapter.id);
    };

    const handleAddChapterFromTemplate = async (
        template: import("../api/client").ChapterTemplate,
    ) => {
        if (!bookId) return;
        const childIds = template.child_template_ids ?? [];
        // Group template: insert one chapter per child, in list order.
        // Insertion is intentionally NOT transactional here - on a
        // mid-loop failure the chapters created so far stay so the user
        // can decide whether to retry the rest or delete the partial
        // result.
        if (childIds.length > 0) {
            try {
                const children = await Promise.all(
                    childIds.map((cid) => api.chapterTemplates.get(cid)),
                );
                const created: import("../api/client").Chapter[] = [];
                for (const child of children) {
                    const chapter = await getStorage().chapters.create(bookId, {
                        title: child.name,
                        chapter_type: child.chapter_type,
                        content: child.content ?? "",
                    });
                    created.push(chapter);
                }
                setBook((prev) => {
                    if (!prev) return prev;
                    return { ...prev, chapters: [...prev.chapters, ...created] };
                });
                if (created.length > 0) setActiveChapterId(created[0].id);
                notify.success(
                    t(
                        "ui.chapter_template_picker.inserted_group",
                        "{count} Kapitel aus Gruppe eingefügt",
                    ).replace("{count}", String(created.length)),
                );
            } catch (err) {
                notify.error(
                    t("ui.chapter_template_picker.insert_failed", "Einfügen fehlgeschlagen"),
                );
                throw err;
            }
            return;
        }

        try {
            const chapter = await getStorage().chapters.create(bookId, {
                title: template.name,
                chapter_type: template.chapter_type,
                content: template.content ?? "",
            });
            setBook((prev) => {
                if (!prev) return prev;
                return { ...prev, chapters: [...prev.chapters, chapter] };
            });
            setActiveChapterId(chapter.id);
            notify.success(
                t("ui.chapter_template_picker.inserted", "Kapitel aus Vorlage eingefügt"),
            );
        } catch (err) {
            notify.error(
                t("ui.chapter_template_picker.insert_failed", "Einfügen fehlgeschlagen"),
                err,
            );
            throw err;
        }
    };

    const handleRenameChapter = async (chapterId: string, newTitle: string) => {
        if (!bookId) return;
        const current = book?.chapters.find((c) => c.id === chapterId);
        if (!current) return;
        try {
            const updated = await getStorage().chapters.update(bookId, chapterId, {
                title: newTitle,
                version: chapterVersions.current[chapterId] ?? current.version,
            });
            chapterVersions.current[updated.id] = updated.version;
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) =>
                        c.id === updated.id
                            ? { ...c, title: updated.title, version: updated.version }
                            : c,
                    ),
                };
            });
        } catch (err) {
            // A newer rename superseded this one; the later one will
            // resolve state. No user-visible error.
            if (err instanceof SaveAbortedError) return;
            notify.error(t("ui.editor.rename_failed", "Umbenennen fehlgeschlagen"), err);
        }
    };

    const handleDeleteChapter = async (chapterId: string) => {
        if (!bookId) return;
        if (
            !(await dialog.confirm(
                t("ui.editor.delete_chapter_title", "Kapitel löschen"),
                t("ui.editor.delete_chapter_confirm", "Kapitel wirklich löschen?"),
                "danger",
            ))
        )
            return;
        await getStorage().chapters.delete(bookId, chapterId);
        setBook((prev) => {
            if (!prev) return prev;
            const chapters = prev.chapters.filter((c) => c.id !== chapterId);
            return { ...prev, chapters };
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
            const updated = await getStorage().chapters.update(bookId, activeChapterId, {
                content,
                version: chapterVersions.current[activeChapterId] ?? current.version,
            });
            chapterVersions.current[updated.id] = updated.version;
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
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
                if (
                    typeof body.current_version === "number" &&
                    typeof body.server_content === "string"
                ) {
                    chapterVersions.current[activeChapterId] = body.current_version;
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
            const updated = await getStorage().chapters.update(bookId, info.chapterId, {
                content: info.localContent,
                version: info.serverVersion,
            });
            chapterVersions.current[updated.id] = updated.version;
            setBook((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
                };
            });
            setLoadedContent({ id: updated.id, content: updated.content });
            setConflict(null);
            notify.success(t("ui.conflict.saved_local", "Deine Änderungen wurden gespeichert."));
        } catch {
            notify.error(
                t(
                    "ui.conflict.save_failed_again",
                    "Speichern fehlgeschlagen. Bitte erneut versuchen.",
                ),
            );
        }
    };

    const resolveConflictDiscardLocal = (info: ConflictInfo) => {
        if (!bookId) return;
        chapterVersions.current[info.chapterId] = info.serverVersion;
        setBook((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                chapters: prev.chapters.map((c) =>
                    c.id === info.chapterId
                        ? { ...c, content: info.serverContent, version: info.serverVersion }
                        : c,
                ),
            };
        });
        setLoadedContent({ id: info.chapterId, content: info.serverContent });
        setConflict(null);
        notify.info(t("ui.conflict.server_restored", "Server-Version geladen."));
    };

    const resolveConflictSaveAsNew = async (info: ConflictInfo) => {
        if (!bookId) return;
        try {
            const sourceTitle = info.serverTitle ?? "";
            const draftSuffix = t("ui.conflict.local_draft_suffix", "(Lokaler Entwurf)");
            const forkedTitle = sourceTitle ? `${sourceTitle} ${draftSuffix}`.trim() : undefined;
            const newChapter = await api.chapters.fork(bookId, info.chapterId, {
                content: info.localContent,
                title: forkedTitle,
            });
            // Reload the book so the new chapter shows up + every
            // position bumped on the server is reflected in state.
            const fresh = await getStorage().books.get(bookId);
            for (const ch of fresh.chapters) {
                chapterVersions.current[ch.id] = ch.version;
            }
            setBook(fresh);
            // Source chapter keeps the server's content; load that
            // into the editor so the user sees the canonical version.
            setLoadedContent({ id: info.chapterId, content: info.serverContent });
            setConflict(null);
            notify.success(
                t(
                    "ui.conflict.saved_as_new_chapter",
                    'Lokale Änderungen wurden als neues Kapitel "{title}" gespeichert.',
                ).replace("{title}", newChapter.title),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.conflict.save_as_new_failed",
                        "Speichern als neues Kapitel fehlgeschlagen.",
                    ),
                    err,
                );
            }
        }
    };

    const handleReorder = async (chapterIds: string[]) => {
        if (!bookId) return;
        try {
            const reordered = await getStorage().chapters.reorder(bookId, chapterIds);
            setBook((prev) => {
                if (!prev) return prev;
                return { ...prev, chapters: reordered };
            });
        } catch (err) {
            console.error("Reorder failed:", err);
        }
    };

    const handleExport = () => {
        navigate(`/books/${bookId}/export`);
    };

    const handleValidateToc = async () => {
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
    };

    if (loading) {
        return (
            <LoadingIndicator
                testId="book-editor-loading"
                variant="block"
                label={t("ui.common.loading", "Laden...")}
                className={styles.loading}
            />
        );
    }

    if (!book) {
        return (
            <div className={styles.loading} data-testid="book-editor-not-found">
                <p>{t("ui.editor.book_not_found", "Buch nicht gefunden.")}</p>
            </div>
        );
    }

    // BOOK-TYPES-SSOT-YAML-01 C6: page-based book dispatch via the
    // BookTypeRegistry. Replaces the two near-identical
    // ``book.book_type === "picture_book"`` + ``=== "comic_book"``
    // branches that each duplicated the showMetadata-swap pattern.
    //
    // The registry's content_model="pages" flag picks page-based
    // types; the editor_component name (e.g. "PageEditor",
    // "ComicBookEditor") resolves to the React component via the
    // EDITOR_COMPONENTS map declared at module top. Unknown editor
    // names fall through to the prose path (negative-default safe).
    //
    // PB-PHASE4 Session 5 Commit 2 + COMIC-BOOK-EDITOR-METADATA-
    // BUTTON-01 C2: when ?view=metadata is set (or the editor's
    // "Open metadata" button fires), render BookMetadataEditor
    // in place of the page-based editor — same URL-routed pattern
    // as the prose flow.
    if (pageableBookTypeIds(bookTypesSnapshot).has(book.book_type)) {
        const editorName = bookTypesSnapshot.types[book.book_type]?.editor_component;
        const EditorComponent = editorName ? EDITOR_COMPONENTS[editorName] : undefined;
        if (EditorComponent) {
            const storyboardSupported = STORYBOARD_BOOK_TYPES.has(book.book_type);
            if (showStoryboard && storyboardSupported) {
                return (
                    <Storyboard
                        bookId={book.id}
                        bookTitle={book.title}
                        onBack={() => _setShowStoryboard(false)}
                        onSelectPage={() => _setShowStoryboard(false)}
                    />
                );
            }
            if (showMetadata) {
                return (
                    <BookMetadataEditor
                        book={book}
                        onSave={async (data) => {
                            const updated = await getStorage().books.update(book.id, data);
                            setBook((prev) =>
                                prev ? ({ ...prev, ...updated } as BookDetail) : prev,
                            );
                        }}
                        onBack={() => _setShowMetadata(false)}
                        allBooks={allBooks}
                        onRefresh={async () => {
                            if (!bookId) return;
                            const fresh = await getStorage().books.get(bookId);
                            setBook(fresh);
                        }}
                    />
                );
            }
            return (
                <EditorComponent
                    bookId={book.id}
                    bookTitle={book.title}
                    onBack={() => navigate("/")}
                    onShowMetadata={() => _setShowMetadata(true)}
                    onShowStoryboard={
                        storyboardSupported ? () => _setShowStoryboard(true) : undefined
                    }
                    onTitleSave={async (newTitle) => {
                        const updated = await getStorage().books.update(book.id, {
                            title: newTitle,
                        });
                        setBook((prev) => (prev ? ({ ...prev, ...updated } as BookDetail) : prev));
                    }}
                    isPublished={book.status === "published" || book.status === "archived"}
                />
            );
        }
    }

    const {
        groups: menuGroups,
        disabled: menuDisabled,
        onAction: handleMenuAction,
    } = buildBookEditorMenu({
        t,
        navigate,
        bookId,
        offlineGate,
        storyBibleAvailable,
        setSelectedStoryEntityId,
        closeSidebarOnNarrow,
        setShowMetadata: _setShowMetadata,
        setShowStoryboard: _setShowStoryboard,
        setShowOutline: _setShowOutline,
        setShowRelationships: _setShowRelationships,
        openStoryBible: openStoryBibleExclusive,
        onExport: handleExport,
        onValidateToc: handleValidateToc,
        onAddChapter: handleAddChapter,
        onAddFromTemplate: () => setShowChapterTemplatePicker(true),
        onSaveAsTemplate: () => setShowSaveTemplate(true),
    });

    return (
        <div className={styles.layout} data-testid="book-editor">
            <h1 className="sr-only">{book.title || "Bibliogon"}</h1>
            {!sidebarOpen && (
                <SidebarToggleButton
                    open={false}
                    onToggle={toggleSidebarExclusive}
                    testId="book-editor-sidebar-toggle"
                    className="fixed left-3 top-3 z-[100] bg-card shadow-[var(--shadow-md)]"
                />
            )}
            <SidebarOverlay
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                testId="book-editor-sidebar-overlay"
            />
            <div
                data-testid="book-editor-sidebar"
                data-sidebar-open={sidebarOpen}
                className={[
                    "shrink-0 overflow-hidden transition-[width] duration-200",
                    "fixed inset-y-0 left-0 z-[90] shadow-[var(--shadow-md)]",
                    "menu:static menu:inset-auto menu:z-auto menu:shadow-none",
                    sidebarOpen ? "w-[260px]" : "w-0",
                ].join(" ")}
            >
                <ChapterSidebar
                    bookTitle={book.title}
                    onTitleSave={async (newTitle) => {
                        const updated = await getStorage().books.update(book.id, {
                            title: newTitle,
                        });
                        setBook((prev) => (prev ? ({ ...prev, ...updated } as BookDetail) : prev));
                    }}
                    titlePublished={book.status === "published" || book.status === "archived"}
                    chapters={book.chapters}
                    activeChapterId={showMetadata ? null : activeChapterId}
                    onSelect={(id) => {
                        selectChapter(id);
                        closeSidebarOnNarrow();
                    }}
                    onAdd={handleAddChapter}
                    onDelete={handleDeleteChapter}
                    onRename={handleRenameChapter}
                    onBack={() => navigate("/")}
                    onCollapse={() => setSidebarOpen(false)}
                    onExport={handleExport}
                    onGitBackup={() => navigate(`/books/${bookId}/git-backup`)}
                    offlineSlot={bookId ? <OfflineToggleButton bookId={bookId} /> : undefined}
                    gitSyncState={gitSyncState}
                    onGitSync={() => navigate(`/books/${bookId}/git-sync`)}
                    gitSyncMapped={gitSyncMapped}
                    onMetadata={() => {
                        setSelectedStoryEntityId(null);
                        _setShowMetadata(true);
                        closeSidebarOnNarrow();
                    }}
                    onStoryBible={storyBibleAvailable ? openStoryBibleExclusive : undefined}
                    storyBibleActive={storyBibleOpen}
                    onShowStoryboard={() => {
                        setSelectedStoryEntityId(null);
                        _setShowMetadata(false);
                        _setShowStoryboard(true);
                        closeSidebarOnNarrow();
                    }}
                    storyboardActive={showStoryboard}
                    onShowOutline={() => {
                        setSelectedStoryEntityId(null);
                        _setShowOutline(true);
                        closeSidebarOnNarrow();
                    }}
                    outlineActive={showOutline}
                    onShowRelationships={
                        storyBibleAvailable
                            ? () => {
                                  setSelectedStoryEntityId(null);
                                  _setShowRelationships(true);
                                  closeSidebarOnNarrow();
                              }
                            : undefined
                    }
                    relationshipsActive={showRelationships}
                    onSaveAsTemplate={() => setShowSaveTemplate(true)}
                    onAddFromTemplate={() => setShowChapterTemplatePicker(true)}
                    onSaveAsChapterTemplate={(id) => setSaveChapterTemplateId(id)}
                    onShowVersions={
                        versionHistory.isActive
                            ? (id) => navigate(`/books/${bookId}/chapters/${id}/snapshots`)
                            : undefined
                    }
                    showMetadata={showMetadata}
                    onReorder={handleReorder}
                    hasToc={book.chapters.some((ch) => ch.chapter_type === "toc")}
                    onValidateToc={handleValidateToc}
                    headerMenu={
                        <EditorMenu
                            groups={menuGroups}
                            onAction={handleMenuAction}
                            disabled={menuDisabled}
                            triggerLabel={t("ui.editor_menu.open", "Menü")}
                            testIdPrefix="book-editor-menu"
                        />
                    }
                />
            </div>

            <main id="main-content" className={`${styles.content} ${sidebarOpen ? "" : "pl-14"}`}>
                {selectedStoryEntityId ? (
                    <StoryEntityEditor
                        key={selectedStoryEntityId}
                        entityId={selectedStoryEntityId}
                        onBack={() => setSelectedStoryEntityId(null)}
                        onChanged={() => setStoryBibleRefreshKey((k) => k + 1)}
                        onDeleted={() => {
                            setSelectedStoryEntityId(null);
                            setStoryBibleRefreshKey((k) => k + 1);
                        }}
                    />
                ) : showStoryboard ? (
                    <ProseStoryboard
                        bookId={book.id}
                        bookTitle={book.title}
                        onBack={() => _setShowStoryboard(false)}
                        onSelectChapter={(chapterId) => {
                            selectChapter(chapterId);
                        }}
                    />
                ) : showOutline ? (
                    <ChapterOutliner
                        bookId={book.id}
                        bookTitle={book.title}
                        onBack={() => _setShowOutline(false)}
                        onSelectChapter={(chapterId) => {
                            selectChapter(chapterId);
                        }}
                    />
                ) : showRelationships ? (
                    <RelationshipGraphView
                        bookId={book.id}
                        savedLayout={book.graph_layout}
                        onOpenEntity={(entityId) => {
                            setSelectedStoryEntityId(entityId);
                        }}
                        onShowAppearances={() => {
                            _setShowStoryboard(true);
                        }}
                    />
                ) : showMetadata ? (
                    <BookMetadataEditor
                        book={book}
                        onSave={handleSaveMetadata}
                        onBack={() => _setShowMetadata(false)}
                        allBooks={allBooks}
                        onNavigateToIssue={handleNavigateToIssue}
                        onRefresh={() => {
                            void getStorage()
                                .books.get(book.id, true)
                                .then((fresh) => setBook(fresh))
                                .catch(() => {});
                        }}
                    />
                ) : activeChapterMeta &&
                  loadedContent?.id === activeChapterMeta.id &&
                  !contentLoading ? (
                    <Editor
                        key={activeChapterMeta.id}
                        content={loadedContent.content}
                        onSave={handleSaveContent}
                        bookId={bookId}
                        chapterId={activeChapterMeta.id}
                        chapterTitle={activeChapterMeta.title}
                        chapterType={activeChapterMeta.chapter_type}
                        chapterVersion={activeChapterMeta.version}
                        targetWords={activeChapterMeta.target_words}
                        bookContext={{
                            title: book.title,
                            author: book.author || "",
                            language: book.language || "de",
                            genre: book.genre || "",
                            description: book.description || "",
                        }}
                        placeholder={`Schreibe "${activeChapterMeta.title}"...`}
                        autosaveDebounceMs={editorSettings.autosave_debounce_ms}
                        draftSaveDebounceMs={editorSettings.draft_save_debounce_ms}
                        draftMaxAgeDays={editorSettings.draft_max_age_days}
                        aiContextChars={editorSettings.ai_context_chars}
                        initialFocus={
                            pendingFocus && pendingFocus.chapterId === activeChapterMeta.id
                                ? { type: pendingFocus.type, seq: pendingFocus.seq }
                                : undefined
                        }
                        mentionBookId={storyBibleAvailable ? bookId : undefined}
                        onOpenStoryEntity={
                            storyBibleAvailable
                                ? (entityId) => {
                                      setSelectedStoryEntityId(entityId);
                                      openStoryBibleExclusive();
                                  }
                                : undefined
                        }
                    />
                ) : activeChapterMeta && contentLoading ? (
                    <LoadingIndicator
                        testId="book-editor-content-loading"
                        variant="block"
                        label={t("ui.common.loading", "Laden...")}
                        className={styles.loading}
                    />
                ) : (
                    <EmptyState
                        testId="book-editor-empty-state"
                        icon={<BookOpen size={56} strokeWidth={1} color="var(--text-muted)" />}
                        title={t(
                            "ui.editor.empty_title",
                            "Erstelle dein erstes Kapitel, um zu beginnen.",
                        )}
                        body={t(
                            "ui.editor.empty_hint",
                            'Klicke unten auf "Neues Kapitel" oder waehle einen anderen Kapiteltyp aus der Seitenleiste.',
                        )}
                        actions={
                            <button
                                className="btn btn-primary"
                                onClick={() => handleAddChapter("chapter")}
                                data-testid="book-editor-add-chapter-chapter"
                            >
                                <Plus size={16} /> {t("ui.editor.new_chapter", "Neues Kapitel")}
                            </button>
                        }
                    />
                )}
            </main>

            {storyBibleAvailable && storyBibleOpen && bookId && (
                <StoryBibleSidebar
                    bookId={bookId}
                    onClose={() => setStoryBibleOpen(false)}
                    onSelectEntity={(entity) => {
                        setSelectedStoryEntityId(entity.id);
                        _setShowMetadata(false);
                    }}
                    selectedEntityId={selectedStoryEntityId}
                    refreshKey={storyBibleRefreshKey}
                />
            )}
            {/* Story Bible toggle now lives in the ChapterSidebar
                Actions footer (alongside Metadaten) via onStoryBible -
                see BOOK-EDITOR-STORY-BIBLE-BUTTON-01. The old
                free-floating right-edge tab was not UX-conformant. */}

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

            {saveChapterTemplateId &&
                bookId &&
                (() => {
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
                onSaveAsNewChapter={resolveConflictSaveAsNew}
            />
        </div>
    );
}
