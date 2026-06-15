import {useCallback, useEffect, useState} from "react"

import {getStorage} from "../storage"
import {type ContinuityWarning, type StoryEntityOut} from "../api/client"

/** Owns the Story Bible side of the storyboard: availability probe,
 *  sidebar open state, selected entity, view mode, entity filter +
 *  visible-page intersection, and continuity warnings. */
export function useStoryBibleIntegration(bookId: string) {
    // Story Bible integration (C2 + C5). The sidebar is available only
    // when plugin-story-bible is mounted (probed once); badge clicks +
    // the header toggle open it with an entity optionally selected.
    const [storyBibleAvailable, setStoryBibleAvailable] = useState(false)
    const [storyBibleOpen, setStoryBibleOpen] = useState(false)
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
    // C9: grid (default) vs arc-view (entity swim-lanes) of the pages.
    const [viewMode, setViewMode] = useState<"grid" | "arc">("grid")

    useEffect(() => {
        let cancelled = false
        getStorage().storyBible
            .getInfo()
            .then(() => {
                if (!cancelled) setStoryBibleAvailable(true)
            })
            .catch(() => {
                if (!cancelled) setStoryBibleAvailable(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const openEntity = useCallback((entityId: string) => {
        setSelectedEntityId(entityId)
        setStoryBibleOpen(true)
    }, [])

    // C8: entity filter. The author selects one or more entities and
    // the grid shows only pages where ALL of them appear (set
    // intersection). Entities for the chips load once when available;
    // ``visiblePageIds`` is null (= show all) when no filter is set.
    const [entities, setEntities] = useState<StoryEntityOut[]>([])
    const [entityFilter, setEntityFilter] = useState<string[]>([])
    const [visiblePageIds, setVisiblePageIds] = useState<Set<string> | null>(null)

    useEffect(() => {
        if (!storyBibleAvailable) return
        let cancelled = false
        getStorage().storyBible
            .listEntities(bookId)
            .then((rows) => {
                if (!cancelled) setEntities(rows)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [bookId, storyBibleAvailable])

    useEffect(() => {
        if (entityFilter.length === 0) {
            setVisiblePageIds(null)
            return
        }
        let cancelled = false
        Promise.all(entityFilter.map((id) => getStorage().storyBible.appearances(id)))
            .then((perEntity) => {
                if (cancelled) return
                // Intersection of page_ids across all selected entities.
                const sets = perEntity.map(
                    (links) =>
                        new Set(
                            links
                                .map((l) => l.page_id)
                                .filter((p): p is string => Boolean(p)),
                        ),
                )
                const intersection = sets.reduce<Set<string>>((acc, s, idx) => {
                    if (idx === 0) return new Set(s)
                    return new Set([...acc].filter((id) => s.has(id)))
                }, new Set())
                setVisiblePageIds(intersection)
            })
            .catch(() => {
                if (!cancelled) setVisiblePageIds(null)
            })
        return () => {
            cancelled = true
        }
    }, [entityFilter])

    const toggleEntityFilter = useCallback((entityId: string) => {
        setEntityFilter((prev) =>
            prev.includes(entityId)
                ? prev.filter((id) => id !== entityId)
                : [...prev, entityId],
        )
    }, [])

    // C11: continuity warnings, grouped by the page they badge.
    // Dismissed page_ids are local (advisory, per the spec). Re-fetched
    // when a link changes (linkRefreshKey) so a drop clears/adds a warn.
    const [warningsByPage, setWarningsByPage] = useState<
        Record<string, ContinuityWarning[]>
    >({})
    const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(
        new Set(),
    )
    const [linkRefreshKey, setLinkRefreshKey] = useState(0)

    useEffect(() => {
        if (!storyBibleAvailable) return
        let cancelled = false
        getStorage().storyBible
            .continuityCheck(bookId)
            .then((rows) => {
                if (cancelled) return
                const grouped: Record<string, ContinuityWarning[]> = {}
                for (const w of rows) {
                    ;(grouped[w.page_id] ??= []).push(w)
                }
                setWarningsByPage(grouped)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [bookId, storyBibleAvailable, linkRefreshKey])

    return {
        storyBibleAvailable,
        storyBibleOpen,
        setStoryBibleOpen,
        selectedEntityId,
        setSelectedEntityId,
        viewMode,
        setViewMode,
        entities,
        entityFilter,
        setEntityFilter,
        visiblePageIds,
        warningsByPage,
        dismissedWarnings,
        setDismissedWarnings,
        linkRefreshKey,
        setLinkRefreshKey,
        openEntity,
        toggleEntityFilter,
    }
}
