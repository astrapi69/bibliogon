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
import {ArrowLeft, ChevronDown, ChevronUp, Wand2} from "lucide-react"

import {type BookCollection, type Chapter, type ChapterLabel} from "../../api/client"
import {getStorage} from "../../storage"
import {useI18n} from "../../hooks/useI18n"
import {notify} from "../../utils/platform/notify"
import {firstParagraphText} from "../../lib/utils/firstParagraph"
import {BeatSelect} from "../story-bible/StoryboardAnnotations"
import {LabelSelect, StatusSelect} from "./ChapterStatusLabel"
import {chapterWordCount} from "../story-bible/ProseStoryboard"
import OutlinerCollectionsBar from "./OutlinerCollectionsBar"
import {useInlineEdit} from "./useInlineEdit"
import styles from "../ChapterOutliner.module.css"

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
    const [collections, setCollections] = useState<BookCollection[]>([])
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
    const [filterToCollection, setFilterToCollection] = useState(false)

    useEffect(() => {
        let cancelled = false
        getStorage()
            .books.get(bookId)
            .then((book) => {
                if (!cancelled) setCollections(book.collections ?? [])
            })
            .catch(() => {
                if (!cancelled) setCollections([])
            })
        return () => {
            cancelled = true
        }
    }, [bookId])

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
        getStorage().chapterLabels.list(bookId).then(setLabels).catch(() => setLabels([]))
    }, [bookId])
    useEffect(() => loadLabels(), [loadLabels])

    const handlePatch = useInlineEdit(bookId, chapters, setChapters)

    const handleAutoSynopsis = useCallback(
        (chapter: Chapter): void => {
            const generated = firstParagraphText(chapter.content)
            if (!generated || generated === (chapter.synopsis ?? "")) return
            void handlePatch(chapter.id, {synopsis: generated})
        },
        [handlePatch],
    )

    // --- Collections (CHAPTER-COLLECTIONS-01) ---

    const activeCollection = useMemo(
        () => collections.find((c) => c.id === activeCollectionId) ?? null,
        [collections, activeCollectionId],
    )

    const saveCollections = useCallback(
        (next: BookCollection[]): void => {
            setCollections(next)
            void getStorage()
                .books.update(bookId, {collections: next})
                .catch((err) =>
                    notify.error(t("ui.outliner.collection_save_failed", "Could not save collection"), err),
                )
        },
        [bookId, t],
    )

    const handleNewCollection = useCallback(() => {
        const created: BookCollection = {
            id: crypto.randomUUID(),
            name: t("ui.outliner.collection_default_name", "New collection"),
            chapter_ids: [],
        }
        saveCollections([...collections, created])
        setActiveCollectionId(created.id)
        setFilterToCollection(false)
    }, [collections, saveCollections, t])

    const handleRenameCollection = useCallback(
        (name: string) => {
            const trimmed = name.trim()
            if (!activeCollection || !trimmed || trimmed === activeCollection.name) return
            saveCollections(
                collections.map((c) => (c.id === activeCollection.id ? {...c, name: trimmed} : c)),
            )
        },
        [activeCollection, collections, saveCollections],
    )

    const handleDeleteCollection = useCallback(() => {
        if (!activeCollection) return
        saveCollections(collections.filter((c) => c.id !== activeCollection.id))
        setActiveCollectionId(null)
        setFilterToCollection(false)
    }, [activeCollection, collections, saveCollections])

    const toggleMembership = useCallback(
        (chapterId: string) => {
            if (!activeCollection) return
            const ids = activeCollection.chapter_ids.includes(chapterId)
                ? activeCollection.chapter_ids.filter((id) => id !== chapterId)
                : [...activeCollection.chapter_ids, chapterId]
            saveCollections(
                collections.map((c) => (c.id === activeCollection.id ? {...c, chapter_ids: ids} : c)),
            )
        },
        [activeCollection, collections, saveCollections],
    )

    const setCollectionColor = useCallback(
        (color: string | null) => {
            if (!activeCollection) return
            saveCollections(
                collections.map((c) => (c.id === activeCollection.id ? {...c, color} : c)),
            )
        },
        [activeCollection, collections, saveCollections],
    )

    const selectCollection = useCallback((id: string | null) => {
        setActiveCollectionId(id)
        setFilterToCollection(false)
    }, [])

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

    const displayed = useMemo(() => {
        if (filterToCollection && activeCollection) {
            const ids = new Set(activeCollection.chapter_ids)
            return sorted.filter((c) => ids.has(c.id))
        }
        return sorted
    }, [sorted, filterToCollection, activeCollection])

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
            <OutlinerCollectionsBar
                collections={collections}
                activeCollectionId={activeCollectionId}
                activeCollection={activeCollection}
                filterToCollection={filterToCollection}
                onSelect={selectCollection}
                onFilterChange={setFilterToCollection}
                onNew={handleNewCollection}
                onRename={handleRenameCollection}
                onDelete={handleDeleteCollection}
                onSetColor={setCollectionColor}
                testidNamespace={testidNamespace}
            />
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
                                {activeCollection && (
                                    <th>{t("ui.outliner.col_in_collection", "In")}</th>
                                )}
                                <SortHeader label="#" col="position" />
                                <SortHeader label={t("ui.outliner.col_title", "Title")} col="title" />
                                <SortHeader label={t("ui.outliner.col_words", "Words")} col="words" />
                                <SortHeader label={t("ui.outliner.col_target", "Target")} col="target" />
                                <SortHeader label={t("ui.chapter_status.label", "Status")} col="status" />
                                <th>{t("ui.chapter_label.label", "Label")}</th>
                                <th>{t("ui.storyboard.beat_label", "Beat")}</th>
                                <th>{t("ui.outliner.col_synopsis", "Synopsis")}</th>
                                <th>{t("ui.outliner.col_notes", "Notes")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayed.map((ch) => {
                                const words = chapterWordCount(ch.content)
                                const over =
                                    ch.target_words != null &&
                                    ch.target_words > 0 &&
                                    words >= ch.target_words
                                return (
                                    <tr key={ch.id} data-testid={`${testidNamespace}-row-${ch.id}`}>
                                        {activeCollection && (
                                            <td className={styles.num}>
                                                <input
                                                    type="checkbox"
                                                    checked={activeCollection.chapter_ids.includes(ch.id)}
                                                    onChange={() => toggleMembership(ch.id)}
                                                    aria-label={t("ui.outliner.col_in_collection", "In collection")}
                                                    data-testid={`${testidNamespace}-member-${ch.id}`}
                                                />
                                            </td>
                                        )}
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
                                        <td>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    key={`syn-${ch.id}-${ch.synopsis ?? ""}`}
                                                    className="input w-full min-w-[10rem]"
                                                    defaultValue={ch.synopsis ?? ""}
                                                    placeholder={t("ui.outliner.synopsis_placeholder", "Short summary…")}
                                                    aria-label={t("ui.outliner.col_synopsis", "Synopsis")}
                                                    data-testid={`${testidNamespace}-synopsis-${ch.id}`}
                                                    onBlur={(e) => {
                                                        const next = e.target.value.trim() || null
                                                        if (next === (ch.synopsis ?? null)) return
                                                        void handlePatch(ch.id, {synopsis: next})
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleAutoSynopsis(ch)}
                                                    title={t("ui.outliner.synopsis_auto", "Generate from first paragraph")}
                                                    aria-label={t("ui.outliner.synopsis_auto", "Generate from first paragraph")}
                                                    data-testid={`${testidNamespace}-synopsis-auto-${ch.id}`}
                                                >
                                                    <Wand2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <input
                                                key={`notes-${ch.id}-${ch.inspector_notes ?? ""}`}
                                                className="input w-full min-w-[10rem]"
                                                defaultValue={ch.inspector_notes ?? ""}
                                                placeholder={t("ui.outliner.notes_placeholder", "Working notes…")}
                                                aria-label={t("ui.outliner.col_notes", "Notes")}
                                                data-testid={`${testidNamespace}-notes-${ch.id}`}
                                                onBlur={(e) => {
                                                    const next = e.target.value.trim() || null
                                                    if (next === (ch.inspector_notes ?? null)) return
                                                    void handlePatch(ch.id, {inspector_notes: next})
                                                }}
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
