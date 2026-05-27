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
import {ArrowLeft, FileImage, GripVertical, ImageOff, X} from "lucide-react"
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

import {api, type Page, type PageUpdate, type StoryBeat} from "../api/client"

/** 6 story-beat values per Pre-Inspection A2 (Setup / Inciting /
 *  Rising / Climax / Falling / Resolution). The order matters for
 *  the dropdown: it follows the canonical dramatic-structure arc
 *  the author walks through, not alphabetical. */
const STORY_BEATS: readonly StoryBeat[] = [
    "setup",
    "inciting",
    "rising",
    "climax",
    "falling",
    "resolution",
] as const

/** Mood-color preset palette (PICTURE-BOOK-STORYBOARD-VIEW-01
 *  Session 2 C3). 10 curated colors covering the typical picture-
 *  book emotional range (warm/cool/happy/sad/calm/exciting/etc.).
 *
 *  Stored as a tuple {value, key} where ``value`` is the hex code
 *  that round-trips into ``page.mood_color`` (validated via
 *  MOOD_COLOR_RE on the backend) and ``key`` is the i18n key
 *  segment for the localised label (used as title-attr tooltip
 *  + screen-reader aria-label). Authors with custom needs can
 *  hand-edit the YAML or wait for the v3 free-color-picker
 *  follow-up. */
const MOOD_PALETTE: readonly {value: string; key: string}[] = [
    {value: "#FFC857", key: "sunny"},
    {value: "#FF6B6B", key: "passionate"},
    {value: "#4ECDC4", key: "calm"},
    {value: "#C7B8EA", key: "dreamy"},
    {value: "#7FB069", key: "peaceful"},
    {value: "#F18A07", key: "adventurous"},
    {value: "#F4A6CD", key: "tender"},
    {value: "#6C7A89", key: "somber"},
    {value: "#2E4057", key: "mysterious"},
    {value: "#F4ECD8", key: "gentle"},
] as const
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"
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
                const updated = await api.pages.update(bookId, pageId, patch)
                setPages((prev) =>
                    prev.map((p) => (p.id === pageId ? updated : p)),
                )
            } catch (err: unknown) {
                notify.error(t("ui.storyboard.save_failed", "Save failed"), err)
                throw err
            }
        },
        [bookId],
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
                                                onPatch={handlePatchPage}
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
    /** Auto-save annotation patch (notes / story_beat / mood_color /
     *  act_group). Parent merges the response into the pages list.
     *  Rejects on network/validation failure; the caller has already
     *  shown a toast — children should not double-toast. */
    onPatch: (pageId: string, patch: PageUpdate) => Promise<void>
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

function StoryboardCard({bookId, page, onSelect, onPatch, testidNamespace}: CardProps) {
    const {t} = useI18n()
    const previewTitle = derivePreviewTitle(page)
    const moodStyle: React.CSSProperties = page.mood_color
        ? {borderLeftColor: page.mood_color}
        : {}
    const cardClass = [styles.card, page.mood_color ? styles.cardMoodBorder : ""]
        .filter(Boolean)
        .join(" ")

    // Card root is a div + role="button" (not <button>) so the nested
    // form controls (notes textarea + future beat select / color
    // picker / act-group input) are valid HTML. Mirrors the
    // PageThumbnails SortablePageRow pattern.
    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Don't navigate when the user is typing in a child input.
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(page.id)
        }
    }

    return (
        <div
            role="button"
            tabIndex={0}
            className={cardClass}
            style={moodStyle}
            onClick={() => onSelect(page.id)}
            onKeyDown={handleKeyDown}
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
                <BeatSelector
                    page={page}
                    onPatch={onPatch}
                    testidNamespace={testidNamespace}
                />
                <MoodColorPicker
                    page={page}
                    onPatch={onPatch}
                    testidNamespace={testidNamespace}
                />
                <ActGroupInput
                    page={page}
                    onPatch={onPatch}
                    testidNamespace={testidNamespace}
                />
                <NotesEditor
                    page={page}
                    onPatch={onPatch}
                    testidNamespace={testidNamespace}
                />
            </div>
        </div>
    )
}

