import React from "react"
import {GripVertical, Plus, FileText} from "lucide-react"
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
    onReorder: (pageIds: string[]) => void
}

export default function PageThumbnails({
    pages,
    activePageId,
    onSelect,
    onAddPage,
    onReorder,
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
                    className={styles.addBtn}
                    onClick={onAddPage}
                    data-testid="page-editor-add-page"
                    title={t("ui.page_editor.add_page", "Add page")}
                    aria-label={t("ui.page_editor.add_page", "Add page")}
                >
                    <Plus size={14} />
                </button>
            </div>
            {pages.length === 0 ? (
                <div
                    className={styles.empty}
                    data-testid="page-editor-thumbnails-empty"
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
                        <ul className={styles.list} data-testid="page-editor-page-list">
                            {pages.map((page) => (
                                <SortablePageRow
                                    key={page.id}
                                    page={page}
                                    isActive={page.id === activePageId}
                                    onSelect={onSelect}
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
}

function SortablePageRow({page, isActive, onSelect}: SortableRowProps) {
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
            data-testid={`page-editor-page-row-${page.id}`}
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
                data-testid={`page-editor-drag-handle-${page.id}`}
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
        </li>
    )
}
