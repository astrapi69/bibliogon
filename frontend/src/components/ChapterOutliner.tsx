/** Chapter Outliner — a spreadsheet/grid view of a book's chapters
 *  (CHAPTER-OUTLINER-VIEW-01, Scrivener analysis top-10 #4).
 *
 *  The tabular counterpart to the card-based ProseStoryboard: one row
 *  per chapter with sortable columns (position, title, word count,
 *  target, status, label, beat) and inline-editable cells. Reuses the
 *  status/label/beat select components + the optimistic-locked chapter
 *  PATCH; title click opens the chapter in the editor.
 *
 *  Its columns come from CHAPTER-STATUS-LABELS-01 (status/label) +
 *  WRITING-GOALS-PROGRESS-TRACKING-01 (target_words). */
import React, {useCallback, useEffect, useMemo, useState} from "react"
import {ArrowLeft, ChevronDown, ChevronUp} from "lucide-react"

import {
    api,
    SaveAbortedError,
    type Chapter,
    type ChapterLabel,
    type ChapterUpdatePayload,
} from "../api/client"
import {getStorage} from "../storage"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"
import {BeatSelect} from "./StoryboardAnnotations"
import {LabelSelect, StatusSelect} from "./ChapterStatusLabel"
import {chapterWordCount} from "./ProseStoryboard"
import styles from "./ChapterOutliner.module.css"

type OutlinerPatch = Pick<
    ChapterUpdatePayload,
    "status" | "label_id" | "target_words" | "story_beat" | "notes"
>

type SortKey = "position" | "title" | "words" | "target" | "status"

interface Props {
    bookId: string
    bookTitle: string
    onSelectChapter: (chapterId: string) => void
    onBack: () => void
    testidNamespace?: string
}

