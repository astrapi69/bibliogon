/** Optimistic-locked per-field save for the Chapter Outliner
 *  (extracted from ChapterOutliner for cohesion — CHAPTER-OUTLINER-VIEW-01).
 *
 *  Sends a single-field PATCH carrying the chapter's current version; on
 *  success it swaps the updated row into state, on a SaveAbortedError it
 *  silently no-ops, and on any other error it surfaces a toast and
 *  re-reads the chapter from the storage seam so the row reflects the
 *  server state. Behaviour is identical to the inline handler it
 *  replaced — no functional change. */
import {type Dispatch, type SetStateAction, useCallback} from "react"

import {SaveAbortedError, type Chapter, type ChapterUpdatePayload} from "../../api/client"
import {getStorage} from "../../storage"
import {useI18n} from "../../hooks/useI18n"
import {notify} from "../../utils/platform/notify"

export type OutlinerPatch = Pick<
    ChapterUpdatePayload,
    "status" | "label_id" | "target_words" | "story_beat" | "notes" | "synopsis" | "inspector_notes"
>

export function useInlineEdit(
    bookId: string,
    chapters: Chapter[],
    setChapters: Dispatch<SetStateAction<Chapter[]>>,
): (chapterId: string, patch: OutlinerPatch) => Promise<void> {
    const {t} = useI18n()
    return useCallback(
        async (chapterId: string, patch: OutlinerPatch): Promise<void> => {
            const current = chapters.find((c) => c.id === chapterId)
            if (!current) return
            try {
                const updated = await getStorage().chapters.update(bookId, chapterId, {
                    version: current.version,
                    ...patch,
                })
                setChapters((prev) => prev.map((c) => (c.id === chapterId ? updated : c)))
            } catch (err: unknown) {
                if (err instanceof SaveAbortedError) return
                notify.error(t("ui.storyboard.save_failed", "Save failed"), err)
                try {
                    const fresh = await getStorage().chapters.get(bookId, chapterId)
                    setChapters((prev) => prev.map((c) => (c.id === chapterId ? fresh : c)))
                } catch {
                    /* toast already fired */
                }
            }
        },
        [bookId, chapters, setChapters, t],
    )
}
