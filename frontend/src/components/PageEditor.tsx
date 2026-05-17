import React, {useCallback, useEffect, useMemo, useState} from "react"
import {ChevronLeft} from "lucide-react"
import {api, type Page, type PageLayout, type PageUpdate} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import PageThumbnails from "./PageThumbnails"
import LayoutPicker from "./LayoutPicker"
import PageCanvas from "./PageCanvas"
import styles from "./PageEditor.module.css"

interface Props {
    bookId: string
    bookTitle: string
    onBack: () => void
}

const DEFAULT_NEW_PAGE_LAYOUT: PageLayout = "image_top_text_bottom"

export default function PageEditor({bookId, bookTitle, onBack}: Props) {
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
                        <LayoutPicker
                            selected={activePage.layout as PageLayout}
                            onChange={handleChangeLayout}
                        />
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