export default function ChapterOutliner({
    bookId,
    bookTitle,
    onSelectChapter,
    onBack,
    testidNamespace = "outliner",
}: Props) {
    const {t} = useI18n()
    const [chapters, setChapters] = useState<Chapter[]>([])
    const [labels, setLabels] = useState<ChapterLabel[]>([])
    const [loaded, setLoaded] = useState(false)
    const [loadError, setLoadError] = useState(false)
    const [sortKey, setSortKey] = useState<SortKey>("position")
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

    useEffect(() => {
        let cancelled = false
        getStorage()
            .chapters.list(bookId)
            .then((rows) => {
                if (!cancelled) {
                    setChapters(rows)
                    setLoaded(true)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoadError(true)
                    setLoaded(true)
                }
            })
        return () => {
            cancelled = true
        }
    }, [bookId])

    const loadLabels = useCallback(() => {
        if (getStorage().mode === "dexie") { setLabels([]); return }
        getStorage().chapterLabels.list(bookId).then(setLabels).catch(() => setLabels([]))
    }, [bookId])
    useEffect(() => loadLabels(), [loadLabels])

    const handlePatch = useCallback(
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
        [bookId, chapters, t],
    )

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"))
        } else {
            setSortKey(key)
            setSortDir("asc")
        }
    }

    const sorted = useMemo(() => {
        const dir = sortDir === "asc" ? 1 : -1
        const val = (c: Chapter): number | string => {
            switch (sortKey) {
                case "title":
                    return (c.title || "").toLowerCase()
                case "words":
                    return chapterWordCount(c.content)
                case "target":
                    return c.target_words ?? -1
                case "status":
                    return c.status ?? ""
                default:
                    return c.position
            }
        }
        return [...chapters].sort((a, b) => {
            const av = val(a)
            const bv = val(b)
            if (av < bv) return -1 * dir
            if (av > bv) return 1 * dir
            return a.position - b.position
        })
    }, [chapters, sortKey, sortDir])

    const SortHeader = ({label, col}: {label: string; col: SortKey}) => (
        <th
            className={styles.sortable}
            onClick={() => toggleSort(col)}
            data-testid={`${testidNamespace}-sort-${col}`}
            aria-sort={sortKey === col ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
            {label}
            {sortKey === col &&
                (sortDir === "asc" ? (
                    <ChevronUp size={12} style={{verticalAlign: "middle"}} />
                ) : (
                    <ChevronDown size={12} style={{verticalAlign: "middle"}} />
                ))}
        </th>
    )

    return (
        <div className={styles.container} data-testid={testidNamespace}>
            <div className={styles.header}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onBack}
                    data-testid={`${testidNamespace}-back`}
                    aria-label={t("ui.storyboard.back", "Back to editor")}
                >
                    <ArrowLeft size={14} /> {t("ui.storyboard.back", "Back to editor")}
                </button>
                <span className={styles.headerTitle}>
                    {t("ui.outliner.title", "Outliner")} — {bookTitle}
                </span>
                <span className={styles.headerCount} data-testid={`${testidNamespace}-count`}>
                    {chapters.length} {t("ui.storyboard.chapters_unit", "chapters")}
                </span>
            </div>
            <div className={styles.scroll}>
                {loadError ? (
                    <div className={styles.empty} data-testid={`${testidNamespace}-error`}>
                        {t("ui.storyboard.load_error_chapters", "Failed to load chapters.")}
                    </div>
                ) : !loaded ? (
                    <div className={styles.empty} data-testid={`${testidNamespace}-loading`}>
                        {t("ui.storyboard.loading_chapters", "Loading chapters...")}
                    </div>
                ) : chapters.length === 0 ? (
                    <div className={styles.empty} data-testid={`${testidNamespace}-empty`}>
                        {t("ui.storyboard.empty_chapters", "No chapters yet.")}
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <SortHeader label="#" col="position" />
                                <SortHeader label={t("ui.outliner.col_title", "Title")} col="title" />
                                <SortHeader label={t("ui.outliner.col_words", "Words")} col="words" />
                                <SortHeader label={t("ui.outliner.col_target", "Target")} col="target" />
                                <SortHeader label={t("ui.chapter_status.label", "Status")} col="status" />
                                <th>{t("ui.chapter_label.label", "Label")}</th>
                                <th>{t("ui.storyboard.beat_label", "Beat")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((ch) => {
                                const words = chapterWordCount(ch.content)
                                const over =
                                    ch.target_words != null &&
                                    ch.target_words > 0 &&
                                    words >= ch.target_words
                                return (
                                    <tr key={ch.id} data-testid={`${testidNamespace}-row-${ch.id}`}>
                                        <td className={styles.num}>{ch.position + 1}</td>
                                        <td
                                            className={styles.titleCell}
                                            onClick={() => onSelectChapter(ch.id)}
                                            data-testid={`${testidNamespace}-title-${ch.id}`}
                                        >
                                            {ch.title || t("ui.storyboard.card_no_title", "(untitled)")}
                                        </td>
                                        <td className={`${styles.num} ${over ? styles.over : ""}`}>
                                            {words}
                                        </td>
                                        <td className={styles.num}>
                                            <input
                                                type="number"
                                                min={0}
                                                className={`input ${styles.targetInput}`}
                                                defaultValue={ch.target_words ?? ""}
                                                aria-label={t("ui.chapter_target.label", "Word target")}
                                                data-testid={`${testidNamespace}-target-${ch.id}`}
                                                onBlur={(e) => {
                                                    const raw = e.target.value.trim()
                                                    const next =
                                                        raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0)
                                                    if (next === (ch.target_words ?? null)) return
                                                    void handlePatch(ch.id, {target_words: next})
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <StatusSelect
                                                value={ch.status ?? null}
                                                onSave={(status) => void handlePatch(ch.id, {status})}
                                                namespace={testidNamespace}
                                                idSuffix={ch.id}
                                            />
                                        </td>
                                        <td>
                                            <LabelSelect
                                                value={ch.label_id ?? null}
                                                labels={labels}
                                                onSave={(labelId) =>
                                                    void handlePatch(ch.id, {label_id: labelId})
                                                }
                                                namespace={testidNamespace}
                                                idSuffix={ch.id}
                                            />
                                        </td>
                                        <td>
                                            <BeatSelect
                                                value={ch.story_beat ?? null}
                                                onSave={(beat) => void handlePatch(ch.id, {story_beat: beat})}
                                                namespace={testidNamespace}
                                                idSuffix={ch.id}
                                            />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
