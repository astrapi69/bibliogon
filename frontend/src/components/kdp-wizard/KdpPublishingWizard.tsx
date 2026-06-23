/**
 * KDP Publishing Wizard (Phase 2 — 5 visible steps).
 *
 * Walks the user from a configured Book through to a KDP-ready
 * package ZIP. Five visible steps (C9):
 *   0 — MetadataChecklist    (validate KDP-required metadata)
 *   1 — CoverValidation      (validate cover image)
 *   2 — PricingStep          (royalty plan + per-region prices)
 *   3 — ArcStep              (ARC reviewer tracking)
 *   4 — ExportPackage        (download KDP-package ZIP)
 *
 * Pattern: XState v5 via ``useMachine(kdpWizardMachine)``. Step
 * navigation, guards, and reset semantics live in the machine
 * (``frontend/src/components/kdp-wizard/machines/``). React layer
 * is a thin renderer that maps ``snapshot.value`` to the per-step
 * component + wires callback props to machine events.
 *
 * Per A11: ExportPackage receives ``onGenerate`` from the parent;
 * the component stays machine-agnostic. The parent dispatches
 * GENERATE on receipt; the machine moves to ``exporting``.
 *
 * Mount: BookMetadataEditor header. Self-contained.
 */

import {useEffect, useRef, useState} from "react"
import {useMachine} from "@xstate/react"
import {AlertTriangle, Check, X, Rocket} from "lucide-react"

import {BookDetail, api} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import WizardShell, {WizardNav} from "../wizards/WizardShell"
import ArcStep from "./ArcStep"
import CoverValidation from "./CoverValidation"
import ExportPackage from "./ExportPackage"
import FormatStep from "./FormatStep"
import KdpGuideStep from "./KdpGuideStep"
import {kdpWizardMachine} from "./machines/kdpWizardMachine"
import MetadataChecklist from "./MetadataChecklist"
import PricingStep from "./PricingStep"

interface Props {
    open: boolean
    book: BookDetail
    onClose: () => void
}

const TOTAL_STEPS = 7

const STEPS: ReadonlyArray<{key: string; labelKey: string; fallback: string}> = [
    {
        key: "metadata",
        labelKey: "ui.kdp_publishing_wizard.step_metadata",
        fallback: "Metadaten",
    },
    {
        key: "cover",
        labelKey: "ui.kdp_publishing_wizard.step_cover",
        fallback: "Cover",
    },
    {
        key: "format",
        labelKey: "ui.kdp_publishing_wizard.step_format",
        fallback: "Format",
    },
    {
        key: "pricing",
        labelKey: "ui.kdp_publishing_wizard.step_pricing",
        fallback: "Preise",
    },
    {
        key: "arc",
        labelKey: "ui.kdp_publishing_wizard.step_arc",
        fallback: "ARC",
    },
    {
        key: "export",
        labelKey: "ui.kdp_publishing_wizard.step_export",
        fallback: "Paket",
    },
    {
        key: "guide",
        labelKey: "ui.kdp_publishing_wizard.step_guide",
        fallback: "Anleitung",
    },
] as const

/** Map machine ``state.value`` to the user-visible step index used
 *  by the dot indicator + testid namespace. */
function stepIndexFromState(stateValue: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
    switch (stateValue) {
        case "metadata":
        case "metadataError":
            return 0
        case "cover":
            return 1
        case "format":
            return 2
        case "pricing":
            return 3
        case "arc":
            return 4
        case "export":
        case "exporting":
        case "exportSuccess":
        case "exportError":
            return 5
        case "guide":
            return 6
        default:
            return 0
    }
}

