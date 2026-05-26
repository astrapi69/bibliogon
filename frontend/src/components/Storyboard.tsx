/** Storyboard view (PICTURE-BOOK-STORYBOARD-VIEW-01 Session 1 MVP).
 *
 * Read-only grid view of a book's pages — author sees the entire
 * story-flow at a glance. Sibling to PageEditor + BookMetadataEditor;
 * mounted via the ``?view=storyboard`` query-param flip in BookEditor.
 *
 * Per A5 of the Pre-Inspection: this ships with its own
 * ``StoryboardCard`` rendering instead of extending the existing
 * shared ``PageThumbnails`` component. Sidebar-strip vs grid+
 * annotations shapes diverge enough that a 3rd-level shared card
 * would force a props-bloat or controlled-variant anti-pattern.
 *
 * Session 1 ships read-only browsing. Session 1 C6 adds drag-reorder
 * via the existing ``/api/books/{id}/pages/reorder`` endpoint.
 * Session 2 adds inline annotation editing (notes / story_beat /
 * mood_color / act_group).
 *
 * Click-card navigation returns to the default editor with the
 * clicked page selected — wired via ``onSelectPage`` callback that
 * the parent (BookEditor) routes through history state.
 */
import React, {useCallback, useEffect, useMemo, useState} from "react"
import {ArrowLeft, FileImage, GripVertical, ImageOff} from "lucide-react"
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

import {api, type Page} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import styles from "./Storyboard.module.css"

interface Props {
    bookId: string
    bookTitle: string
    onSelectPage: (pageId: string) => void
    onBack: () => void
    /** Testid namespace per the project's testid-pinning rule. */
    testidNamespace?: string
}

