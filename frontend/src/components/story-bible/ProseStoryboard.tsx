/** Prose-book Storyboard (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3).
 *
 * The chapter-based counterpart to the page-based ``Storyboard``. A
 * prose author sees their whole book as a grid of chapter cards and
 * annotates each one with the same four storyboard fields (notes /
 * story_beat / mood_color / act_group) as a picture/comic page card.
 *
 * Per the Pre-Inspection Stop-Condition ("Prose storyboard Chapter-card
 * rendering differs fundamentally from Page-card"): a Page card renders
 * an image thumbnail + entity-link drop-target + continuity badges +
 * arc-view, none of which apply to a chapter. A chapter card renders a
 * title + word count instead. So this is a SEPARATE component rather
 * than a controlled variant of the page Storyboard — but the four
 * annotation editors ARE shared (StoryboardAnnotations, extracted in
 * the same commit per the Recurring-Component-Unification Rule) and
 * both surfaces reuse ``Storyboard.module.css`` so they look identical.
 *
 * Drag-reorder uses the existing ``PUT /books/{id}/chapters/reorder``
 * endpoint. Annotation auto-save uses the optimistic-locked
 * ``PATCH /books/{id}/chapters/{id}`` endpoint — each save echoes the
 * current ``version`` and replaces the local row with the bumped
 * response so the next save carries the fresh version.
 */
import React, {useCallback, useEffect, useMemo, useState} from "react"
import {ArrowLeft, GripVertical, Tags} from "lucide-react"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core"
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable"
import {CSS} from "@dnd-kit/utilities"

import {
    SaveAbortedError,
    type Chapter,
    type ChapterLabel,
    type ChapterUpdatePayload,
} from "../../api/client"
import {getStorage} from "../../storage"
import {useI18n} from "../../hooks/useI18n"
import {notify} from "../../utils/platform/notify"
import {
    ActGroupInput,
    BeatSelect,
    MoodColorPicker,
    NotesEditor,
} from "./StoryboardAnnotations"
import {LabelChip, LabelSelect, StatusChip, StatusSelect} from "../book/ChapterStatusLabel"
import ChapterLabelManager from "../book/ChapterLabelManager"
import AiStoryExtraction from "./AiStoryExtraction"
import type {ChapterStatus} from "../../api/client"
import styles from "./Storyboard.module.css"

/** Patch shape the chapter card hands back up: a single annotation
 *  field. ``version`` is added by the parent from the current row. */
type ChapterAnnotationPatch = Pick<
    ChapterUpdatePayload,
    "notes" | "story_beat" | "mood_color" | "act_group" | "status" | "label_id" | "target_words"
>

/** Flatten a TipTap doc to plain text (mirrors the helper in
 *  Storyboard.tsx for page preview titles). */
function flattenTipTapText(node: unknown): string {
    if (!node || typeof node !== "object") return ""
    const n = node as {type?: string; text?: string; content?: unknown[]}
    if (typeof n.text === "string") return n.text
    if (!Array.isArray(n.content)) return ""
    const parts = n.content.map((child) => flattenTipTapText(child))
    const isBlock = n.type === "doc" || n.type === "paragraph" || n.type?.startsWith("heading")
    return parts.join(isBlock ? "\n" : " ")
}

/** Approximate word count for a chapter's stored content. Content is
 *  TipTap JSON serialised as a string (or legacy plain text); both are
 *  flattened to plain text, then whitespace-split. */
export function chapterWordCount(content: string | null | undefined): number {
    const raw = content ?? ""
    if (!raw.trim()) return 0
    let plain = raw
    if (raw.trimStart().startsWith("{")) {
        try {
            plain = flattenTipTapText(JSON.parse(raw))
        } catch {
            plain = raw
        }
    }
    const words = plain.trim().split(/\s+/).filter(Boolean)
    return words.length
}

interface ChapterActGroup {
    actGroup: string | null
    chapters: Chapter[]
}

/** Group chapters by ``act_group`` preserving position order within
 *  each act and first-seen act order. Mirrors groupByActGroup in
 *  Storyboard.tsx (the page sibling). */
