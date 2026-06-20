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
 *
 * State, derivation, and handlers live in
 * ``convert/useConvertToBookWizard``; the sortable selection row in
 * ``convert/SortableArticleRow``; pure preview helpers in
 * ``convert/helpers``; step-body styles in ``convert/styles``.
 */

import {BookOpen, Check} from "lucide-react"
import {
    DndContext,
    closestCenter,
} from "@dnd-kit/core"
import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"

import {
    Article,
    BookDetail,
    BookFromArticlesSortStrategy,
} from "../../api/client"
import {RadixSelect} from "../shared/RadixSelect"
import AuthorSelectInput from "../shared/AuthorSelectInput"
import WizardShell, {WizardNav} from "../wizards/WizardShell"
import {profileDisplayNames} from "../../hooks/useAuthorProfile"
import {SortableArticleRow} from "./convert/SortableArticleRow"
import {styles} from "./convert/styles"
import {useConvertToBookWizard} from "./convert/useConvertToBookWizard"

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

export default function ConvertToBookWizard({
    open,
    articles,
    onClose,
    onConverted,
    onViewBook,
}: Props) {
    const wizard = useConvertToBookWizard({
        open,
        articles,
        onClose,
        onConverted,
        onViewBook,
    })
    const {
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
        sensors,
        handleSortChange,
        handleDragEnd,
        handleSelectByTag,
        handleResetSelection,
        handleRemoveOne,
        stepAdvanceable,
        handleSubmit,
        TOTAL_STEPS,
    } = wizard

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
                    profileChoices={profileDisplayNames(authorProfile)}
                    customOptionLabel={t(
                        "ui.author_select.custom_option",
                        "Anderer Name …",
                    )}
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
