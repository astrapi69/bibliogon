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
import React, {useEffect, useMemo, useState} from "react"
import {
    AlertTriangle,
    ArrowLeft,
    BookOpen,
    FileImage,
    GripVertical,
    ImageOff,
    LayoutGrid,
    Network,
    X,
} from "lucide-react"
import {DndContext, closestCenter} from "@dnd-kit/core"
import {
    rectSortingStrategy,
    SortableContext,
    useSortable,
} from "@dnd-kit/sortable"
import {CSS} from "@dnd-kit/utilities"

import {
    type ContinuityWarning,
    type Page,
    type PageUpdate,
    type StoryEntityLinkOut,
    type StoryEntityOut,
} from "../../api/client"
import {getStorage} from "../../storage";
import {imageUrlFor} from "../../utils/platform/imageUrl"
import {useI18n} from "../../hooks/useI18n"
import {useStoryboardData} from "../../hooks/useStoryboardData"
import {useStoryBibleIntegration} from "../../hooks/useStoryBibleIntegration"
import {notify} from "../../utils/platform/notify"
import StoryBibleSidebar, {STORY_ENTITY_DND_MIME} from "./StoryBibleSidebar"
import StoryboardArcView from "./StoryboardArcView"
import {entityTypeColor, entityTypeIcon} from "../storyBibleIcons"
import {
    ActGroupInput,
    BeatSelect,
    MoodColorPicker,
    NotesEditor,
} from "./StoryboardAnnotations"
import styles from "./Storyboard.module.css"

/** Max entity badges shown on a storyboard card before the
 *  "+N" overflow indicator (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C5). */
const MAX_VISIBLE_BADGES = 5

