import {useCallback, useEffect, useState} from "react"
import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core"
import {arrayMove, sortableKeyboardCoordinates} from "@dnd-kit/sortable"

import {getStorage} from "../storage"
import {type Page, type PageUpdate} from "../api/client"
import {useI18n} from "./useI18n"
import {notify} from "../utils/platform/notify"

/** Owns the storyboard's page list, load state, dnd sensors, reorder
 *  and annotation-patch handlers. Self-loads the pages on mount. */
export function useStoryboardData(bookId: string) {
    const {t} = useI18n()
    const [pages, setPages] = useState<Page[]>([])
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false
        getStorage().pages
            .list(bookId)
            .then((rows) => {
                if (cancelled) return
                setPages(rows)
                setLoaded(true)
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setLoadError(err instanceof Error ? err.message : String(err))
                setLoaded(true)
            })
        return () => {
            cancelled = true
        }
    }, [bookId])

    // @dnd-kit reorder mirrors PageThumbnails (codebase convention is
    // inline reorder logic per-component; no shared useSortable hook).
    // Pointer activation constraint of 5px prevents drag-on-click;
    // KeyboardSensor enables Tab+Space/Enter reorder for accessibility.
    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const {active, over} = event
            if (!over || active.id === over.id) return
            const pageIds = pages.map((p) => p.id)
            const oldIndex = pageIds.indexOf(active.id as string)
            const newIndex = pageIds.indexOf(over.id as string)
            if (oldIndex === -1 || newIndex === -1) return
            const next = arrayMove(pageIds, oldIndex, newIndex)
            // Optimistic local reorder before the network round-trip
            // so the cards don't visibly snap back to their old slots.
            // The /reorder endpoint returns the canonical re-positioned
            // rows; replace local state with that authoritative shape.
            const nextPages = next
                .map((id) => pages.find((p) => p.id === id))
                .filter((p): p is Page => Boolean(p))
            setPages(nextPages.map((p, idx) => ({...p, position: idx + 1})))
            void getStorage().pages
                .reorder(bookId, next)
                .then((rows) => setPages(rows))
                .catch((err: unknown) => {
                    // On failure, refetch authoritative order so the
                    // UI doesn't silently keep the optimistic state.
                    setLoadError(err instanceof Error ? err.message : String(err))
                    void getStorage().pages
                        .list(bookId)
                        .then((rows) => setPages(rows))
                        .catch(() => {})
                })
        },
        [bookId, pages],
    )

    /** Annotation auto-save (Session 2 C1+). Patches a single field
     *  on a single page; on success, replaces the page row in local
     *  state with the authoritative response. On failure, fires a
     *  toast (per the lessons-learned "annotation PATCH fails
     *  silently" Stop-Condition) — local state stays optimistic so
     *  the user doesn't lose their edit, but the toast surfaces the
     *  error for retry. */
    const handlePatchPage = useCallback(
        async (pageId: string, patch: PageUpdate): Promise<void> => {
            try {
                const updated = await getStorage().pages.update(bookId, pageId, patch)
                setPages((prev) =>
                    prev.map((p) => (p.id === pageId ? updated : p)),
                )
            } catch (err: unknown) {
                notify.error(t("ui.storyboard.save_failed", "Save failed"), err)
                throw err
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bookId],
    )

    return {
        pages,
        setPages,
        loadError,
        loaded,
        sensors,
        handleDragEnd,
        handlePatchPage,
    }
}
