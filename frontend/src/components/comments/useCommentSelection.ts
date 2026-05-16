/**
 * Selection state for the bulk-delete workflow on the Comments-Admin
 * section. Clones ``useArticleSelection`` 1:1 because the contract is
 * model-agnostic: a Set<string> of selected ids + the standard
 * mutators (toggle / selectAll / clear / remove) plus the reactive
 * count + isSelected selectors. Component-local; NOT URL-synced.
 *
 * ``remove`` preserves the Set reference on a no-op (id not present)
 * so consumers can rely on React's shallow-compare in dependency
 * arrays — matches the article hook's contract verbatim.
 */

import {useCallback, useState} from "react"

export interface CommentSelection {
    selectedIds: Set<string>
    count: number
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    clear: () => void
    remove: (id: string) => void
}

export function useCommentSelection(): CommentSelection {
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
