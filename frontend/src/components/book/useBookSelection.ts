/**
 * Selection state for the book-bulk-export workflow on the
 * Dashboard. Identical contract to ``useArticleSelection`` —
 * component-local Set<string>, NOT URL-synced (selection is
 * per-session noise that bookmarks shouldn't carry).
 *
 * Kept as a separate hook (rather than a generic `useSelection`)
 * so that future per-entity divergence (e.g. books-only constraints
 * around audiobook job state) lands in one place without a
 * cross-entity refactor.
 */

import {useCallback, useState} from "react"

export interface BookSelection {
    selectedIds: Set<string>
    count: number
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    clear: () => void
    /** Delete a single id from the set (idempotent; no-op if absent).
     *  Used by row-destructive handlers (handleDelete /
     *  handleDeletePermanent) to keep the BulkActionBar count from
     *  referencing an orphan id after the row disappears. */
    remove: (id: string) => void
}

export function useBookSelection(): BookSelection {
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