export default function Storyboard({
    bookId,
    bookTitle,
    onSelectPage,
    onBack,
    testidNamespace = "storyboard",
}: Props) {
    const {t} = useI18n()
    const [pages, setPages] = useState<Page[]>([])
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false
        api.pages
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

    const grouped = useMemo(() => groupByActGroup(pages), [pages])
    const totalPages = pages.length
    const pageIds = useMemo(() => pages.map((p) => p.id), [pages])

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
            void api.pages
                .reorder(bookId, next)
                .then((rows) => setPages(rows))
                .catch((err: unknown) => {
                    // On failure, refetch authoritative order so the
                    // UI doesn't silently keep the optimistic state.
                    setLoadError(err instanceof Error ? err.message : String(err))
                    void api.pages
                        .list(bookId)
                        .then((rows) => setPages(rows))
                        .catch(() => {})
                })
        },
        [bookId, pageIds, pages],
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
                        data-testid={`${testidNamespace}-page-count`}
                    >
                        {totalPages}
                        {" "}
                        {t("ui.storyboard.pages_unit", "pages")}
                    </span>
                </div>
            </div>
            <div className={styles.scroll}>
                {loadError ? (
                    <div
                        className={styles.empty}
                        data-testid={`${testidNamespace}-error`}
                    >
                        {t("ui.storyboard.load_error", "Failed to load pages.")}
                    </div>
                ) : !loaded ? (
                    <div
                        className={styles.empty}
                        data-testid={`${testidNamespace}-loading`}
                    >
                        {t("ui.storyboard.loading", "Loading pages...")}
                    </div>
                ) : totalPages === 0 ? (
                    <div
                        className={styles.empty}
                        data-testid={`${testidNamespace}-empty`}
                    >
                        {t(
                            "ui.storyboard.empty",
                            "No pages yet. Add pages from the editor to see them here.",
                        )}
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={pageIds} strategy={rectSortingStrategy}>
                            {grouped.map(({actGroup, pages: groupPages}, idx) => (
                                <div
                                    key={actGroup ?? `__no-act-${idx}`}
                                    className={styles.actGroup}
                                    data-testid={`${testidNamespace}-act-group`}
                                    data-act-group={actGroup ?? ""}
                                >
                                    {actGroup && (
                                        <h3 className={styles.actGroupHeader}>
                                            {actGroup}
                                        </h3>
                                    )}
                                    <div
                                        className={styles.grid}
                                        data-testid={`${testidNamespace}-grid`}
                                    >
                                        {groupPages.map((page) => (
                                            <SortableStoryboardCard
                                                key={page.id}
                                                bookId={bookId}
                                                page={page}
                                                onSelect={onSelectPage}
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
    )
}

interface CardProps {
    bookId: string
    page: Page
    onSelect: (pageId: string) => void
    testidNamespace: string
}

/** Sortable wrapper around StoryboardCard. The card itself is a
 *  <button> so the drag-handle is a sibling <span> with the
 *  ``draggable`` listeners + attributes; clicking the card body
 *  navigates via ``onSelect``, gripping the handle starts a drag.
 *  Mirrors PageThumbnails' SortablePageRow split between row +
 *  drag handle. */
function SortableStoryboardCard(props: CardProps) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: props.page.id})
    const sortableStyle: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        position: "relative",
    }
    const {t} = useI18n()
    return (
        <div ref={setNodeRef} style={sortableStyle}>
            <StoryboardCard {...props} />
            <span
                {...attributes}
                {...listeners}
                className={styles.dragHandle}
                data-testid={`${props.testidNamespace}-drag-handle-${props.page.id}`}
                aria-label={t("ui.storyboard.drag_handle", "Drag to reorder")}
            >
                <GripVertical size={14} />
            </span>
        </div>
    )
}

function StoryboardCard({bookId, page, onSelect, testidNamespace}: CardProps) {
    const {t} = useI18n()
    const previewTitle = derivePreviewTitle(page)
    const moodStyle: React.CSSProperties = page.mood_color
        ? {borderLeftColor: page.mood_color}
        : {}
    const cardClass = [styles.card, page.mood_color ? styles.cardMoodBorder : ""]
        .filter(Boolean)
        .join(" ")

    return (
        <button
            type="button"
            className={cardClass}
            style={moodStyle}
            onClick={() => onSelect(page.id)}
            data-testid={`${testidNamespace}-card-${page.id}`}
            data-position={page.position}
            data-layout={page.layout}
            data-story-beat={page.story_beat ?? ""}
            data-mood-color={page.mood_color ?? ""}
            aria-label={`${t("ui.storyboard.open_page", "Open page")} ${page.position}`}
        >
            <div className={styles.thumbnail}>
                {page.image_asset_id ? (
                    <img
                        className={styles.thumbnailImg}
                        src={imageUrlFor(bookId, page.image_asset_id)}
                        alt=""
                    />
                ) : page.layout === "text_only" ? (
                    <FileImage size={28} aria-hidden />
                ) : (
                    <ImageOff size={28} aria-hidden />
                )}
            </div>
            <div className={styles.body}>
                <div className={styles.titleRow}>
                    <span className={styles.position}>{page.position}</span>
                    {previewTitle ? (
                        <span className={styles.title}>{previewTitle}</span>
                    ) : (
                        <span className={styles.titlePlaceholder}>
                            {t("ui.storyboard.card_no_text", "(no text)")}
                        </span>
                    )}
                </div>
                <div className={styles.metaRow}>
                    <span
                        className={styles.tag}
                        data-testid={`${testidNamespace}-layout-tag-${page.id}`}
                    >
                        {t(
                            `ui.page_editor.layout.${page.layout}`,
                            page.layout.replace(/_/g, " "),
                        )}
                    </span>
                    {page.story_beat && (
                        <span
                            className={styles.beatTag}
                            data-testid={`${testidNamespace}-beat-tag-${page.id}`}
                        >
                            {t(
                                `ui.storyboard.beat.${page.story_beat}`,
                                page.story_beat,
                            )}
                        </span>
                    )}
                </div>
            </div>
        </button>
    )
}

// --- Helpers ---------------------------------------------------------

function imageUrlFor(bookId: string, assetId: string): string {
    return `/api/books/${bookId}/assets/${assetId}/file`
}

/** First non-empty line from ``page.text_content``. Handles both
 *  plain-string layouts (speech_bubble / image_full_text_overlay)
 *  and TipTap-JSON layouts (image_top_text_bottom /
 *  image_left_text_right / text_only).
 *
 *  Truncates to ~60 chars to fit the card's title row. Returns ``""``
 *  for pages with no text — caller renders a localised placeholder. */
function derivePreviewTitle(page: Page): string {
    const raw = page.text_content ?? ""
    if (!raw.trim()) return ""
    // Try TipTap JSON first — quietly fall back to plain-text path
    // when the parse fails or the result isn't a doc shape.
    let plain = raw
    if (raw.trimStart().startsWith("{")) {
        try {
            const parsed = JSON.parse(raw)
            plain = flattenTipTapText(parsed)
        } catch {
            plain = raw
        }
    }
    const firstLine = plain
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0)
    if (!firstLine) return ""
    return firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine
}

/** Flatten a TipTap doc to plain text. Visits text nodes
 *  depth-first; joins with newlines between block-level nodes so
 *  the first-non-empty-line heuristic in derivePreviewTitle picks
 *  the first user-visible line rather than collapsing the whole doc
 *  to a single string. */
function flattenTipTapText(node: unknown): string {
    if (!node || typeof node !== "object") return ""
    const n = node as {type?: string; text?: string; content?: unknown[]}
    if (typeof n.text === "string") return n.text
    if (!Array.isArray(n.content)) return ""
    const parts = n.content.map((child) => flattenTipTapText(child))
    const isBlock = n.type === "doc" || n.type === "paragraph" || n.type?.startsWith("heading")
    return parts.join(isBlock ? "\n" : "")
}

interface ActGroup {
    actGroup: string | null
    pages: Page[]
}

/** Group pages by ``act_group`` while preserving their position
 *  order WITHIN each act and the first-seen order of the acts.
 *  Pages without an act_group land in a single trailing untitled
 *  group (rendered without a header). Pages without any act-group
 *  values at all render as a single flat group. */
function groupByActGroup(pages: Page[]): ActGroup[] {
    if (pages.length === 0) return []
    const groups: ActGroup[] = []
    const byName = new Map<string | null, Page[]>()
    for (const page of pages) {
        const key = page.act_group ?? null
        if (!byName.has(key)) {
            byName.set(key, [])
            groups.push({actGroup: key, pages: byName.get(key)!})
        }
        byName.get(key)!.push(page)
    }
    return groups
}
