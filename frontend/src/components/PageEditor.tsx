import React, {useCallback, useEffect, useMemo, useState} from "react"
import {ChevronLeft, FileText} from "lucide-react"
import {api, type Page, type PageLayout, type PageUpdate} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import PageThumbnails from "./PageThumbnails"
import LayoutPicker from "./LayoutPicker"
import LayoutConfig from "./LayoutConfig"
import PageCanvas from "./PageCanvas"
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
}

const DEFAULT_NEW_PAGE_LAYOUT: PageLayout = "image_top_text_bottom"

export default function PageEditor({bookId, bookTitle, onBack, onShowMetadata}: Props) {
    const {t} = useI18n()
    const [pages, setPages] = useState<Page[]>([])
    const [activePageId, setActivePageId] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

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

    const activePage = useMemo(
        () => pages.find((p) => p.id === activePageId) ?? null,
        [pages, activePageId],
    )

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
     * PB-PHASE4 Session 4c Commit 3: per-page layout_config writer.
     *
     * Merges `partial` over the active page's current `layout_config`
     * (null treated as empty) and persists the merged dict. Optimistic
     * state update keeps the properties pane snappy: discrete controls
     * see the new value immediately, the API roundtrip lands a moment
     * later and the canonical updated row replaces the optimistic one.
     *
     * Auto-save discipline: callers control timing — discrete controls
     * (radio, dropdown) call this directly; continuous controls
     * (slider) wrap through `useDebouncedCallback(_, 300)`.
     */
    const handleUpdateLayoutConfig = useCallback(
        async (partial: Record<string, unknown>) => {
            if (!activePage) return
            const merged = {...(activePage.layout_config ?? {}), ...partial}
            setPages((prev) =>
                prev.map((p) =>
                    p.id === activePage.id ? {...p, layout_config: merged} : p,
                ),
            )
            const updated = await api.pages.update(bookId, activePage.id, {
                layout_config: merged,
            })
            setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        },
        [bookId, activePage],
    )

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
