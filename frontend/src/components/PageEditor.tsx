import React, {useCallback, useEffect, useMemo, useState} from "react"
import type {Editor} from "@tiptap/react"
import {ChevronLeft, FileText, LayoutGrid, Maximize2, Minimize2} from "lucide-react"
import {api, type Page, type PageLayout, type PageUpdate} from "../api/client"
import {writeLayoutNamespace} from "../utils/layoutConfig"
import {useI18n} from "../hooks/useI18n"
import {useFullscreenToggle} from "../hooks/useFullscreenToggle"
import {useKeyboardShortcuts} from "../hooks/useKeyboardShortcuts"
import {useDialog} from "./AppDialog"
import PageThumbnails from "./PageThumbnails"
import LayoutPicker from "./LayoutPicker"
import LayoutConfig from "./LayoutConfig"
import PageCanvas from "./PageCanvas"
import PdfExportControls from "./PdfExportControls"
import RichTextToolbar from "./RichTextToolbar"
import ThemeToggle from "./ThemeToggle"
import styles from "./PageEditor.module.css"

interface Props {
    bookId: string
    bookTitle: string
    onBack: () => void
    /** PB-PHASE4 Session 5 Commit 2: entry-point into BookMetadataEditor.
     *  When provided, the header shows a Metadata button that calls this
     *  callback. The parent (BookEditor) flips its showMetadata state
     *  and re-renders BookMetadataEditor in place of PageEditor — same
     *  URL-routed pattern as prose-flow. Optional so PageEditor can
     *  still be unit-tested standalone without a parent that wires it. */
    onShowMetadata?: () => void
    /** PICTURE-BOOK-STORYBOARD-VIEW-01 C5: entry-point into the
     *  Storyboard grid view. When provided, the header shows a
     *  Storyboard button next to Metadata. Parent flips ?view=storyboard
     *  and re-renders Storyboard in place of PageEditor (same URL-routed
     *  pattern as the metadata toggle). Optional so PageEditor still
     *  unit-tests standalone, and so BookEditor can withhold it for
     *  non-supported book_types (currently picture_book only per A4). */
    onShowStoryboard?: () => void
}

const DEFAULT_NEW_PAGE_LAYOUT: PageLayout = "image_top_text_bottom"

// PDF-BLEED-MARKS-01 C2: format dropdown + bleed checkbox + Export
// PDF button are all encapsulated in the
// ``PdfExportControls`` shared component (mounted both
// here AND in BookMetadataEditor's Design tab). Format constants
// + localStorage helpers + state ownership all live in the shared
// component now; this file only mounts it. PDF-KDP-FORMATS-01's
// inline state + readStoredFormat helper relocated out of here.