function groupChaptersByActGroup(chapters: Chapter[]): ChapterActGroup[] {
    if (chapters.length === 0) return []
    const groups: ChapterActGroup[] = []
    const byName = new Map<string | null, Chapter[]>()
    for (const chapter of chapters) {
        const key = chapter.act_group ?? null
        if (!byName.has(key)) {
            byName.set(key, [])
            groups.push({actGroup: key, chapters: byName.get(key)!})
        }
        byName.get(key)!.push(chapter)
    }
    return groups
}

interface Props {
    bookId: string
    bookTitle: string
    onSelectChapter: (chapterId: string) => void
    onBack: () => void
    /** Testid namespace per the project's testid-pinning rule. */
    testidNamespace?: string
}

export default function ProseStoryboard({
    bookId,
    bookTitle,
    onSelectChapter,
    onBack,
    testidNamespace = "prose-storyboard",
}: Props) {
    const {t} = useI18n()
    const [chapters, setChapters] = useState<Chapter[]>([])
    const [labels, setLabels] = useState<ChapterLabel[]>([])
    const [showLabelManager, setShowLabelManager] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false
        getStorage().chapters
            .list(bookId)
            .then((rows) => {
                if (cancelled) return
                setChapters(rows)
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

    const reloadChapters = useCallback(() => {
        getStorage()
            .chapters.list(bookId)
            .then(setChapters)
            .catch(() => undefined)
    }, [bookId])

    // Per-book chapter labels (CHAPTER-STATUS-LABELS-01). Loaded
    // alongside chapters; refetched after any label mutation so the
    // per-card label selects + chips stay in sync. A label-load failure
    // is non-fatal — the storyboard still works without labels.
    const loadLabels = useCallback(() => {
        getStorage().chapterLabels
            .list(bookId)
            .then(setLabels)
            .catch(() => setLabels([]))
    }, [bookId])

    useEffect(() => {
        loadLabels()
    }, [loadLabels])

    const grouped = useMemo(() => groupChaptersByActGroup(chapters), [chapters])
    const totalChapters = chapters.length
    const chapterIds = useMemo(() => chapters.map((c) => c.id), [chapters])

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const {active, over} = event
            if (!over || active.id === over.id) return
            const oldIndex = chapterIds.indexOf(active.id as string)
            const newIndex = chapterIds.indexOf(over.id as string)
            if (oldIndex === -1 || newIndex === -1) return
            const next = arrayMove(chapterIds, oldIndex, newIndex)
            const nextChapters = next
                .map((id) => chapters.find((c) => c.id === id))
                .filter((c): c is Chapter => Boolean(c))
            setChapters(nextChapters.map((c, idx) => ({...c, position: idx})))
            void getStorage().chapters
                .reorder(bookId, next)
                .then((rows) => setChapters(rows))
                .catch((err: unknown) => {
                    setLoadError(err instanceof Error ? err.message : String(err))
                    void getStorage().chapters
                        .list(bookId)
                        .then((rows) => setChapters(rows))
                        .catch(() => {})
                })
        },
        [bookId, chapterIds, chapters],
    )

    /** Annotation auto-save. Echoes the chapter's current optimistic-
     *  lock version, replaces the local row with the bumped response.
     *  On a version conflict (or any error other than an abort) the
     *  chapter is refetched so the next save carries a fresh version,
     *  and a toast surfaces the failure. */
    const handlePatchChapter = useCallback(
        async (chapterId: string, patch: ChapterAnnotationPatch): Promise<void> => {
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
                // Resync version so the user's next edit isn't doomed to
                // a second 409.
                try {
                    const fresh = await getStorage().chapters.get(bookId, chapterId)
                    setChapters((prev) => prev.map((c) => (c.id === chapterId ? fresh : c)))
                } catch {
                    // leave optimistic state; the toast already fired.
                }
                throw err
            }
        },
        [bookId, chapters, t],
    )

    return (
        <div className={styles.container} data-testid={testidNamespace}>
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <button
                        type="button"
                        className={styles.actionButton}
                        onClick={onBack}
                        data-testid={`${testidNamespace}-back`}
                        aria-label={t("ui.storyboard.back", "Back to editor")}
                    >
                        <ArrowLeft size={14} />
                        {t("ui.storyboard.back", "Back to editor")}
                    </button>
                    <span>
                        {t("ui.storyboard.title", "Storyboard")}
                        {" — "}
                        {bookTitle}
                    </span>
                    <span
                        className={styles.headerCount}
                        data-testid={`${testidNamespace}-chapter-count`}
                    >
                        {totalChapters} {t("ui.storyboard.chapters_unit", "chapters")}
                    </span>
                    <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => setShowLabelManager((v) => !v)}
                        data-testid={`${testidNamespace}-manage-labels`}
                        aria-expanded={showLabelManager ? "true" : "false"}
                    >
                        <Tags size={14} />
                        {t("ui.chapter_label.manage", "Manage labels")}
                    </button>
                    <AiStoryExtraction
                        bookId={bookId}
                        target="storyboard"
                        onApplied={reloadChapters}
                        triggerClassName={styles.actionButton}
                        triggerLabel={t(
                            "ui.ai_extraction.storyboard_button",
                            "Aus Buchtext generieren",
                        )}
                    />
                </div>
            </div>
            {showLabelManager && (
                <ChapterLabelManager
                    bookId={bookId}
                    labels={labels}
                    onChanged={loadLabels}
                    namespace={`${testidNamespace}-labels`}
                />
            )}
            <div className={styles.bodyRow}>
                <div className={styles.scroll}>
                    {loadError ? (
                        <div className={styles.empty} data-testid={`${testidNamespace}-error`}>
                            {t("ui.storyboard.load_error_chapters", "Failed to load chapters.")}
                        </div>
                    ) : !loaded ? (
                        <div className={styles.empty} data-testid={`${testidNamespace}-loading`}>
                            {t("ui.storyboard.loading_chapters", "Loading chapters...")}
                        </div>
                    ) : totalChapters === 0 ? (
                        <div className={styles.empty} data-testid={`${testidNamespace}-empty`}>
                            {t(
                                "ui.storyboard.empty_chapters",
                                "No chapters yet. Add chapters from the editor to see them here.",
                            )}
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext items={chapterIds} strategy={rectSortingStrategy}>
                                {grouped.map(({actGroup, chapters: groupChapters}, idx) => (
                                    <div
                                        key={actGroup ?? `__no-act-${idx}`}
                                        className={styles.actGroup}
                                        data-testid={`${testidNamespace}-act-group`}
                                        data-act-group={actGroup ?? ""}
                                    >
                                        {actGroup && (
                                            <h3 className={styles.actGroupHeader}>{actGroup}</h3>
                                        )}
                                        <div
                                            className={styles.grid}
                                            data-testid={`${testidNamespace}-grid`}
                                        >
                                            {groupChapters.map((chapter) => (
                                                <SortableChapterCard
                                                    key={chapter.id}
                                                    chapter={chapter}
                                                    labels={labels}
                                                    onSelect={onSelectChapter}
                                                    onPatch={handlePatchChapter}
                                                    testidNamespace={testidNamespace}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </div>
    )
}

interface ChapterCardProps {
    chapter: Chapter
    labels: ChapterLabel[]
    onSelect: (chapterId: string) => void
    onPatch: (chapterId: string, patch: ChapterAnnotationPatch) => Promise<void>
    testidNamespace: string
}

/** Sortable wrapper around ChapterCard (mirrors SortableStoryboardCard). */
function SortableChapterCard(props: ChapterCardProps) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
        id: props.chapter.id,
    })
    const {t} = useI18n()
    const sortableStyle: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        position: "relative",
    }
    return (
        <div ref={setNodeRef} style={sortableStyle}>
            <ChapterCard {...props} />
            <span
                {...attributes}
                {...listeners}
                className={styles.dragHandle}
                data-testid={`${props.testidNamespace}-drag-handle-${props.chapter.id}`}
                aria-label={t("ui.storyboard.drag_handle", "Drag to reorder")}
            >
                <GripVertical size={14} />
            </span>
        </div>
    )
}

function ChapterCard({chapter, labels, onSelect, onPatch, testidNamespace}: ChapterCardProps) {
    const {t} = useI18n()
    const wordCount = chapterWordCount(chapter.content)
    const assignedLabel = chapter.label_id
        ? labels.find((l) => l.id === chapter.label_id) ?? null
        : null

    const moodStyle: React.CSSProperties = chapter.mood_color
        ? {borderLeftColor: chapter.mood_color}
        : {}
    const cardClass = [styles.card, chapter.mood_color ? styles.cardMoodBorder : ""]
        .filter(Boolean)
        .join(" ")

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(chapter.id)
        }
    }

    return (
        <div
            role="button"
            tabIndex={0}
            className={cardClass}
            style={moodStyle}
            onClick={() => onSelect(chapter.id)}
            onKeyDown={handleKeyDown}
            data-testid={`${testidNamespace}-card-${chapter.id}`}
            data-position={chapter.position}
            data-story-beat={chapter.story_beat ?? ""}
            data-mood-color={chapter.mood_color ?? ""}
            aria-label={`${t("ui.storyboard.open_chapter", "Open chapter")}: ${chapter.title}`}
        >
            <div className={styles.body}>
                <div className={styles.titleRow}>
                    <span className={styles.position}>{chapter.position + 1}</span>
                    {chapter.title ? (
                        <span className={styles.title}>{chapter.title}</span>
                    ) : (
                        <span className={styles.titlePlaceholder}>
                            {t("ui.storyboard.card_no_title", "(untitled)")}
                        </span>
                    )}
                </div>
                <div className={styles.metaRow}>
                    <span
                        className={styles.tag}
                        data-testid={`${testidNamespace}-word-count-${chapter.id}`}
                    >
                        {t("ui.storyboard.word_count", "{count} words").replace(
                            "{count}",
                            String(wordCount),
                        )}
                    </span>
                    {chapter.story_beat && (
                        <span
                            className={styles.beatTag}
                            data-testid={`${testidNamespace}-beat-tag-${chapter.id}`}
                        >
                            {t(`ui.storyboard.beat.${chapter.story_beat}`, chapter.story_beat)}
                        </span>
                    )}
                    {chapter.status && (
                        <StatusChip
                            status={chapter.status as ChapterStatus}
                            namespace={testidNamespace}
                            idSuffix={chapter.id}
                        />
                    )}
                    {assignedLabel && (
                        <LabelChip
                            label={assignedLabel}
                            namespace={testidNamespace}
                            idSuffix={chapter.id}
                        />
                    )}
                </div>
                <StatusSelect
                    value={chapter.status ?? null}
                    onSave={(status) => void onPatch(chapter.id, {status}).catch(() => {})}
                    namespace={testidNamespace}
                    idSuffix={chapter.id}
                />
                <LabelSelect
                    value={chapter.label_id ?? null}
                    labels={labels}
                    onSave={(labelId) =>
                        void onPatch(chapter.id, {label_id: labelId}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={chapter.id}
                />
                <input
                    type="number"
                    min={0}
                    className={styles.actGroupInput}
                    defaultValue={chapter.target_words ?? ""}
                    placeholder={t("ui.chapter_target.placeholder", "Word target")}
                    aria-label={t("ui.chapter_target.label", "Word target")}
                    data-testid={`${testidNamespace}-target-${chapter.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                    }}
                    onBlur={(e) => {
                        const raw = e.target.value.trim()
                        const next = raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0)
                        if (next === (chapter.target_words ?? null)) return
                        void onPatch(chapter.id, {target_words: next}).catch(() => {})
                    }}
                />
                <BeatSelect
                    value={chapter.story_beat ?? null}
                    onSave={(beat) =>
                        void onPatch(chapter.id, {story_beat: beat}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={chapter.id}
                />
                <MoodColorPicker
                    value={chapter.mood_color ?? null}
                    onSave={(color) =>
                        void onPatch(chapter.id, {mood_color: color}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={chapter.id}
                />
                <ActGroupInput
                    value={chapter.act_group ?? null}
                    onSave={(label) =>
                        void onPatch(chapter.id, {act_group: label}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={chapter.id}
                />
                <NotesEditor
                    value={chapter.notes ?? null}
                    onSave={(notes) => void onPatch(chapter.id, {notes}).catch(() => {})}
                    namespace={testidNamespace}
                    idSuffix={chapter.id}
                    ariaLabel={t("ui.storyboard.notes_label_chapter", "Chapter notes")}
                />
            </div>
        </div>
    )
}
