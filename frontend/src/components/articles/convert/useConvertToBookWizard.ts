/**
 * State, derivation, and handler cluster for ConvertToBookWizard.
 *
 * Extracted from ConvertToBookWizard.tsx to keep the component file
 * under the cohesion threshold. The hook owns the wizard's working
 * selection, the six steps' form state, submit + validation, and the
 * Authors-Database integration; the component consumes the returned
 * bag and renders the per-step JSX. Logic is byte-identical to the
 * pre-extraction inline version (including the documented
 * eslint-disable on the shared-author pre-fill effect).
 */

import {useEffect, useMemo, useRef, useState} from "react"
import {
    arrayMove,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import {
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core"

import {
    Article,
    ApiError,
    Author,
    BookDetail,
    BookFromArticlesCreate,
    BookFromArticlesSortStrategy,
    BookFromArticlesValidationError,
} from "../../../api/client"
import {getStorage} from "../../../storage"
import {useI18n} from "../../../hooks/useI18n"
import {notify} from "../../../utils/notify"
import {computeAuthorSuggestions} from "../../../utils/computeAuthorSuggestions"
import {
    useAuthorProfile,
    profileDisplayNames,
} from "../../../hooks/useAuthorProfile"
import {sortArticlesPreview, topTagsWithCounts} from "./helpers"

const TOTAL_STEPS = 6

interface UseConvertToBookWizardArgs {
    open: boolean
    articles: Article[]
    onClose: () => void
    onConverted: (book: BookDetail) => void
    onViewBook: (book: BookDetail) => void
}

export function useConvertToBookWizard({
    open,
    articles,
    onClose,
    onConverted,
    onViewBook,
}: UseConvertToBookWizardArgs) {
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
        getStorage().authors
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

    // Profile identities (real name + pen names) so the Step-2 author
    // field offers the same pseudonym dropdown as the other author
    // surfaces (CreateBookForm / BookMetadataEditor / CreateArticlePage).
    const authorProfile = useAuthorProfile()
    // Union of profile pen names + article-authors + global Authors-DB
    // names, deduped (profile names first, then article authors). Powers
    // both the pseudonym <select> (profileChoices) and the datalist.
    const authorSuggestions = useMemo(() => {
        const seen = new Set<string>()
        const out: string[] = []
        for (const c of [
            ...profileDisplayNames(authorProfile),
            ...computeAuthorSuggestions(selectedArticles, globalAuthors),
        ]) {
            const trimmed = c.trim()
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed)
                out.push(trimmed)
            }
        }
        return out
    }, [authorProfile, selectedArticles, globalAuthors])

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
                const created = await getStorage().authors.create({
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
            const book = await getStorage().books.fromArticles(buildPayload())
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

    return {
        t,
        step,
        setStep,
        selectedIds,
        sortStrategy,
        title,
        setTitle,
        subtitle,
        setSubtitle,
        author,
        setAuthor,
        language,
        setLanguage,
        series,
        setSeries,
        seriesIndex,
        setSeriesIndex,
        coverImage,
        setCoverImage,
        includeTitlePage,
        setIncludeTitlePage,
        includeDedication,
        setIncludeDedication,
        dedicationText,
        setDedicationText,
        includeIntroduction,
        setIncludeIntroduction,
        introductionText,
        setIntroductionText,
        includeAcknowledgments,
        setIncludeAcknowledgments,
        acknowledgmentsText,
        setAcknowledgmentsText,
        includeAuthorBio,
        setIncludeAuthorBio,
        authorBioText,
        setAuthorBioText,
        useArticleTitleAsChapterTitle,
        setUseArticleTitleAsChapterTitle,
        submitting,
        validationError,
        stepContentRef,
        orderedArticles,
        tagSummary,
        authorProfile,
        authorSuggestions,
        addToAuthorsDb,
        setAddToAuthorsDb,
        showAddToAuthorsCheckbox,
        isSingleArticle,
        subtitleDefault,
        coverImageDefault,
        seriesDefault,
        authorDefault,
        sensors,
        handleSortChange,
        handleDragEnd,
        handleSelectByTag,
        handleResetSelection,
        handleRemoveOne,
        stepAdvanceable,
        handleSubmit,
        TOTAL_STEPS,
        articles,
    }
}
