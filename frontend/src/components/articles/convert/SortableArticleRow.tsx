import {GripVertical, X} from "lucide-react"
import {useSortable} from "@dnd-kit/sortable"
import {CSS} from "@dnd-kit/utilities"

import {Article} from "../../../api/client"
import {rowStyles} from "./styles"

export function SortableArticleRow({
    article,
    onRemove,
    t,
}: {
    article: Article
    onRemove: () => void
    t: (key: string, fallback?: string) => string
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: article.id})

    const style: React.CSSProperties = {
        ...rowStyles.row,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-testid={`convert-to-book-wizard-selection-row-${article.id}`}
        >
            <span
                {...attributes}
                {...listeners}
                style={rowStyles.dragHandle}
                aria-label={t("ui.convert_to_book.drag_handle", "Reorder")}
            >
                <GripVertical size={14} />
            </span>
            <span style={rowStyles.title}>{article.title}</span>
            <button
                type="button"
                style={rowStyles.removeBtn}
                onClick={onRemove}
                data-testid={`convert-to-book-wizard-selection-remove-${article.id}`}
                aria-label={t("ui.convert_to_book.remove_from_selection", "Remove")}
            >
                <X size={12} />
            </button>
        </div>
    )
}