interface BeatSelectorProps {
    page: Page
    onPatch: (pageId: string, patch: PageUpdate) => Promise<void>
    testidNamespace: string
}

/** Native <select> dropdown for ``page.story_beat`` (PICTURE-BOOK-
 *  STORYBOARD-VIEW-01 Session 2 C2). 6 dramatic-structure values per
 *  A2 + an empty "—" option for clearing.
 *
 *  Native <select> chosen over Radix Select for happy-dom test
 *  reliability (per the "Radix DropdownMenu + happy-dom is
 *  brittle" lessons-learned rule). The same brittleness applies to
 *  Radix Select; native <select>'s onChange fires deterministically
 *  in Vitest. The visible badge above the selector already shows
 *  the chosen value translated via ui.storyboard.beat.* so the
 *  user reads the localised name even when the <select> dropdown
 *  itself shows the i18n labels. */
function BeatSelector({page, onPatch, testidNamespace}: BeatSelectorProps) {
    const {t} = useI18n()
    const value = page.story_beat ?? ""

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const next = e.target.value as StoryBeat | ""
        const normalised: StoryBeat | null = next === "" ? null : next
        if (normalised === (page.story_beat ?? null)) return
        void onPatch(page.id, {story_beat: normalised}).catch(() => {})
    }

    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation()
    }

    return (
        <select
            className={styles.beatSelect}
            value={value}
            onChange={handleChange}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={stop}
            data-testid={`${testidNamespace}-beat-select-${page.id}`}
            aria-label={t("ui.storyboard.beat_label", "Story beat")}
        >
            <option value="">
                {t("ui.storyboard.beat_none", "— no beat —")}
            </option>
            {STORY_BEATS.map((beat) => (
                <option key={beat} value={beat}>
                    {t(`ui.storyboard.beat.${beat}`, beat)}
                </option>
            ))}
        </select>
    )
}

interface ActGroupInputProps {
    page: Page
    onPatch: (pageId: string, patch: PageUpdate) => Promise<void>
    testidNamespace: string
}

/** Inline editable act-group label (PICTURE-BOOK-STORYBOARD-VIEW-01
 *  Session 2 C4). Drives the grouping-headers in the storyboard
 *  grid (groupByActGroup helper reads page.act_group; cards
 *  re-render under a new group when the label changes).
 *
 *  Drag behaviour intentionally does NOT couple to act_group:
 *  the SortableContext wraps the flat page-id list, so dragging
 *  a card across visual group boundaries reorders ``position``
 *  but leaves act_group unchanged. The next render snaps the
 *  card back to its own group, which would look glitchy if the
 *  user intended to change groups — but they didn't, they
 *  intended to reorder position. Auto-update-on-cross-group is
 *  filed as STORYBOARD-DRAG-CROSS-GROUP-ACT-UPDATE-01 follow-up
 *  if the UX surfaces a real-world need. */
function ActGroupInput({page, onPatch, testidNamespace}: ActGroupInputProps) {
    const {t} = useI18n()
    const [value, setValue] = useState<string>(page.act_group ?? "")

    useEffect(() => {
        setValue(page.act_group ?? "")
    }, [page.id, page.act_group])

    const handleBlur = () => {
        const normalised = value.trim() === "" ? null : value.trim()
        const persisted = page.act_group ?? null
        if (normalised === persisted) return
        void onPatch(page.id, {act_group: normalised}).catch(() => {})
    }

    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation()
    }

    return (
        <input
            type="text"
            className={styles.actGroupInput}
            value={value}
            placeholder={t(
                "ui.storyboard.act_group_placeholder",
                "Act / chapter (optional)",
            )}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={(e) => {
                stop(e)
                if (e.key === "Enter") {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                }
            }}
            data-testid={`${testidNamespace}-act-group-${page.id}`}
            aria-label={t("ui.storyboard.act_group_label", "Act group")}
            maxLength={100}
        />
    )
}

interface MoodColorPickerProps {
    page: Page
    onPatch: (pageId: string, patch: PageUpdate) => Promise<void>
    testidNamespace: string
}

