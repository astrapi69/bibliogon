import React from "react"
import {ChevronLeft} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import styles from "./PageEditor.module.css"

interface Props {
    bookId: string
    bookTitle: string
    onBack: () => void
}

export default function PageEditor({bookId, bookTitle, onBack}: Props) {
    const {t} = useI18n()
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
                    {/* Commit 3: PageThumbnails (dnd-kit drag-reorder). */}
                </aside>
                <main
                    data-testid="page-editor-canvas"
                    className={styles.canvas}
                    aria-label={t("ui.page_editor.canvas_pane", "Canvas")}
                >
                    {/* Commit 5: canvas content (image + text). */}
                </main>
                <aside
                    data-testid="page-editor-properties"
                    className={styles.properties}
                    aria-label={t("ui.page_editor.properties_pane", "Page properties")}
                >
                    {/* Commit 4: LayoutPicker + per-page properties. */}
                </aside>
            </div>
        </div>
    )
}