export default function KdpPublishingWizard({open, book, onClose}: Props) {
    const {t} = useI18n()
    const [snapshot, send] = useMachine(kdpWizardMachine)
    // Track the most recently auto-saved pricing as a JSON string
    // so the auto-save effect can short-circuit on no-op transitions
    // + skip the initial-load PATCH.
    const lastSavedPricingRef = useRef<string>("")
    // C11 conflict-detection banner state. Compared as ISO 8601
    // strings (lexicographically equivalent to chronological).
    const [bookUpdatedAt, setBookUpdatedAt] = useState<string | null>(null)
    const [stateUpdatedAt, setStateUpdatedAt] = useState<string | null>(
        null,
    )
    const [conflictDismissed, setConflictDismissed] = useState(false)

    // C10 mount-time hydration. Fetches the persisted publishing-
    // state row + dispatches STATE_LOADED if one exists. Failure
    // is non-blocking (fail-open) — the wizard still starts with
    // default context.
    useEffect(() => {
        if (!open) return
        let cancelled = false
        api.kdp
            .getPublishingState(book.id)
            .then((response) => {
                if (cancelled) return
                setBookUpdatedAt(response.book_updated_at)
                if (response.state) {
                    setStateUpdatedAt(response.state.updated_at)
                    const pricing = {
                        royalty_plan: response.state.royalty_plan,
                        kdp_select_enrolled:
                            response.state.kdp_select_enrolled,
                        expanded_distribution:
                            response.state.expanded_distribution,
                        prices: response.state.prices,
                    }
                    send({type: "STATE_LOADED", pricing})
                    lastSavedPricingRef.current = JSON.stringify(pricing)
                }
            })
            .catch(() => {
                // Fail-open per Track 5 A28. The wizard's local
                // context stays authoritative for the session.
            })
        return () => {
            cancelled = true
        }
        // book.id refetches on book switch; ``send`` is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, book.id])

    // C10 auto-save. PATCHes the publishing-state row whenever
    // ``context.pricing`` content changes from the last saved
    // snapshot. Skips the initial default (royalty_plan === null).
    // Failure is non-blocking: log + continue, retry on next
    // change.
    useEffect(() => {
        if (!open) return
        const pricing = snapshot.context.pricing
        // Skip when the user hasn't picked a royalty plan yet
        // (initial default state; nothing meaningful to persist).
        if (pricing.royalty_plan === null) return
        const pricingJson = JSON.stringify(pricing)
        if (pricingJson === lastSavedPricingRef.current) return
        lastSavedPricingRef.current = pricingJson
        api.kdp
            .upsertPublishingState(book.id, {
                royalty_plan: pricing.royalty_plan,
                kdp_select_enrolled: pricing.kdp_select_enrolled,
                expanded_distribution: pricing.expanded_distribution,
                prices: pricing.prices,
                launch_checklist_state: {
                    wizard_step: String(snapshot.value),
                },
            })
            .catch((err: unknown) => {
                // Fail-open per A28. The local context stays
                // authoritative; the next change retries.
                // eslint-disable-next-line no-console
                console.warn("KDP wizard auto-save failed", err)
            })
    }, [open, book.id, snapshot.context.pricing, snapshot.value])

    const stateValue = snapshot.value as string
    const step = stepIndexFromState(stateValue)
    const canAdvance = snapshot.can({type: "ADVANCE"})
    const isLastStep = step === TOTAL_STEPS - 1

    // a11y: on step transition move keyboard focus to the first
    // interactive element inside the step body so keyboard users
    // land on something actionable. Mirrors the ConvertToBookWizard
    // pattern at L274-282.
    const stepContentRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const container = stepContentRef.current
        if (!container) return
        const focusable = container.querySelector<HTMLElement>(
            "input:not([type='hidden']), select, textarea, button",
        )
        focusable?.focus()
    }, [step])

    // C11 conflict-detection banner. Fires when the book was
    // edited after the persisted publishing-state row was last
    // saved (ISO timestamps compare lexicographically). The user
    // re-validates metadata + cover on the normal flow; the
    // banner is informational + dismissable.
    const hasConflict =
        bookUpdatedAt !== null &&
        stateUpdatedAt !== null &&
        bookUpdatedAt > stateUpdatedAt
    const showConflictBanner = hasConflict && !conflictDismissed

    const closeAndReset = () => {
        send({type: "CANCEL"})
        onClose()
    }

    const renderCurrentStep = () => {
        if (stateValue === "metadata" || stateValue === "metadataError") {
            return (
                <MetadataChecklist
                    book={book}
                    onCanAdvanceChange={() => {
                        /* Machine guard is now the source of
                           truth; this callback is a no-op signal
                           from the per-step component. */
                    }}
                    onLoaded={(result, issuesFiltered) =>
                        send({
                            type: "METADATA_LOADED",
                            result,
                            issuesFiltered,
                        })
                    }
                    onFailed={(error) =>
                        send({type: "METADATA_FAILED", error})
                    }
                />
            )
        }
        if (stateValue === "cover") {
            return (
                <CoverValidation
                    book={book}
                    onCanAdvanceChange={() => {}}
                    onValidated={(dim, issues) =>
                        send({type: "COVER_VALIDATED", dim, issues})
                    }
                />
            )
        }
        if (stateValue === "format") {
            return (
                <FormatStep
                    format={snapshot.context.format}
                    onChange={(partial) =>
                        send({type: "FORMAT_CHANGE", format: partial})
                    }
                />
            )
        }
        if (stateValue === "pricing") {
            return (
                <PricingStep
                    book={book}
                    pricing={snapshot.context.pricing}
                    onChange={(partial) =>
                        send({type: "PRICING_CHANGE", pricing: partial})
                    }
                />
            )
        }
        if (stateValue === "arc") {
            return <ArcStep book={book} />
        }
        if (stateValue === "guide") {
            return <KdpGuideStep format={snapshot.context.format} />
        }
        // export / exporting / exportSuccess / exportError
        return (
            <ExportPackage
                book={book}
                onCanAdvanceChange={() => {}}
                onGenerate={() => send({type: "GENERATE"})}
                onSuccess={(filename, blobUrl) =>
                    send({
                        type: "EXPORT_SUCCESS",
                        filename,
                        blobUrl,
                    })
                }
                onFailed={(error) =>
                    send({type: "EXPORT_FAILED", error})
                }
            />
        )
    }

    const wizardSteps = STEPS.map((s) => ({
        key: s.key,
        label: t(s.labelKey, s.fallback),
    }))

    const conflictBanner = showConflictBanner ? (
        <div
            style={styles.conflictBanner}
            data-testid="kdp-publishing-wizard-conflict-banner"
            role="status"
            aria-live="polite"
        >
            <AlertTriangle size={14} />
            <span style={{flex: 1}}>
                {t(
                    "ui.kdp_publishing_wizard.conflict_banner",
                    "Die Buchmetadaten wurden seit der letzten Wizard-Sitzung geändert. Bitte Metadaten + Cover erneut bestätigen, bevor du das Paket erstellst.",
                )}
            </span>
            <button
                type="button"
                onClick={() => setConflictDismissed(true)}
                style={styles.conflictDismiss}
                aria-label={t(
                    "ui.kdp_publishing_wizard.conflict_dismiss",
                    "Hinweis schließen",
                )}
                data-testid="kdp-publishing-wizard-conflict-dismiss"
            >
                <X size={12} />
            </button>
        </div>
    ) : undefined

    return (
        <WizardShell
            open={open}
            onClose={closeAndReset}
            namespace="kdp-publishing-wizard"
            title={t(
                "ui.kdp_publishing_wizard.dialog_title",
                "Für KDP veröffentlichen",
            )}
            titleIcon={<Rocket size={18} />}
            subtitle={book.title}
            steps={wizardSteps}
            currentStep={step}
            stepColorPolicy="single"
            banner={conflictBanner}
            closeAriaLabel={t("ui.common.close", "Schließen")}
            nav={
                <WizardNav
                    step={step}
                    onBack={
                        step > 0 ? () => send({type: "BACK"}) : undefined
                    }
                    onAdvance={
                        isLastStep
                            ? undefined
                            : () => send({type: "ADVANCE"})
                    }
                    advanceDisabled={!canAdvance}
                    onFinish={isLastStep ? closeAndReset : undefined}
                    isLastStep={isLastStep}
                    finishLabel={t(
                        "ui.kdp_publishing_wizard.finish",
                        "Fertig",
                    )}
                    finishIcon={<Check size={14} />}
                />
            }
            bodyRef={stepContentRef}
        >
            {renderCurrentStep()}
        </WizardShell>
    )
}

// --- styles --------------------------------------------------------------
// Dialog chrome + step indicator + nav lives in WizardShell. The
// conflict-banner is wizard-specific and stays here.

const styles: Record<string, React.CSSProperties> = {
    conflictBanner: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 12,
        background: "var(--warning-bg, rgba(234,179,8,0.1))",
        color: "var(--warning, #b45309)",
        border: "1px solid var(--warning, #b45309)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    conflictDismiss: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "inherit",
        padding: 2,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    },
}
