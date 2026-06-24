import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BookDetail } from "../api/client";
import ConflictResolutionDialog from "../components/import/ConflictResolutionDialog";
import ChapterSidebar from "../components/book/ChapterSidebar";
import { OfflineToggleButton } from "../components/shared/OfflineToggleButton";
import { getStorage } from "../storage";
import StoryBibleSidebar from "../components/story-bible/StoryBibleSidebar";
import StoryEntityEditor from "../components/story-bible/StoryEntityEditor";
import ProseStoryboard from "../components/story-bible/ProseStoryboard";
import ChapterOutliner from "../components/book/ChapterOutliner";
import RelationshipGraphView from "../components/story-bible/RelationshipGraphView";
import { useBookTypes } from "../hooks/book/useBookTypes";
import Editor from "../components/editor/Editor";
import BookMetadataEditor from "../components/book/BookMetadataEditor";
import type { NavigableFindingType } from "../components/quality/QualityTab";
import SaveAsTemplateModal from "../components/book/SaveAsTemplateModal";
import ChapterTemplatePickerModal from "../components/book/ChapterTemplatePickerModal";
import SaveAsChapterTemplateModal from "../components/book/SaveAsChapterTemplateModal";
import { useI18n } from "../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { useSidebarCollapse, SIDEBAR_MOBILE_BREAKPOINT_PX } from "../hooks/ui/useSidebarCollapse";
import { useExclusiveSidebars } from "../hooks/ui/useExclusiveSidebars";
import { useBookEditorViews } from "../hooks/book/useBookEditorViews";
import { useBookEditorData } from "../hooks/book/useBookEditorData";
import { SidebarToggleButton } from "../components/shared/SidebarToggleButton";
import { SidebarOverlay } from "../lib/components/SidebarOverlay";
import { EditorMenu } from "../lib/components/EditorMenu";
import { buildBookEditorMenu } from "./buildBookEditorMenu";
import { BookOpen, Plus } from "lucide-react";
import { EmptyState } from "../lib/components/EmptyState";
import { LoadingIndicator } from "../components/shared/LoadingIndicator";
import styles from "./BookEditor.module.css";
import { renderPageBasedEditor } from "./bookEditorDispatch";

export default function BookEditor() {
    const { bookId } = useParams<{ bookId: string }>();
    const navigate = useNavigate();
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

    const {
        book,
        setBook,
        allBooks,
        loading,
        editorSettings,
        loadedContent,
        contentLoading,
        activeChapterMeta,
        gitSyncState,
        gitSyncMapped,
        conflict,
        handleSaveMetadata,
        handleAddChapter,
        handleAddChapterFromTemplate,
        handleRenameChapter,
        handleDeleteChapter,
        handleSaveContent,
        resolveConflictKeepLocal,
        resolveConflictDiscardLocal,
        resolveConflictSaveAsNew,
        handleReorder,
        handleValidateToc,
    } = useBookEditorData({ bookId, activeChapterId, setActiveChapterId, offlineGate });

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

    const handleNavigateToIssue = (chapterId: string, findingType: NavigableFindingType) => {
        setPendingFocus((prev) => ({
            chapterId,
            type: findingType,
            seq: (prev?.seq ?? 0) + 1,
        }));
        selectChapter(chapterId);
        closeSidebarOnNarrow();
    };

    const handleExport = () => {
        navigate(`/books/${bookId}/export`);
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
    // BookTypeRegistry. Picture-book / comic-book types render their own
    // editor (and the storyboard / metadata surfaces under ?view=...);
    // chapter-based (prose) types return null and fall through below.
    // The dispatch lives in renderPageBasedEditor (bookEditorDispatch).
    const pageBasedEditor = renderPageBasedEditor({
        book,
        bookTypesSnapshot,
        showStoryboard,
        showMetadata,
        allBooks,
        bookId,
        setBook,
        navigate,
        setShowStoryboard: _setShowStoryboard,
        setShowMetadata: _setShowMetadata,
    });
    if (pageBasedEditor) return pageBasedEditor;

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