/** Preset mood-color swatches (PICTURE-BOOK-STORYBOARD-VIEW-01
 *  Session 2 C3). 10 curated picture-book mood colors + a clear
 *  button. Clicking a swatch sets it; clicking the currently-
 *  selected swatch clears it (toggle behaviour). The card's left
 *  border already renders the mood color via the cardMoodBorder
 *  class shipped in Session 1 C4 — this picker drives that
 *  border. */
function MoodColorPicker({page, onPatch, testidNamespace}: MoodColorPickerProps) {
    const {t} = useI18n()
    const current = page.mood_color ?? null

    const setColor = (next: string | null) => {
        if (next === current) return
        void onPatch(page.id, {mood_color: next}).catch(() => {})
    }

    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation()
    }

    return (
        <div
            className={styles.moodPalette}
            data-testid={`${testidNamespace}-mood-palette-${page.id}`}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={stop}
            role="group"
            aria-label={t("ui.storyboard.mood_label", "Mood color")}
        >
            {MOOD_PALETTE.map(({value, key}) => {
                const selected = current?.toUpperCase() === value.toUpperCase()
                const label = t(`ui.storyboard.mood.${key}`, key)
                return (
                    <button
                        key={value}
                        type="button"
                        className={[
                            styles.moodSwatch,
                            selected ? styles.moodSwatchSelected : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        style={{backgroundColor: value}}
                        onClick={(e) => {
                            stop(e)
                            setColor(selected ? null : value)
                        }}
                        data-testid={`${testidNamespace}-mood-swatch-${key}-${page.id}`}
                        data-selected={selected ? "true" : "false"}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected ? "true" : "false"}
                    />
                )
            })}
            {current && (
                <button
                    type="button"
                    className={styles.moodClear}
                    onClick={(e) => {
                        stop(e)
                        setColor(null)
                    }}
                    data-testid={`${testidNamespace}-mood-clear-${page.id}`}
                    title={t("ui.storyboard.mood_clear", "Clear color")}
                    aria-label={t("ui.storyboard.mood_clear", "Clear color")}
                >
                    <X size={10} aria-hidden />
                </button>
            )}
        </div>
    )
}

interface NotesEditorProps {
    page: Page
    onPatch: (pageId: string, patch: PageUpdate) => Promise<void>
    testidNamespace: string
}

/** Auto-saving notes textarea (PICTURE-BOOK-STORYBOARD-VIEW-01
 *  Session 2 C1). Local state mirrors page.notes; onBlur fires the
 *  PATCH only when the value changed from the server's view of the
 *  field. Empty string normalises to null so a user clearing the
 *  textarea writes NULL back (matching the patch_clears_storyboard_
 *  field_via_null backend test pin).
 *
 *  stopPropagation on click + keyDown + mouseDown prevents the
 *  card's navigation handler from firing while the user edits the
 *  notes. Drag-handle remains a sibling overlay (no interference). */
function NotesEditor({page, onPatch, testidNamespace}: NotesEditorProps) {
    const {t} = useI18n()
    const [value, setValue] = useState<string>(page.notes ?? "")

    // Sync local state when the page row is replaced (e.g. by a
    // sibling annotation save that returns the same row with fresh
    // updated_at). useEffect guards against the case where the
    // user is mid-edit on a different field — we keep local state
    // when only updated_at changed.
    useEffect(() => {
        setValue(page.notes ?? "")
    }, [page.id, page.notes])

    const handleBlur = () => {
        const normalised = value.trim() === "" ? null : value
        const persisted = page.notes ?? null
        if (normalised === persisted) return
        void onPatch(page.id, {notes: normalised}).catch(() => {
            // Parent already toasted the error; keep local state so
            // the user doesn't lose their edit.
        })
    }

    const stop = (e: React.SyntheticEvent) => {
        e.stopPropagation()
    }

    return (
        <textarea
            className={styles.notesEditor}
            value={value}
            placeholder={t(
                "ui.storyboard.notes_placeholder",
                "Add notes...",
            )}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onClick={stop}
            onMouseDown={stop}
            onKeyDown={stop}
            data-testid={`${testidNamespace}-notes-${page.id}`}
            aria-label={t("ui.storyboard.notes_label", "Page notes")}
            rows={2}
        />
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
