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
import {useMemo} from "react"
import {ArrowLeft, BookOpen, LayoutGrid, Network} from "lucide-react"
import {DndContext, closestCenter} from "@dnd-kit/core"
import {rectSortingStrategy, SortableContext} from "@dnd-kit/sortable"

import {type Page} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import {useStoryboardData} from "../../hooks/useStoryboardData"
import {useStoryBibleIntegration} from "../../hooks/useStoryBibleIntegration"
import StoryBibleSidebar from "./StoryBibleSidebar"
import StoryboardArcView from "./StoryboardArcView"
import {entityTypeColor, entityTypeIcon} from "./storyBibleIcons"
import {SortableStoryboardCard} from "./StoryboardCard"
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
