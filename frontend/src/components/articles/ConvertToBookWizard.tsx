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
 * ``convert/useConvertToBookWizard``; the step bodies in
 * ``convert/WizardSteps``; the sortable selection row in
 * ``convert/SortableArticleRow``; pure preview helpers in
 * ``convert/helpers``; step-body styles in ``convert/styles`` (#207
 * god-file split).
 */

import {BookOpen, Check} from "lucide-react"

import {Article, BookDetail} from "../../api/client"
import WizardShell, {WizardNav} from "../wizards/WizardShell"
import {styles} from "./convert/styles"
import {useConvertToBookWizard} from "./convert/useConvertToBookWizard"
import {WizardSteps} from "./convert/WizardSteps"

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
        title,
        author,
        submitting,
        validationError,
        stepContentRef,
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
            <WizardSteps wizard={wizard} />
        </WizardShell>
    )
}
