/** The Sammlungen (collections) bar for the Chapter Outliner
 *  (extracted from ChapterOutliner for cohesion — CHAPTER-COLLECTIONS-01).
 *
 *  Purely presentational: the collection state + persistence live in the
 *  parent (shared with the table's membership column + row filtering);
 *  this component renders the select, the new/rename/delete controls, the
 *  colour swatches, and the filter toggle, calling back through props.
 *  Testids + behaviour are identical to the inline markup it replaced. */
import {useI18n} from "../../hooks/useI18n"
import {type BookCollection} from "../../api/client"

// Fixed swatch palette for collection colours. Hex so each swatch renders
// via inline backgroundColor (a genuinely dynamic value, the sanctioned
// inline-style case).
const COLLECTION_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#6b7280"]

interface Props {
    collections: BookCollection[]
    activeCollectionId: string | null
    activeCollection: BookCollection | null
    filterToCollection: boolean
    onSelect: (id: string | null) => void
    onFilterChange: (on: boolean) => void
    onNew: () => void
    onRename: (name: string) => void
    onDelete: () => void
    onSetColor: (color: string | null) => void
    testidNamespace: string
}

export default function OutlinerCollectionsBar({
    collections,
    activeCollectionId,
    activeCollection,
    filterToCollection,
    onSelect,
    onFilterChange,
    onNew,
    onRename,
    onDelete,
    onSetColor,
    testidNamespace,
}: Props) {
    const {t} = useI18n()
    return (
        <div
            className="flex flex-wrap items-center gap-2 px-3 py-2"
            data-testid={`${testidNamespace}-collections-bar`}
        >
            <span className="text-sm font-medium">
                {t("ui.outliner.collections_label", "Collections")}:
            </span>
            <select
                className="input w-auto"
                value={activeCollectionId ?? ""}
                onChange={(e) => onSelect(e.target.value || null)}
                aria-label={t("ui.outliner.collections_label", "Collections")}
                data-testid={`${testidNamespace}-collection-select`}
            >
                <option value="">{t("ui.outliner.collection_all", "All chapters")}</option>
                {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name} ({c.chapter_ids.length})
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onNew}
                data-testid={`${testidNamespace}-collection-new`}
            >
                + {t("ui.outliner.collection_new", "New collection")}
            </button>
            {activeCollection && (
                <>
                    {activeCollection.color && (
                        <span
                            className="h-3 w-3 rounded-full border border-[var(--border)]"
                            style={{backgroundColor: activeCollection.color}}
                            data-testid={`${testidNamespace}-collection-color-dot`}
                            aria-hidden="true"
                        />
                    )}
                    <input
                        key={`colname-${activeCollection.id}-${activeCollection.name}`}
                        className="input w-auto"
                        defaultValue={activeCollection.name}
                        aria-label={t("ui.outliner.collection_name", "Collection name")}
                        data-testid={`${testidNamespace}-collection-name`}
                        onBlur={(e) => onRename(e.target.value)}
                    />
                    <div
                        className="flex items-center gap-1"
                        role="group"
                        aria-label={t("ui.outliner.collection_color", "Collection color")}
                    >
                        {COLLECTION_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className="h-5 w-5 rounded-full border border-[var(--border)]"
                                style={{backgroundColor: color}}
                                aria-label={color}
                                aria-pressed={activeCollection.color === color}
                                onClick={() =>
                                    onSetColor(activeCollection.color === color ? null : color)
                                }
                                data-testid={`${testidNamespace}-collection-color-${color}`}
                            />
                        ))}
                    </div>
                    <label className="flex items-center gap-1 text-sm">
                        <input
                            type="checkbox"
                            checked={filterToCollection}
                            onChange={(e) => onFilterChange(e.target.checked)}
                            data-testid={`${testidNamespace}-collection-filter`}
                        />
                        {t("ui.outliner.collection_filter", "Filter to collection")}
                    </label>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={onDelete}
                        data-testid={`${testidNamespace}-collection-delete`}
                    >
                        {t("ui.outliner.collection_delete", "Delete")}
                    </button>
                </>
            )}
        </div>
    )
}
