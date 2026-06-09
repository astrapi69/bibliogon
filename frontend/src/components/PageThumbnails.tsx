import React from "react"
import {GripVertical, Plus, FileText, Trash2} from "lucide-react"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {CSS} from "@dnd-kit/utilities"

import type {Page} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import styles from "./PageThumbnails.module.css"

interface Props {
    pages: Page[]
    activePageId: string | null
    onSelect: (pageId: string) => void
    onAddPage: () => void
    /** Disables the add-page button (e.g. while the parent's initial
     *  pages.list is still resolving, so a click cannot race the load
     *  and get clobbered). Defaults to enabled. */
    addDisabled?: boolean
    onReorder: (pageIds: string[]) => void
    /** Optional: per-row delete affordance. When provided, each row
     *  renders a Trash2 button at the trailing edge with testid
     *  ``${testidNamespace}-delete-page-${pageId}``. The handler is
     *  called with the page id; the parent owns the confirm dialog
     *  + DB call + activePageId cleanup (per the "Destructive row-
     *  actions must reconcile collection state" lessons-learned
     *  rule). When omitted, no delete affordance renders.
     *  Filed by PAGES-DELETE-EDITOR-UI-01 (2026-05-24). */
    onDelete?: (pageId: string) => void
    /** Testid namespace for all data-testid attributes. Defaults to
     *  "page-editor" (preserving Picture-Book's PageEditor backward-
     *  compat). ComicBookEditor passes "comic-book-editor" for its
     *  RCU 2-site adoption — pattern mirrors RichTextEditor's
     *  testidNamespace prop. */
    testidNamespace?: string
}

export default function PageThumbnails({
    pages,
    activePageId,
    onSelect,
    onAddPage,
    addDisabled = false,
    onReorder,
    onDelete,
    testidNamespace = "page-editor",
}: Props) {
    const {t} = useI18n()
    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    )

    const pageIds = pages.map((p) => p.id)

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event
        if (!over || active.id === over.id) return
        const oldIndex = pageIds.indexOf(active.id as string)
        const newIndex = pageIds.indexOf(over.id as string)
        if (oldIndex === -1 || newIndex === -1) return
        onReorder(arrayMove(pageIds, oldIndex, newIndex))
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.headerLabel}>
                    {t("ui.page_editor.pages_label", "Pages")}
                </span>
                <button
                    type="button"
                    className={`btn-sidebar-icon ${styles.addBtn}`}
                    onClick={onAddPage}
                    disabled={addDisabled}
                    data-testid={`${testidNamespace}-add-page`}
                    title={t("ui.page_editor.add_page", "Add page")}
                    aria-label={t("ui.page_editor.add_page", "Add page")}
                >
                    <Plus size={14} />
                </button>
            </div>
            {pages.length === 0 ? (
                <div
                    className={styles.empty}
                    data-testid={`${testidNamespace}-thumbnails-empty`}
                >
                    {t(
                        "ui.page_editor.empty_state",
                        "No pages yet. Click + to add the first page.",
                    )}
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={pageIds}
                        strategy={verticalListSortingStrategy}
                    >
                        <ul className={styles.list} data-testid={`${testidNamespace}-page-list`}>
                            {pages.map((page) => (
                                <SortablePageRow
                                    key={page.id}
                                    page={page}
                                    isActive={page.id === activePageId}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    testidNamespace={testidNamespace}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    )
}

interface SortableRowProps {
    page: Page
    isActive: boolean
    onSelect: (pageId: string) => void
    onDelete?: (pageId: string) => void
    testidNamespace: string
}

function SortablePageRow({
    page,
    isActive,
    onSelect,
    onDelete,
    testidNamespace,
}: SortableRowProps) {
    const {t} = useI18n()
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: page.id})
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
    }
    const className = [
        styles.row,
        isActive ? styles.rowActive : "",
        isDragging ? styles.rowDragging : "",
    ]
        .filter(Boolean)
        .join(" ")
    return (
        <li
            ref={setNodeRef}
            style={style}
            className={className}
            data-testid={`${testidNamespace}-page-row-${page.id}`}
            data-active={isActive ? "true" : "false"}
            data-position={page.position}
            data-layout={page.layout}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(page.id)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect(page.id)
                }
            }}
        >
            <span
                {...attributes}
                {...listeners}
                className={styles.dragHandle}
                data-testid={`${testidNamespace}-drag-handle-${page.id}`}
                aria-label="Drag handle"
            >
                <GripVertical size={14} />
            </span>
            <span className={styles.rowIcon}>
                <FileText size={14} />
            </span>
            <span className={styles.rowLabel}>
                <span className={styles.rowPosition}>{page.position}</span>
            </span>
            {onDelete && (
                <button
                    type="button"
                    className={`btn-sidebar-icon ${styles.deleteBtn}`}
                    data-testid={`${testidNamespace}-delete-page-${page.id}`}
                    title={t("ui.page_editor.delete_page", "Delete page")}
                    aria-label={t("ui.page_editor.delete_page", "Delete page")}
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete(page.id)
                    }}
                >
                    <Trash2 size={12} />
                </button>
            )}
        </li>
    )
}