export default function PageEditor({
    bookId,
    bookTitle,
    onBack,
    onShowMetadata,
    onShowStoryboard,
}: Props) {
    const {t} = useI18n()
    const dialog = useDialog()
    const [pages, setPages] = useState<Page[]>([])
    const [activePageId, setActivePageId] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

    // EDITOR-FULLSCREEN-NATIVE-01: browser-native fullscreen
    // toggle, hosted in the page-editor header alongside Theme +
    // Export-PDF. Picture-Book pages have a non-text-formatting
    // toolbar (LayoutPicker + LayoutConfig + RichTextToolbar);
    // fullscreen as a *page-level* affordance fits the header
    // better than the inline text toolbar.
    const fullscreen = useFullscreenToggle()
    useKeyboardShortcuts(
        fullscreen.isSupported
            ? [{keys: "ctrl+shift+f", handler: () => void fullscreen.toggle()}]
            : [],
    )

    useEffect(() => {
        let cancelled = false
        api.pages
            .list(bookId)
            .then((rows) => {
                if (cancelled) return
                setPages(rows)
                if (rows.length > 0) setActivePageId(rows[0].id)
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setLoadError(err instanceof Error ? err.message : String(err))
            })
        return () => {
            cancelled = true
        }
    }, [bookId])

    const handleAddPage = useCallback(async () => {
        const created = await api.pages.create(bookId, {
            layout: DEFAULT_NEW_PAGE_LAYOUT,
        })
        setPages((prev) => [...prev, created])
        setActivePageId(created.id)
    }, [bookId])

    const handleReorder = useCallback(
        async (pageIds: string[]) => {
            const next = await api.pages.reorder(bookId, pageIds)
            setPages(next)
        },
        [bookId],
    )

    /**
     * PAGES-DELETE-EDITOR-UI-01 C2: delete-page handler.
     *
     * Confirm via AppDialog (danger variant), then DELETE the row +
     * filter from local pages state. If the deleted page was active,
     * auto-select the next-by-position page (or null if it was the
     * last page).
     *
     * Per "Destructive row-actions must reconcile collection state"
     * lessons-learned rule — state reconciliation BEFORE any toast
     * so the activePageId never lingers pointing at a row that's
     * already gone.
     */
    const handleDeletePage = useCallback(
        async (pageId: string) => {
            const confirmed = await dialog.confirm(
                t("ui.page_editor.delete_page_title", "Delete page?"),
                t(
                    "ui.page_editor.delete_page_confirm",
                    "Are you sure you want to delete this page? This cannot be undone.",
                ),
                "danger",
            )
            if (!confirmed) return
            try {
                await api.pages.delete(bookId, pageId)
            } catch (err: unknown) {
                setLoadError(err instanceof Error ? err.message : String(err))
                return
            }
            setPages((prev) => {
                const remaining = prev.filter((p) => p.id !== pageId)
                if (activePageId === pageId) {
                    setActivePageId(remaining[0]?.id ?? null)
                }
                return remaining
            })
        },
        [bookId, dialog, t, activePageId],
    )

    const activePage = useMemo(
        () => pages.find((p) => p.id === activePageId) ?? null,
        [pages, activePageId],
    )

    /**
     * Layout-switch handler.
     *
     * **Fix B (PICTURE-BOOK-TEXT-CONFIGURATION-01, 4c-B sub-item)**
     * supersedes the original Fix A (v0.33.1) purge-on-switch
     * behaviour. With per-layout namespacing of layout_config, each
     * layout's settings live inside its own ``layout_config[layout]``
     * key — switching speech_bubble → image_full_text_overlay no
     * longer pollutes the renderer because the dispatcher reads
     * ``layout_config[page.layout]`` exclusively. Switching BACK to a
     * prior layout finds its preserved namespace.
     *
     * The PATCH no longer carries ``layout_config: null``. Existing
     * legacy-flat configs auto-migrate into the new layout's
     * namespace on the next write (per ``writeLayoutNamespace``);
     * dirty cross-layout flat keys silently drop on first write.
     */
    const handleChangeLayout = useCallback(
        async (newLayout: PageLayout) => {
            if (!activePage) return
            const updated = await api.pages.update(bookId, activePage.id, {
                layout: newLayout,
            })
            setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        },
        [bookId, activePage],
    )

    const handleUpdateActivePage = useCallback(
        async (updates: PageUpdate) => {
            if (!activePage) return
            const updated = await api.pages.update(bookId, activePage.id, updates)
            setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        },
        [bookId, activePage],
    )

    /**
     * Per-page layout_config writer.
     *
     * **Fix B (4c-B sub-item)**: wraps the partial update into the
     * active layout's namespace via ``writeLayoutNamespace``. Sibling
     * layouts' namespaces are preserved. Legacy-flat configs are
     * auto-migrated into namespaced shape on the first write.
     *
     * Auto-save discipline: callers control timing — discrete controls
     * (radio, dropdown) call this directly; continuous controls
     * (slider) wrap through `useDebouncedCallback(_, 300)`.
     *
     * Optimistic state update keeps the properties pane snappy:
     * discrete controls see the new value immediately, the API
     * roundtrip lands a moment later and the canonical updated row
     * replaces the optimistic one.
     */
    const handleUpdateLayoutConfig = useCallback(
        async (partial: Record<string, unknown>) => {
            if (!activePage) return
            const nextConfig = writeLayoutNamespace(
                activePage.layout_config,
                activePage.layout as PageLayout,
                partial,
            )
            setPages((prev) =>
                prev.map((p) =>
                    p.id === activePage.id ? {...p, layout_config: nextConfig} : p,
                ),
            )
            const updated = await api.pages.update(bookId, activePage.id, {
                layout_config: nextConfig,
            })
            setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        },
        [bookId, activePage],
    )

    /**
     * PB-PHASE4 Session 6 Commit 4: trigger picture-book PDF export.
     *
     * Picture-book PDF render is fast (1-3s sync via the route
     * shipped in S6 Commit 2), so the UX is button-with-loading-
     * state + blob download — NOT the AudioExportProgress modal
     * the audit anticipated. AudioExportProgress is for the
     * multi-minute TTS work; using it for a 1-3s operation would
     * be UX overkill (modal opens + closes near-instantly).
     *
     * Defensive: on failure, show an error toast with the server's
     * detail. The route returns 400 (wrong fmt for picture-book),
     * 404 (book missing), or 500 (WeasyPrint or generator error);
     * ApiError carries `.detail` for each.
     */
    /**
     * PB-PHASE4 Session 4c-B-1 Commit 3: D6-C properties-pane
     * Toolbar. PageCanvas mounts the TipTap editor inline in the
     * page region; this state holds the editor instance so the
     * Toolbar (in the properties pane) can wire its buttons to
     * the same editor. PageCanvas signals ``null`` for Tier-Property
     * layouts (no editor instance available) — the Toolbar then
     * renders nothing.
     *
     * Cleared on activePage.id change: the old page's editor
     * instance unmounts with its PageCanvas; the new page's
     * PageCanvas calls onEditorReady once its editor mounts.
     */
    const [tipTapEditor, setTipTapEditor] = useState<Editor | null>(null)
    useEffect(() => {
        // Page switched — clear the stale editor reference until
        // the new page's RichTextEditor mounts + calls back.
        setTipTapEditor(null)
    }, [activePageId])

    // PDF-BLEED-MARKS-01 C2: state + handlers extracted into the
    // shared ``PdfExportControls`` component.

    return (
        <div
            data-testid="page-editor-root"
            data-book-id={bookId}
            className={styles.layout}
        >
            <header data-testid="page-editor-header" className={styles.header}>
                <button
                    type="button"
                    onClick={onBack}
                    data-testid="page-editor-back"
                    className={styles.backBtn}
                    aria-label={t("ui.page_editor.back", "Back to dashboard")}
                    title={t("ui.page_editor.back", "Back to dashboard")}
                >
                    <ChevronLeft size={18} />
                </button>
                <h1 className={styles.title}>{bookTitle}</h1>
                {onShowMetadata && (
                    <button
                        type="button"
                        onClick={onShowMetadata}
                        data-testid="page-editor-show-metadata"
                        className={styles.metadataBtn}
                        title={t(
                            "ui.page_editor.show_metadata",
                            "Open book metadata",
                        )}
                    >
                        <FileText size={14} />
                        <span>
                            {t(
                                "ui.page_editor.show_metadata",
                                "Open book metadata",
                            )}
                        </span>
                    </button>
                )}
                {onShowStoryboard && (
                    <button
                        type="button"
                        onClick={onShowStoryboard}
                        data-testid="page-editor-show-storyboard"
                        className={styles.metadataBtn}
                        title={t(
                            "ui.page_editor.show_storyboard",
                            "Open storyboard",
                        )}
                    >
                        <LayoutGrid size={14} />
                        <span>
                            {t(
                                "ui.page_editor.show_storyboard",
                                "Storyboard",
                            )}
                        </span>
                    </button>
                )}
                <ThemeToggle variant="dark" />
                {fullscreen.isSupported && (
                    <button
                        type="button"
                        onClick={() => void fullscreen.toggle()}
                        data-testid="page-editor-fullscreen"
                        className={styles.metadataBtn}
                        aria-pressed={fullscreen.isFullscreen ? "true" : "false"}
                        aria-keyshortcuts="F11 Control+Shift+F"
                        title={
                            fullscreen.isFullscreen
                                ? t("ui.toolbar.exit_fullscreen", "Vollbild verlassen") +
                                  " (F11 / Ctrl+Shift+F)"
                                : t("ui.toolbar.fullscreen", "Vollbild") +
                                  " (F11 / Ctrl+Shift+F)"
                        }
                    >
                        {fullscreen.isFullscreen ? (
                            <Minimize2 size={14} />
                        ) : (
                            <Maximize2 size={14} />
                        )}
                        <span>
                            {fullscreen.isFullscreen
                                ? t(
                                      "ui.toolbar.exit_fullscreen",
                                      "Vollbild verlassen",
                                  )
                                : t("ui.toolbar.fullscreen", "Vollbild")}
                        </span>
                    </button>
                )}
                {/* PDF-BLEED-MARKS-01 C2: shared component carries
                 *  format dropdown + bleed checkbox + Export PDF
                 *  button. Same component mounts in
                 *  BookMetadataEditor's Design tab — closes the
                 *  PDF-KDP-FORMATS-01 half-wired surface as a side-
                 *  effect (per the Recurring-Component-Unification
                 *  Rule's canonical 2-site extract-plus-migrate). */}
                <PdfExportControls
                    bookId={bookId}
                    testidPrefix="page-editor"
                    controlClassName={styles.metadataBtn}
                    spinnerClassName={styles.spinner}
                />
            </header>
            <div className={styles.body}>
                <aside
                    data-testid="page-editor-thumbnails"
                    className={styles.thumbnails}
                    aria-label={t("ui.page_editor.thumbnails_pane", "Pages")}
                >
                    <PageThumbnails
                        pages={pages}
                        activePageId={activePageId}
                        onSelect={setActivePageId}
                        onAddPage={handleAddPage}
                        onReorder={handleReorder}
                        onDelete={handleDeletePage}
                    />
                </aside>
                <main
                    data-testid="page-editor-canvas"
                    className={styles.canvas}
                    aria-label={t("ui.page_editor.canvas_pane", "Canvas")}
                    data-active-page-id={activePageId ?? ""}
                >
                    {loadError && (
                        <div
                            data-testid="page-editor-load-error"
                            className={styles.errorBanner}
                            role="alert"
                        >
                            {loadError}
                        </div>
                    )}
                    {activePage ? (
                        <PageCanvas
                            key={activePage.id}
                            page={activePage}
                            bookId={bookId}
                            onUpdate={handleUpdateActivePage}
                            onEditorReady={setTipTapEditor}
                        />
                    ) : (
                        !loadError && (
                            <div
                                data-testid="page-editor-canvas-empty"
                                className={styles.canvasEmpty}
                            >
                                {t(
                                    "ui.page_editor.canvas_empty",
                                    "Add a page from the sidebar to start authoring.",
                                )}
                            </div>
                        )
                    )}
                </main>
                <aside
                    data-testid="page-editor-properties"
                    className={styles.properties}
                    aria-label={t("ui.page_editor.properties_pane", "Page properties")}
                >
                    {activePage ? (
                        <>
                            <LayoutPicker
                                selected={activePage.layout as PageLayout}
                                onChange={handleChangeLayout}
                            />
                            <LayoutConfig
                                page={activePage}
                                onChange={handleUpdateLayoutConfig}
                            />
                            {/* PB-PHASE4 Session 4c-B-1 Commit 3:
                                D6-C properties-pane Toolbar. Renders
                                nothing when ``tipTapEditor`` is null
                                (Tier-Property layouts; PageCanvas
                                signals null via onEditorReady). */}
                            <RichTextToolbar
                                editor={tipTapEditor}
                                testidNamespace="page-editor-toolbar"
                            />
                        </>
                    ) : (
                        <div
                            data-testid="page-editor-properties-empty"
                            className={styles.propertiesEmpty}
                        >
                            {t(
                                "ui.page_editor.properties_empty",
                                "Select a page to edit its properties.",
                            )}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    )
}
