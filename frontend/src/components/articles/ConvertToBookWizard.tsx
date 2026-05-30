/**
 * Article-to-book conversion wizard (Phase 2 frontend).
 *
 * Guided 6-step flow that turns a multi-article selection into a new
 * Book with the articles as chapters. Pattern mirrors AiSetupWizard:
 * a Radix Dialog wrapping a step-index ``useState`` with conditional
 * render per step. CreateBookModal's collapsible-single-form shape
 * is wrong here — six conceptual steps map cleanly to a linear flow.
 *
 * Step layout:
 *   0 — Article Selection (sort + drag-reorder + tag-helpers)
 *   1 — Book Metadata (title required; subtitle/cover pre-fill on
 *       single-article conversion per Q13/Q15)
 *   2 — Front-Matter (optional, skippable)
 *   3 — Back-Matter (optional, skippable)
 *   4 — Chapter Settings
 *   5 — Review + Confirm
 *
 * Testid namespace: ``convert-to-book-wizard-{step}-{slot}``. Every
 * interactive surface is pinned so the E2E spec covers it positively
 * (prevents G2-F2-style silent-skip if the namespace ever drifts).
 *
 * Validation: Q10/Q11 422 responses arrive with a structured
 * ``BookFromArticlesValidationError`` body. The wizard catches them
 * and routes the user back to Step 0 with the offending ids
 * highlighted so the user fixes the whole selection in one pass.
 */

import {useEffect, useMemo, useRef, useState} from "react"
import {BookOpen, Check, GripVertical, X} from "lucide-react"
import {
    DndContext,
    closestCenter,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {CSS} from "@dnd-kit/utilities"

import {
    Article,
    ApiError,
    Author,
    BookDetail,
    BookFromArticlesCreate,
    BookFromArticlesSortStrategy,
    BookFromArticlesValidationError,
    api,
} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import {RadixSelect} from "../RadixSelect"
import {notify} from "../../utils/notify"
import {computeAuthorSuggestions} from "../../utils/computeAuthorSuggestions"
import AuthorSelectInput from "../AuthorSelectInput"
import WizardShell, {WizardNav} from "../wizards/WizardShell"

interface Props {
    open: boolean
    /** Articles the user pre-selected on the dashboard. The wizard
     *  starts with every id selected and lets the user narrow via
     *  tag-helpers in Step 0 without changing the parent's
     *  selection state. */
    articles: Article[]
    onClose: () => void
    /** Fires immediately after a successful POST. The page clears
     *  the bulk-selection + any wizard-local state; it does NOT
     *  navigate. Navigation lives on the toast CTA (see
     *  ``onViewBook``) so the user can choose to follow the link
     *  or stay on the Articles dashboard. */
    onConverted: (book: BookDetail) => void
    /** Fires when the user clicks the success toast's "View book"
     *  CTA. Typically navigates to ``/book/{id}``. Separated from
     *  ``onConverted`` so the page-level cleanup runs unconditionally
     *  while navigation is opt-in by the user. */
    onViewBook: (book: BookDetail) => void
}

const TOTAL_STEPS = 6

// --- helpers -------------------------------------------------------------

/** Sort the article list according to a sort strategy. Pure preview
 *  logic; the backend re-sorts with the same rules so the displayed
 *  order matches the persisted chapter order. */
function sortArticlesPreview(
    articles: Article[],
    strategy: BookFromArticlesSortStrategy,
    manualOrder: string[],
): Article[] {
    if (strategy === "manual") {
        const orderIndex = new Map(manualOrder.map((id, i) => [id, i]))
        return [...articles].sort(
            (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
        )
    }
    if (strategy === "title_asc") {
        return [...articles].sort((a, b) =>
            a.title.localeCompare(b.title, undefined, {sensitivity: "base"}),
        )
    }
    if (strategy === "title_desc") {
        return [...articles].sort((a, b) =>
            b.title.localeCompare(a.title, undefined, {sensitivity: "base"}),
        )
    }
    // date_asc / date_desc - use original_published_at, fall back to
    // created_at. Mirrors the backend.
    const dateKey = (a: Article) => a.original_published_at || a.created_at
    if (strategy === "date_desc") {
        return [...articles].sort((a, b) => dateKey(b).localeCompare(dateKey(a)))
    }
    return [...articles].sort((a, b) => dateKey(a).localeCompare(dateKey(b)))
}

/** Top tags across a selection, with article counts. Powers the
 *  "22 articles with tag X" helper in Step 0. Returns at most 5
 *  entries so the bar never grows beyond the dialog width. */
function topTagsWithCounts(
    articles: Article[],
    limit = 5,
): Array<{tag: string; count: number}> {
    const counts = new Map<string, number>()
    for (const a of articles) {
        for (const tag of a.tags) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1)
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([tag, count]) => ({tag, count}))
}

// --- SortableArticleRow --------------------------------------------------

function SortableArticleRow({
    article,
    onRemove,
    t,
}: {
    article: Article
    onRemove: () => void
    t: (key: string, fallback?: string) => string
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: article.id})

    const style: React.CSSProperties = {
        ...rowStyles.row,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-testid={`convert-to-book-wizard-selection-row-${article.id}`}
        >
            <span
                {...attributes}
                {...listeners}
                style={rowStyles.dragHandle}
                aria-label={t("ui.convert_to_book.drag_handle", "Reorder")}
            >
                <GripVertical size={14} />
            </span>
            <span style={rowStyles.title}>{article.title}</span>
            <button
                type="button"
                style={rowStyles.removeBtn}
                onClick={onRemove}
                data-testid={`convert-to-book-wizard-selection-remove-${article.id}`}
                aria-label={t("ui.convert_to_book.remove_from_selection", "Remove")}
            >
                <X size={12} />
            </button>
        </div>
    )
}