/** Localize a continuity warning (C11). */
function continuityMessage(
    w: ContinuityWarning,
    t: (key: string, fallback: string) => string,
): string {
    if (w.code === "entity_disappears") {
        return t(
            "ui.storyboard.continuity_disappears",
            "{name} disappears after this page",
        ).replace("{name}", w.entity_name ?? "")
    }
    if (w.code === "entity_gap") {
        return t("ui.storyboard.continuity_gap", "{name} is absent until page {to}")
            .replace("{name}", w.entity_name ?? "")
            .replace("{to}", String(w.gap_to_position ?? ""))
    }
    return t("ui.storyboard.continuity_empty_page", "No entities on this page")
}

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
    const {pages, loadError, loaded, sensors, handleDragEnd, handlePatchPage} =
        useStoryboardData(bookId)
    const {
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
        setLinkRefreshKey,
        openEntity,
        toggleEntityFilter,
    } = useStoryBibleIntegration(bookId)

    // C8: when an entity filter is active, only pages in the
    // intersection are shown. visiblePageIds === null means no filter.
    const filteredPages = useMemo(
        () =>
            visiblePageIds === null
                ? pages
                : pages.filter((p) => visiblePageIds.has(p.id)),
        [pages, visiblePageIds],
    )
    const grouped = useMemo(() => groupByActGroup(filteredPages), [filteredPages])
    const totalPages = pages.length
    const pageIds = useMemo(() => pages.map((p) => p.id), [pages])

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
                {storyBibleAvailable && (
                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={styles.actionButton}
                            onClick={() =>
                                setViewMode((m) => (m === "grid" ? "arc" : "grid"))
                            }
                            aria-pressed={viewMode === "arc"}
                            data-testid={`${testidNamespace}-view-toggle`}
                            title={
                                viewMode === "grid"
                                    ? t("ui.storyboard.arc_view", "Arc view")
                                    : t("ui.storyboard.grid_view", "Grid view")
                            }
                        >
                            {viewMode === "grid" ? (
                                <Network size={14} />
                            ) : (
                                <LayoutGrid size={14} />
                            )}
                            {viewMode === "grid"
                                ? t("ui.storyboard.arc_view", "Arc view")
                                : t("ui.storyboard.grid_view", "Grid view")}
                        </button>
                        <button
                            type="button"
                            className={styles.actionButton}
                            onClick={() => setStoryBibleOpen((v) => !v)}
                            aria-pressed={storyBibleOpen}
                            data-testid={`${testidNamespace}-story-bible-toggle`}
                            title={t("ui.story_bible.sidebar_button", "Story Bible")}
                        >
                            <BookOpen size={14} />
                            {t("ui.story_bible.sidebar_button", "Story Bible")}
                        </button>
                    </div>
                )}
            </div>
            <div className={styles.bodyRow}>
            <div className={styles.scroll}>
                {storyBibleAvailable && entities.length > 0 && viewMode === "grid" && (
                    <div
                        className={styles.entityFilter}
                        data-testid={`${testidNamespace}-entity-filter`}
                    >
                        <span className={styles.entityFilterLabel}>
                            {t("ui.storyboard.filter_label", "Show only pages with")}
                        </span>
                        {entities.map((entity) => {
                            const active = entityFilter.includes(entity.id)
                            const Icon = entityTypeIcon(entity.entity_type)
                            return (
                                <button
                                    key={entity.id}
                                    type="button"
                                    className={`${styles.filterChip} ${active ? styles.filterChipActive : ""}`}
                                    style={{color: entityTypeColor(entity.entity_type)}}
                                    aria-pressed={active}
                                    onClick={() => toggleEntityFilter(entity.id)}
                                    data-testid={`${testidNamespace}-filter-chip-${entity.id}`}
                                >
                                    <Icon size={12} aria-hidden />
                                    {entity.name}
                                </button>
                            )
                        })}
                        {entityFilter.length > 0 && (
                            <button
                                type="button"
                                className={styles.filterClear}
                                onClick={() => setEntityFilter([])}
                                data-testid={`${testidNamespace}-filter-clear`}
                            >
                                {t("ui.storyboard.filter_clear", "Clear")}
                            </button>
                        )}
                    </div>
                )}
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
                ) : viewMode === "arc" ? (
                    <StoryboardArcView
                        pages={pages}
                        entities={entities}
                        onSelectPage={onSelectPage}
                        testidNamespace={`${testidNamespace}-arc`}
                    />
                ) : filteredPages.length === 0 ? (
                    <div
                        className={styles.empty}
                        data-testid={`${testidNamespace}-filter-empty`}
                    >
                        {t(
                            "ui.storyboard.filter_no_match",
                            "No pages match the selected entities.",
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
                                                storyBibleAvailable={storyBibleAvailable}
                                                onOpenEntity={openEntity}
                                                warnings={warningsByPage[page.id] ?? []}
                                                warningsDismissed={dismissedWarnings.has(
                                                    page.id,
                                                )}
                                                onDismissWarnings={() =>
                                                    setDismissedWarnings((prev) =>
                                                        new Set(prev).add(page.id),
                                                    )
                                                }
                                                onLinksChanged={() =>
                                                    setLinkRefreshKey((k) => k + 1)
                                                }
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
            {storyBibleAvailable && storyBibleOpen && (
                <StoryBibleSidebar
                    bookId={bookId}
                    onClose={() => setStoryBibleOpen(false)}
                    onSelectEntity={(entity) => setSelectedEntityId(entity.id)}
                    selectedEntityId={selectedEntityId}
                    entitiesDraggable
                />
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
    /** True when plugin-story-bible is mounted; gates the per-card
     *  entity-badge fetch (C5). */
    storyBibleAvailable: boolean
    /** Badge click -> open the Story Bible sidebar with this entity
     *  selected (C5). */
    onOpenEntity: (entityId: string) => void
    /** C11: continuity warnings for this page (advisory). */
    warnings: ContinuityWarning[]
    /** C11: whether the user dismissed this page's warnings. */
    warningsDismissed: boolean
    /** C11: dismiss this page's warning badge. */
    onDismissWarnings: () => void
    /** C6/C11: fired after a link is created here so the parent
     *  re-runs the continuity check. */
    onLinksChanged: () => void
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

function StoryboardCard({
    bookId,
    page,
    onSelect,
    onPatch,
    storyBibleAvailable,
    onOpenEntity,
    warnings,
    warningsDismissed,
    onDismissWarnings,
    onLinksChanged,
    testidNamespace,
}: CardProps) {
    const {t} = useI18n()
    const previewTitle = derivePreviewTitle(page)

    // C5: entity badges. Fetch the entities linked to this page when
    // plugin-story-bible is active. Each card fetches its own links
    // (the page->entities endpoint); N small reads is acceptable at
    // storyboard scale. ``cancelled`` guards the async setState.
    const [links, setLinks] = useState<StoryEntityLinkOut[]>([])
    useEffect(() => {
        if (!storyBibleAvailable) return
        let cancelled = false
        getStorage().storyBible
            .pageEntities(page.id)
            .then((rows) => {
                if (!cancelled) setLinks(rows)
            })
            .catch(() => {
                // Badges are non-critical; a fetch failure leaves the
                // card without badges rather than surfacing a toast.
            })
        return () => {
            cancelled = true
        }
    }, [page.id, storyBibleAvailable])

    // C6: this card is an HTML5 drop target for entities dragged from
    // the Story Bible sidebar. Dropping creates a link + appends the
    // badge. ``isDropTarget`` highlights the card during a valid drag.
    const [isDropTarget, setIsDropTarget] = useState(false)

    const handleDragOver = (e: React.DragEvent) => {
        if (!storyBibleAvailable) return
        if (e.dataTransfer.types.includes(STORY_ENTITY_DND_MIME)) {
            e.preventDefault() // mark as a valid drop target
            setIsDropTarget(true)
        }
    }

    const handleDrop = async (e: React.DragEvent) => {
        if (!storyBibleAvailable) return
        const entityId = e.dataTransfer.getData(STORY_ENTITY_DND_MIME)
        if (!entityId) return
        e.preventDefault()
        setIsDropTarget(false)
        // Idempotent: ignore a drop of an entity already linked here.
        if (links.some((l) => l.entity_id === entityId)) return
        try {
            const link = await getStorage().storyBible.createLink({
                entity_id: entityId,
                page_id: page.id,
            })
            setLinks((prev) => [...prev, link])
            onLinksChanged()
            notify.success(
                t("ui.storyboard.entity_linked", 'Linked "{name}" to page {page}')
                    .replace("{name}", link.entity.name)
                    .replace("{page}", String(page.position)),
            )
        } catch (err: unknown) {
            notify.error(
                t("ui.storyboard.entity_link_failed", "Could not link entity"),
                err,
            )
        }
    }
    const moodStyle: React.CSSProperties = page.mood_color
        ? {borderLeftColor: page.mood_color}
        : {}
    const cardClass = [
        styles.card,
        page.mood_color ? styles.cardMoodBorder : "",
        isDropTarget ? styles.cardDropTarget : "",
    ]
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
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDropTarget(false)}
            onDrop={(e) => void handleDrop(e)}
            data-testid={`${testidNamespace}-card-${page.id}`}
            data-position={page.position}
            data-layout={page.layout}
            data-story-beat={page.story_beat ?? ""}
            data-mood-color={page.mood_color ?? ""}
            data-drop-target={isDropTarget ? "true" : "false"}
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
                    {warnings.length > 0 && !warningsDismissed && (
                        <span
                            className={styles.warnBadge}
                            data-testid={`${testidNamespace}-warning-${page.id}`}
                            title={warnings
                                .map((w) => continuityMessage(w, t))
                                .join("\n")}
                        >
                            <AlertTriangle size={13} aria-hidden />
                            <button
                                type="button"
                                className={styles.warnDismiss}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDismissWarnings()
                                }}
                                data-testid={`${testidNamespace}-warning-dismiss-${page.id}`}
                                aria-label={t(
                                    "ui.storyboard.continuity_dismiss",
                                    "Dismiss warnings",
                                )}
                            >
                                <X size={11} />
                            </button>
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
                {links.length > 0 && (
                    <div
                        className={styles.entityBadges}
                        data-testid={`${testidNamespace}-entity-badges-${page.id}`}
                    >
                        {links.slice(0, MAX_VISIBLE_BADGES).map((link) => {
                            const entity: StoryEntityOut = link.entity
                            const Icon = entityTypeIcon(entity.entity_type)
                            return (
                                <button
                                    key={link.id}
                                    type="button"
                                    className={styles.entityBadge}
                                    style={{color: entityTypeColor(entity.entity_type)}}
                                    onClick={(e) => {
                                        // Don't trigger the card's navigate.
                                        e.stopPropagation()
                                        onOpenEntity(entity.id)
                                    }}
                                    data-testid={`${testidNamespace}-entity-badge-${page.id}-${entity.id}`}
                                    title={entity.name}
                                >
                                    <Icon size={12} aria-hidden />
                                    <span className={styles.entityBadgeName}>
                                        {entity.name}
                                    </span>
                                </button>
                            )
                        })}
                        {links.length > MAX_VISIBLE_BADGES && (
                            <span
                                className={styles.entityBadgeMore}
                                data-testid={`${testidNamespace}-entity-badges-more-${page.id}`}
                            >
                                {t("ui.storyboard.more_entities", "+{count} more").replace(
                                    "{count}",
                                    String(links.length - MAX_VISIBLE_BADGES),
                                )}
                            </span>
                        )}
                    </div>
                )}
                <BeatSelect
                    value={page.story_beat ?? null}
                    onSave={(beat) =>
                        void onPatch(page.id, {story_beat: beat}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={page.id}
                />
                <MoodColorPicker
                    value={page.mood_color ?? null}
                    onSave={(color) =>
                        void onPatch(page.id, {mood_color: color}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={page.id}
                />
                <ActGroupInput
                    value={page.act_group ?? null}
                    onSave={(label) =>
                        void onPatch(page.id, {act_group: label}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={page.id}
                />
                <NotesEditor
                    value={page.notes ?? null}
                    onSave={(notes) =>
                        void onPatch(page.id, {notes}).catch(() => {})
                    }
                    namespace={testidNamespace}
                    idSuffix={page.id}
                />
            </div>
        </div>
    )
}

// --- Helpers ---------------------------------------------------------

// Phase 3 C1 (2026-05-28). imageUrlFor extracted to
// ``../utils/imageUrl.ts`` for cross-surface reuse (RCU rule —
// Storyboard + PageCanvas + CollageCanvas).

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
