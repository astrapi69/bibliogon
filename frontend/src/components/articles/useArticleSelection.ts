/**
 * Selection state for the bulk-export workflow on the Articles
 * dashboard. Component-local; intentionally NOT URL-synced because
 * a list of selected IDs is per-session noise that bookmarks
 * shouldn't carry. Filters are URL-synced (see useArticleFilters);
 * selection is not.
 *
 * Behaviour:
 * - ``toggle(id)`` flips a single article in/out of the set.
 * - ``selectAll(ids)`` replaces the set with the supplied list (used
 *   by the "Select all" control which always operates on the
 *   currently-visible filtered list).
 * - ``clear()`` empties the selection.
 * - ``remove(id)`` deletes a single id from the set (idempotent;
 *   no-op if absent). Used by row-destructive handlers to reconcile
 *   selection state after the underlying article disappears, so the
 *   BulkActionBar's count never references an orphan id.
 *
 * The set is wrapped in React state so component re-renders pick up
 * changes; consumers can rely on ``isSelected`` and ``count`` as
 * reactive sources.
 */

import {useCallback, useState} from "react"

export interface ArticleSelection {
    selectedIds: Set<string>
    count: number
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    clear: () => void
    remove: (id: string) => void
}

export function useArticleSelection(): ArticleSelection {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const toggle = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    const selectAll = useCallback((ids: string[]) => {
        setSelectedIds(new Set(ids))
    }, [])

    const clear = useCallback(() => {
        setSelectedIds(new Set())
    }, [])

    const remove = useCallback((id: string) => {
        setSelectedIds((prev) => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
        })
    }, [])

    const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

    return {
        selectedIds,
        count: selectedIds.size,
        isSelected,
        toggle,
        selectAll,
        clear,
        remove,
    }
}