// --- main component ------------------------------------------------------

export default function ConvertToBookWizard({
    open,
    articles,
    onClose,
    onConverted,
    onViewBook,
}: Props) {
    const {t} = useI18n()
    const [step, setStep] = useState(0)

    // Wizard-local working selection. Tag-helpers narrow this set; the
    // parent page's selection is untouched. ``manualOrder`` carries
    // the user's drag-reorder for the manual strategy.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(articles.map((a) => a.id)),
    )
    const [sortStrategy, setSortStrategy] =
        useState<BookFromArticlesSortStrategy>("date_asc")
    const [manualOrder, setManualOrder] = useState<string[]>(() =>
        articles.map((a) => a.id),
    )

    // Step 1 — metadata
    const [title, setTitle] = useState("")
    const [subtitle, setSubtitle] = useState("")
    const [author, setAuthor] = useState("")
    const [language, setLanguage] = useState("en")
    const [series, setSeries] = useState("")
    const [seriesIndex, setSeriesIndex] = useState<string>("")
    const [coverImage, setCoverImage] = useState<string>("")

    // Step 2 — front matter
    const [includeTitlePage, setIncludeTitlePage] = useState(false)
    const [includeDedication, setIncludeDedication] = useState(false)
    const [dedicationText, setDedicationText] = useState("")
    const [includeIntroduction, setIncludeIntroduction] = useState(false)
    const [introductionText, setIntroductionText] = useState("")

    // Step 3 — back matter
    const [includeAcknowledgments, setIncludeAcknowledgments] = useState(false)
    const [acknowledgmentsText, setAcknowledgmentsText] = useState("")
    const [includeAuthorBio, setIncludeAuthorBio] = useState(false)
    const [authorBioText, setAuthorBioText] = useState("")

    // Step 4 — chapter settings
    const [useArticleTitleAsChapterTitle, setUseArticleTitleAsChapterTitle] =
        useState(true)

    // Submit + validation
    const [submitting, setSubmitting] = useState(false)
    const [validationError, setValidationError] =
        useState<BookFromArticlesValidationError | null>(null)

    // Bug 8 Phase 2: global Authors-Database snapshot fetched on
    // wizard mount. Powers the Step-2 author datalist alongside
    // the author values pulled from the selected articles. Silent
    // fallback on fetch error — the datalist still works from
    // article authors alone, and the input is always free-text.
    const [globalAuthors, setGlobalAuthors] = useState<Author[]>([])
    useEffect(() => {
        if (!open) return
        let cancelled = false
        api.authors
            .list()
            .then((rows) => {
                if (!cancelled) setGlobalAuthors(rows)
            })
            .catch(() => {
                /* non-critical; datalist degrades to article-only */
            })
        return () => {
            cancelled = true
        }
    }, [open])

    // Focus management on step transitions (WARN-A2). On every change to
    // ``step``, focus the first interactive element inside the step
    // container so keyboard users land on something actionable without
    // tabbing through dialog chrome. Replaces the per-input autoFocus
    // pattern which only fired on initial mount and missed Back-navigation
    // returns to a step.
    const stepContentRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const container = stepContentRef.current
        if (!container) return
        const focusable = container.querySelector<HTMLElement>(
            "input:not([type='hidden']), select, textarea, button",
        )
        focusable?.focus()
    }, [step])

    // Derived selection ------------------------------------------------

    const selectedArticles = useMemo(
        () => articles.filter((a) => selectedIds.has(a.id)),
        [articles, selectedIds],
    )

    const orderedArticles = useMemo(
        () => sortArticlesPreview(selectedArticles, sortStrategy, manualOrder),
        [selectedArticles, sortStrategy, manualOrder],
    )

    const tagSummary = useMemo(
        () => topTagsWithCounts(selectedArticles),
        [selectedArticles],
    )

    const sharedSeries = useMemo(() => {
        const values = new Set(
            selectedArticles
                .map((a) => a.series)
                .filter((s): s is string => s != null && s !== ""),
        )
        if (values.size !== 1) return null
        if (selectedArticles.some((a) => !a.series)) return null
        return [...values][0]
    }, [selectedArticles])

    // Bug 8 Phase 2: shared-author detection. If every selected
    // article carries the SAME author (trim+case-insensitive
    // compare), pre-fill the wizard's author field with that
    // value. If the selection mixes authors or any row has an
    // empty author, leave the field blank — the datalist still
    // surfaces every distinct value as a suggestion.
    const sharedAuthor = useMemo(() => {
        if (selectedArticles.length === 0) return null
        const trimmed = selectedArticles.map((a) => (a.author ?? "").trim())
        if (trimmed.some((v) => v === "")) return null
        const keys = new Set(trimmed.map((v) => v.toLowerCase()))
        if (keys.size !== 1) return null
        return trimmed[0]
    }, [selectedArticles])

    // Bug 8 Phase 2: union of article-authors + global Authors-DB
    // names, deduped + ordered (article authors first). Powers the
    // ``<datalist>`` attached to the Step-2 author input.
    const authorSuggestions = useMemo(
        () => computeAuthorSuggestions(selectedArticles, globalAuthors),
        [selectedArticles, globalAuthors],
    )

    // Bug 8 Phase 2: pre-fill author state when (a) the wizard
    // opens, OR (b) the selection narrows such that all remaining
    // articles share a single author — but ONLY when the user
    // hasn't already typed something. The empty-author guard
    // protects user input: once the user has typed, ``sharedAuthor``
    // changes (e.g. they go back to Step 0 + change selection) do
    // NOT overwrite their value. Clearing the field re-arms the
    // pre-fill on the next selection change.
    useEffect(() => {
        if (sharedAuthor && author === "") {
            setAuthor(sharedAuthor)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sharedAuthor])

    // Bug 8 Phase 2: "Add to Authors-Database" checkbox state.
    // Default-checked per D7 (the typical case is "I typed a name
    // and want it remembered"). User unchecks for one-off
    // contributors. State persists across renders so unchecking
    // sticks even as the user edits the field.
    const [addToAuthorsDb, setAddToAuthorsDb] = useState(true)

    // Visibility: the checkbox only shows when the typed author
    // doesn't match any existing Authors-DB entry (trim + case-
    // insensitive). Hiding the checkbox when the name is already
    // in the DB avoids the confusing "Add X to author list?" UX
    // for a name that's already there.
    const authorAlreadyInDb = useMemo(() => {
        const typed = author.trim().toLowerCase()
        if (!typed) return true // hide the checkbox for empty input
        return globalAuthors.some(
            (a) => a.name.trim().toLowerCase() === typed,
        )
    }, [author, globalAuthors])
    const showAddToAuthorsCheckbox = !authorAlreadyInDb

    const isSingleArticle = selectedArticles.length === 1
    const singleArticle = isSingleArticle ? selectedArticles[0] : null

    // Auto-populate metadata defaults on entering Step 1 ---------------
    // We compute defaults derived from the current selection but never
    // overwrite user input. Single-article subtitle / cover_image are
    // initialised here per Q13/Q15. ``sharedAuthor`` is initialised
    // here per Bug 8 Phase 2 D6 — the same "single-value default"
    // shape applied to author, with the multi-article case
    // generalised (any number of articles sharing the same author
    // triggers pre-fill, not just N=1).
    const subtitleDefault = singleArticle?.subtitle ?? ""
    const coverImageDefault = singleArticle?.featured_image_url ?? ""
    const seriesDefault = sharedSeries ?? ""
    const authorDefault = sharedAuthor ?? ""

    // dnd-kit sensors --------------------------------------------------

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    )

    // Handlers ---------------------------------------------------------

    const handleSortChange = (next: BookFromArticlesSortStrategy) => {
        setSortStrategy(next)
        if (next !== "manual") {
            // Snapshot the new order so a later flip back to manual
            // starts from "what the user just saw" rather than from
            // the original order.
            setManualOrder(
                sortArticlesPreview(selectedArticles, next, manualOrder).map(
                    (a) => a.id,
                ),
            )
        }
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event
        if (!over || active.id === over.id) return
        const oldIndex = manualOrder.indexOf(String(active.id))
        const newIndex = manualOrder.indexOf(String(over.id))
        if (oldIndex < 0 || newIndex < 0) return
        setManualOrder((prev) => arrayMove(prev, oldIndex, newIndex))
        setSortStrategy("manual")
    }

    const handleSelectByTag = (tag: string) => {
        const ids = new Set(
            selectedArticles.filter((a) => a.tags.includes(tag)).map((a) => a.id),
        )
        setSelectedIds(ids)
        setManualOrder((prev) => prev.filter((id) => ids.has(id)))
    }

    const handleResetSelection = () => {
        setSelectedIds(new Set(articles.map((a) => a.id)))
        setManualOrder(articles.map((a) => a.id))
    }

    const handleRemoveOne = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
        })
        setManualOrder((prev) => prev.filter((x) => x !== id))
    }

    const stepAdvanceable = (currentStep: number): boolean => {
        if (currentStep === 0) return selectedIds.size >= 1
        if (currentStep === 1) return title.trim().length > 0 && author.trim().length > 0
        return true
    }

    const buildPayload = (): BookFromArticlesCreate => {
        const orderedIds = orderedArticles.map((a) => a.id)
        const effectiveSubtitle = subtitle || subtitleDefault
        const effectiveCover = coverImage || coverImageDefault
        const effectiveSeries = series || seriesDefault

        const payload: BookFromArticlesCreate = {
            article_ids: orderedIds,
            title: title.trim(),
            subtitle: effectiveSubtitle ? effectiveSubtitle : null,
            author: author.trim() || null,
            language,
            series: effectiveSeries ? effectiveSeries : null,
            series_index: seriesIndex ? Number(seriesIndex) : null,
            cover_image: effectiveCover ? effectiveCover : null,
            sort_strategy: sortStrategy,
            manual_order: sortStrategy === "manual" ? orderedIds : null,
            chapter_settings: {
                use_article_title_as_chapter_title: useArticleTitleAsChapterTitle,
            },
        }

        if (
            includeTitlePage ||
            includeDedication ||
            includeIntroduction
        ) {
            payload.front_matter = {
                include_title_page: includeTitlePage,
                include_dedication: includeDedication,
                dedication_text: dedicationText || null,
                include_introduction: includeIntroduction,
                introduction_text: introductionText || null,
            }
        }
        if (includeAcknowledgments || includeAuthorBio) {
            payload.back_matter = {
                include_acknowledgments: includeAcknowledgments,
                acknowledgments_text: acknowledgmentsText || null,
                include_author_bio: includeAuthorBio,
                author_bio_text: authorBioText || null,
            }
        }
        return payload
    }

    const handleSubmit = async () => {
        setValidationError(null)
        setSubmitting(true)
        // Bug 8 Phase 2: optionally create the typed author in the
        // global Authors-Database BEFORE the book POST. The Author
        // create is non-blocking: a failed POST surfaces an error
        // toast but the book create still proceeds with the free-
        // text author. Slug is server-generated + collision-
        // suffixed; we only need to send the name.
        if (showAddToAuthorsCheckbox && addToAuthorsDb && author.trim()) {
            try {
                const created = await api.authors.create({
                    name: author.trim(),
                })
                // Update local mirror so the dropdown reflects the
                // new entry without a re-fetch round-trip + so
                // subsequent ``authorAlreadyInDb`` reads see it.
                setGlobalAuthors((prev) => [...prev, created])
            } catch (err) {
                const detail =
                    err instanceof ApiError
                        ? err.detail
                        : t(
                              "ui.convert_to_book.add_to_authors_error",
                              "Konnte Autor nicht zur Datenbank hinzufügen.",
                          )
                notify.error(detail, err)
                // Continue with the book create — the author was
                // a "nice to have" addition; the book is the
                // user's primary objective.
            }
        }
        try {
            const book = await api.books.fromArticles(buildPayload())
            // WARN-I1 fix: toast-with-CTA per Phase 2 spec letter.
            // The wizard closes immediately and clears the bulk
            // selection (via ``onConverted`` page-level callback);
            // navigation to the new book lives on the toast's
            // "View book" action so the user can choose to follow
            // the link or dismiss the toast and stay on the
            // Articles dashboard. Replaces the prior auto-navigate
            // pattern that bypassed the documented UX.
            notify.successAction(
                t("ui.convert_to_book.success", "Buch erstellt."),
                t("ui.convert_to_book.success_view_book", "Buch öffnen"),
                () => onViewBook(book),
                "convert-to-book-success-view-book",
            )
            onConverted(book)
            onClose()
        } catch (err) {
            if (err instanceof ApiError && err.status === 422 && err.detailBody) {
                setValidationError(
                    err.detailBody as unknown as BookFromArticlesValidationError,
                )
                setStep(0)
            } else if (err instanceof ApiError) {
                notify.error(err.detail, err)
            } else {
                notify.error(
                    t("ui.convert_to_book.error_generic", "Konvertierung fehlgeschlagen"),
                    err,
                )
            }
        } finally {
            setSubmitting(false)
        }
    }

    // Renders ---------------------------------------------------------
    //
    // The Dialog chrome + step-dot indicator + back/skip/next nav
    // + close-button live in <WizardShell> + <WizardNav> per
    // WIZARD-SHELL-COMPONENT-EXTRACT-01 (2026-05-24). The 6 dots
    // carry no per-dot aria-label / title (Convert's existing
    // shape — the indicator container itself has no aria-label
    // either after migration; the dot-row is decorative since
    // the user navigates with explicit Back / Next buttons).

    // Step-list for WizardShell. Labels are intentionally omitted
    // to preserve the existing no-per-dot-label UX (vs KDP which
    // does label each dot). Promoting to labeled dots is filed as
    // CONVERT-WIZARD-STEP-LABELS-A11Y-01 if user demand surfaces.
    const wizardSteps: ReadonlyArray<{key: string}> = [
        {key: "selection"},
        {key: "metadata"},
        {key: "front-matter"},
        {key: "back-matter"},
        {key: "chapter-settings"},
        {key: "review"},
    ]

    const renderValidationBanner = () => {
        if (!validationError) return null
        const trashed = validationError.trashed ?? []
        const notFound = validationError.not_found_ids ?? []
        return (
            <div
                style={styles.errorBanner}
                data-testid="convert-to-book-wizard-validation-banner"
                role="alert"
            >
                <strong>
                    {t(
                        "ui.convert_to_book.validation_title",
                        "Auswahl enthält ungültige Einträge",
                    )}
                </strong>
                {trashed.length > 0 && (
                    <div>
                        {t(
                            "ui.convert_to_book.validation_trashed",
                            "Im Papierkorb",
                        )}
                        : {trashed.map((it) => it.title).join(", ")}
                    </div>
                )}
                {notFound.length > 0 && (
                    <div>
                        {t(
                            "ui.convert_to_book.validation_not_found",
                            "Nicht gefunden",
                        )}
                        : {notFound.length}
                    </div>
                )}
            </div>
        )
    }

    // Step 0 — Selection ----------------------------------------------

    const renderStepSelection = () => (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.selection_hint",
                    "Reihenfolge und Auswahl prüfen. Sortierung oder Drag-and-Drop ändern die Reihenfolge.",
                )}
            </p>
            <div style={styles.row}>
                <label style={styles.label}>
                    {t("ui.convert_to_book.sort_label", "Sortierung")}
                </label>
                <RadixSelect
                    className="is-block"
                    value={sortStrategy}
                    onValueChange={(next) =>
                        handleSortChange(next as BookFromArticlesSortStrategy)
                    }
                    testId="convert-to-book-wizard-selection-sort-strategy"
                    ariaLabel={t("ui.convert_to_book.sort_label", "Sortierung")}
                    options={[
                        {value: "date_asc", label: t("ui.convert_to_book.sort_date_asc", "Datum (alt → neu)")},
                        {value: "date_desc", label: t("ui.convert_to_book.sort_date_desc", "Datum (neu → alt)")},
                        {value: "title_asc", label: t("ui.convert_to_book.sort_title_asc", "Titel A → Z")},
                        {value: "title_desc", label: t("ui.convert_to_book.sort_title_desc", "Titel Z → A")},
                        {value: "manual", label: t("ui.convert_to_book.sort_manual", "Manuell (per Drag)")},
                    ]}
                />
                <span style={styles.countBadge}>
                    {t("ui.convert_to_book.count", "{count} ausgewählt").replace(
                        "{count}",
                        String(selectedIds.size),
                    )}
                </span>
            </div>

            {tagSummary.length > 0 && (
                <div style={styles.tagBar} data-testid="convert-to-book-wizard-selection-tag-bar">
                    <span style={styles.label}>
                        {t("ui.convert_to_book.tag_helper", "Nur Tag:")}
                    </span>
                    {tagSummary.map(({tag, count}) => (
                        <button
                            key={tag}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSelectByTag(tag)}
                            data-testid={`convert-to-book-wizard-selection-tag-${tag}`}
                        >
                            {tag} ({count})
                        </button>
                    ))}
                    {selectedIds.size < articles.length && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={handleResetSelection}
                            data-testid="convert-to-book-wizard-selection-reset"
                        >
                            {t("ui.convert_to_book.reset_selection", "Zurücksetzen")}
                        </button>
                    )}
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={orderedArticles.map((a) => a.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div
                        style={styles.list}
                        data-testid="convert-to-book-wizard-selection-list"
                    >
                        {orderedArticles.map((article) => (
                            <SortableArticleRow
                                key={article.id}
                                article={article}
                                onRemove={() => handleRemoveOne(article.id)}
                                t={t}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    )

    // Step 1 — Metadata ------------------------------------------------

    const renderStepMetadata = () => (
        <div style={styles.stepContent}>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_title", "Buchtitel")} *
                </label>
                <input
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-title"
                />
                {title.trim() === "" && (
                    <small style={styles.fieldError}>
                        {t(
                            "ui.convert_to_book.metadata_title_required",
                            "Titel ist erforderlich",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_subtitle", "Untertitel")}
                </label>
                <input
                    className="input"
                    value={subtitle}
                    placeholder={subtitleDefault}
                    onChange={(e) => setSubtitle(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-subtitle"
                />
                {isSingleArticle && subtitleDefault && (
                    <small style={styles.fieldHint}>
                        {t(
                            "ui.convert_to_book.metadata_subtitle_prefill",
                            "Wird aus Artikel-Untertitel übernommen, wenn leer.",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label
                    className="label"
                    htmlFor="convert-to-book-wizard-metadata-author"
                >
                    {t("ui.convert_to_book.metadata_author", "Autor")} *
                </label>
                {/* RECURRING-COMPONENT-AUDIT-01 #4 extraction:
                    input + datalist + Add-to-Authors-DB checkbox
                    live in AuthorSelectInput. Suggestions still
                    composed at this caller via
                    computeAuthorSuggestions(selectedArticles,
                    globalAuthors). Empty list still renders so a
                    browser that respects ``list`` attaches an empty
                    dropdown rather than ignoring the attribute. The
                    inputTestId override preserves the non-standard
                    "convert-to-book-wizard-metadata-author" testid
                    that 12+ E2E + Vitest references already pin
                    (per the "Testid namespace pinning prevents
                    silent E2E skips" LL). The required-error
                    message follows AuthorSelectInput; checkbox +
                    error states are mutually exclusive (the
                    checkbox only shows when value is typed AND
                    not in DB; the error only shows when value is
                    empty) so the visual order is preserved. */}
                <AuthorSelectInput
                    value={author}
                    onChange={setAuthor}
                    suggestions={authorSuggestions}
                    showAddToAuthorsCheckbox={showAddToAuthorsCheckbox}
                    addToAuthorsDb={addToAuthorsDb}
                    onAddToAuthorsDbChange={setAddToAuthorsDb}
                    testidPrefix="convert-to-book-wizard"
                    inputTestId="convert-to-book-wizard-metadata-author"
                    inputId="convert-to-book-wizard-metadata-author"
                    datalistId="convert-to-book-wizard-author-suggestions"
                    addToAuthorsLabel={t(
                        "ui.convert_to_book.metadata_add_to_authors_db",
                        "„{name}\" zur Autoren-Datenbank hinzufügen",
                    )}
                />
                {author.trim() === "" && (
                    <small style={styles.fieldError}>
                        {t(
                            "ui.convert_to_book.metadata_author_required",
                            "Autor ist erforderlich",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_language", "Sprache")}
                </label>
                <input
                    className="input"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="en"
                    data-testid="convert-to-book-wizard-metadata-language"
                />
            </div>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_series", "Serie")}
                </label>
                <input
                    className="input"
                    value={series}
                    placeholder={seriesDefault}
                    onChange={(e) => setSeries(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-series"
                />
                {seriesDefault && (
                    <small style={styles.fieldHint}>
                        {t(
                            "ui.convert_to_book.metadata_series_prefill",
                            "Alle ausgewählten Artikel teilen diese Serie.",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label className="label">
                    {t(
                        "ui.convert_to_book.metadata_series_index",
                        "Serien-Index",
                    )}
                </label>
                <input
                    className="input"
                    type="number"
                    value={seriesIndex}
                    onChange={(e) => setSeriesIndex(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-series-index"
                />
            </div>
            {isSingleArticle && coverImageDefault && (
                <div
                    style={styles.infoBox}
                    data-testid="convert-to-book-wizard-metadata-cover-info"
                >
                    {t(
                        "ui.convert_to_book.cover_inherit_note",
                        "Cover wird aus dem Artikel übernommen. Im Buch-Editor nach der Konvertierung anpassbar.",
                    )}
                    <input
                        className="input"
                        value={coverImage}
                        placeholder={coverImageDefault}
                        onChange={(e) => setCoverImage(e.target.value)}
                        data-testid="convert-to-book-wizard-metadata-cover-image"
                        style={{marginTop: 4}}
                    />
                </div>
            )}
        </div>
    )

    // Step 2 — Front-matter --------------------------------------------

    const renderStepFrontMatter = () => (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.front_matter_hint",
                    "Optionale Vorspann-Kapitel — überspringbar.",
                )}
            </p>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeTitlePage}
                    onChange={(e) => setIncludeTitlePage(e.target.checked)}
                    data-testid="convert-to-book-wizard-front-matter-title-page-toggle"
                />
                <span>
                    {t(
                        "ui.convert_to_book.front_matter_title_page",
                        "Titelseite (leer; im Buch-Editor anpassen)",
                    )}
                </span>
            </label>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeDedication}
                    onChange={(e) => setIncludeDedication(e.target.checked)}
                    data-testid="convert-to-book-wizard-front-matter-dedication-toggle"
                />
                <span>{t("ui.convert_to_book.front_matter_dedication", "Widmung")}</span>
            </label>
            {includeDedication && (
                <textarea
                    className="input"
                    rows={3}
                    value={dedicationText}
                    onChange={(e) => setDedicationText(e.target.value)}
                    placeholder={t(
                        "ui.convert_to_book.front_matter_dedication_placeholder",
                        "Für …",
                    )}
                    data-testid="convert-to-book-wizard-front-matter-dedication-text"
                />
            )}
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeIntroduction}
                    onChange={(e) => setIncludeIntroduction(e.target.checked)}
                    data-testid="convert-to-book-wizard-front-matter-introduction-toggle"
                />
                <span>
                    {t("ui.convert_to_book.front_matter_introduction", "Einleitung")}
                </span>
            </label>
            {includeIntroduction && (
                <textarea
                    className="input"
                    rows={4}
                    value={introductionText}
                    onChange={(e) => setIntroductionText(e.target.value)}
                    data-testid="convert-to-book-wizard-front-matter-introduction-text"
                />
            )}
        </div>
    )

    // Step 3 — Back-matter ---------------------------------------------

    const renderStepBackMatter = () => (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.back_matter_hint",
                    "Optionale Nachspann-Kapitel — überspringbar.",
                )}
            </p>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeAcknowledgments}
                    onChange={(e) => setIncludeAcknowledgments(e.target.checked)}
                    data-testid="convert-to-book-wizard-back-matter-acknowledgments-toggle"
                />
                <span>
                    {t(
                        "ui.convert_to_book.back_matter_acknowledgments",
                        "Danksagung",
                    )}
                </span>
            </label>
            {includeAcknowledgments && (
                <textarea
                    className="input"
                    rows={3}
                    value={acknowledgmentsText}
                    onChange={(e) => setAcknowledgmentsText(e.target.value)}
                    data-testid="convert-to-book-wizard-back-matter-acknowledgments-text"
                />
            )}
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeAuthorBio}
                    onChange={(e) => setIncludeAuthorBio(e.target.checked)}
                    data-testid="convert-to-book-wizard-back-matter-author-bio-toggle"
                />
                <span>
                    {t(
                        "ui.convert_to_book.back_matter_author_bio",
                        "Über den Autor",
                    )}
                </span>
            </label>
            {includeAuthorBio && (
                <textarea
                    className="input"
                    rows={3}
                    value={authorBioText}
                    onChange={(e) => setAuthorBioText(e.target.value)}
                    data-testid="convert-to-book-wizard-back-matter-author-bio-text"
                />
            )}
        </div>
    )

    // Step 4 — Chapter settings ----------------------------------------

    const renderStepChapterSettings = () => (
        <div style={styles.stepContent}>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={useArticleTitleAsChapterTitle}
                    onChange={(e) =>
                        setUseArticleTitleAsChapterTitle(e.target.checked)
                    }
                    data-testid="convert-to-book-wizard-chapter-settings-use-article-title"
                />
                <span>
                    {t(
                        "ui.convert_to_book.chapter_settings_use_article_title",
                        "Artikel-Titel als Kapitel-Titel verwenden",
                    )}
                </span>
            </label>
            <small style={styles.fieldHint}>
                {t(
                    "ui.convert_to_book.chapter_settings_use_article_title_hint",
                    "Wenn deaktiviert, werden Kapitel als 'Chapter 1', 'Chapter 2' usw. benannt.",
                )}
            </small>
        </div>
    )

    // Step 5 — Review --------------------------------------------------

    const renderStepReview = () => {
        const frontMatterCount =
            (includeTitlePage ? 1 : 0) +
            (includeDedication ? 1 : 0) +
            (includeIntroduction ? 1 : 0)
        const backMatterCount =
            (includeAcknowledgments ? 1 : 0) + (includeAuthorBio ? 1 : 0)
        const total = frontMatterCount + selectedIds.size + backMatterCount
        return (
            <div style={styles.stepContent}>
                <p style={styles.hint}>
                    {t(
                        "ui.convert_to_book.review_hint",
                        "Bitte prüfen. Originale Artikel bleiben unverändert im Artikel-Dashboard.",
                    )}
                </p>
                <dl style={styles.reviewList}>
                    <dt>{t("ui.convert_to_book.review_title", "Titel")}</dt>
                    <dd data-testid="convert-to-book-wizard-review-title-value">
                        {title || (
                            <em style={{color: "var(--danger)"}}>
                                {t(
                                    "ui.convert_to_book.review_title_missing",
                                    "(noch nicht gesetzt)",
                                )}
                            </em>
                        )}
                    </dd>
                    <dt>{t("ui.convert_to_book.review_author", "Autor")}</dt>
                    <dd>{author || "—"}</dd>
                    <dt>
                        {t(
                            "ui.convert_to_book.review_chapter_total",
                            "Kapitel insgesamt",
                        )}
                    </dt>
                    <dd data-testid="convert-to-book-wizard-review-chapter-count">
                        {total}{" "}
                        <small style={{color: "var(--text-muted)"}}>
                            ({frontMatterCount} +{" "}
                            {selectedIds.size} +{" "}
                            {backMatterCount})
                        </small>
                    </dd>
                    <dt>
                        {t("ui.convert_to_book.review_sort", "Sortierung")}
                    </dt>
                    <dd>{sortStrategy}</dd>
                </dl>
            </div>
        )
    }

    // CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 Bug #2: the
    // "Buch erstellen" action button used to live INSIDE
    // renderStepReview's stepContent body, while every other step's
    // Next button sat in the WizardNav footer slot. User
    // muscle-memory targeting the footer missed on step 5. The
    // button now lives in WizardNav's onFinish slot below
    // (testid: convert-to-book-wizard-step-5-finish), matching the
    // footer-positioning of all earlier steps' Next button.
    const finishDisabled =
        submitting
        || title.trim() === ""
        || author.trim() === ""
        || selectedIds.size === 0

    const renderCurrentStep = () => {
        switch (step) {
            case 0:
                return renderStepSelection()
            case 1:
                return renderStepMetadata()
            case 2:
                return renderStepFrontMatter()
            case 3:
                return renderStepBackMatter()
            case 4:
                return renderStepChapterSettings()
            case 5:
                return renderStepReview()
            default:
                return null
        }
    }

    const skippableSteps = new Set([2, 3])

    // Submitting guards onClose so the user can't dismiss the
    // dialog mid-request (matches the pre-migration Dialog.Root
    // onOpenChange + disabled-button pattern).
    const guardedClose = () => {
        if (!submitting) onClose()
    }

    return (
        <WizardShell
            open={open}
            onClose={guardedClose}
            namespace="convert-to-book-wizard"
            title={t(
                "ui.convert_to_book.dialog_title",
                "Artikel als Buch zusammenfassen",
            )}
            titleIcon={<BookOpen size={18} />}
            steps={wizardSteps}
            currentStep={step}
            stepColorPolicy="current-vs-completed"
            banner={renderValidationBanner()}
            closeAriaLabel={t("ui.common.close", "Schließen")}
            closeDisabled={submitting}
            bodyRef={stepContentRef}
            nav={
                <WizardNav
                    step={step}
                    onBack={
                        step > 0 ? () => setStep(step - 1) : undefined
                    }
                    backDisabled={submitting}
                    onSkip={
                        skippableSteps.has(step)
                            ? () => setStep(step + 1)
                            : undefined
                    }
                    skipDisabled={submitting}
                    onAdvance={
                        step < TOTAL_STEPS - 1
                            ? () => setStep(step + 1)
                            : undefined
                    }
                    advanceDisabled={!stepAdvanceable(step) || submitting}
                    onFinish={() => void handleSubmit()}
                    finishDisabled={finishDisabled}
                    isLastStep={step === TOTAL_STEPS - 1}
                    finishLabel={
                        submitting
                            ? t(
                                  "ui.convert_to_book.review_submitting",
                                  "Wird konvertiert …",
                              )
                            : t(
                                  "ui.convert_to_book.review_confirm",
                                  "Buch erstellen",
                              )
                    }
                    finishIcon={submitting ? undefined : <Check size={14} />}
                />
            }
        >
            {renderCurrentStep()}
        </WizardShell>
    )
}

// --- styles --------------------------------------------------------------
// Dialog chrome (overlay, content, title), step indicator (steps,
// stepDot), back/skip/next nav and close-button styles live in
// WizardShell. Only step-body-specific styles remain here.

const styles: Record<string, React.CSSProperties> = {
    // CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 Bug #1: the dialog
    // used to grow / shrink with each step's content amount. The
    // shell already caps the WHOLE dialog at maxHeight 90vh; we
    // constrain the step body itself so the dialog dimensions stay
    // visually stable across all 6 steps. minHeight covers the
    // smallest-natural step (metadata, front-matter, etc.); maxHeight
    // + overflowY scrolls inside the largest-natural step (selection
    // list, review). Picked from a per-step audit; conservative
    // enough that no step needs more than mild internal scroll.
    stepContent: {
        minHeight: 380,
        maxHeight: 520,
        overflowY: "auto",
    },
    hint: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
    },
    row: {
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginBottom: 12,
        flexWrap: "wrap",
    },
    label: {
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    select: {
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        fontSize: "0.875rem",
    },
    countBadge: {
        marginLeft: "auto",
        padding: "4px 10px",
        background: "var(--surface-2, var(--bg-secondary))",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    tagBar: {
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 12,
    },
    list: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        maxHeight: 320,
        overflowY: "auto",
    },
    toggleRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
    },
    fieldHint: {
        color: "var(--text-muted)",
        fontSize: "0.75rem",
        marginTop: 2,
        display: "block",
    },
    fieldError: {
        color: "var(--danger)",
        fontSize: "0.75rem",
        marginTop: 2,
        display: "block",
    },
    infoBox: {
        background: "var(--surface-2, var(--bg-secondary))",
        padding: 10,
        borderRadius: "var(--radius-sm, 4px)",
        marginTop: 8,
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    errorBanner: {
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
        padding: 12,
        borderRadius: "var(--radius-sm, 4px)",
        marginBottom: 16,
        fontSize: "0.8125rem",
        display: "grid",
        gap: 4,
    },
    reviewList: {
        display: "grid",
        gridTemplateColumns: "max-content 1fr",
        gap: "6px 16px",
        marginBottom: 16,
        fontSize: "0.875rem",
    },
}

const rowStyles: Record<string, React.CSSProperties> = {
    row: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
    },
    dragHandle: {
        display: "flex",
        cursor: "grab",
        color: "var(--text-muted)",
    },
    title: {
        flex: 1,
        fontSize: "0.875rem",
        color: "var(--text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    removeBtn: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        padding: 4,
    },
}
