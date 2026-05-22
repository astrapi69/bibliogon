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
import * as Dialog from "@radix-ui/react-dialog"
import {useMachine} from "@xstate/react"
import {ChevronLeft, ChevronRight, Check, X, Rocket} from "lucide-react"

import {BookDetail, api} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import ArcStep from "./ArcStep"
import CoverValidation from "./CoverValidation"
import ExportPackage from "./ExportPackage"
import {kdpWizardMachine} from "./machines/kdpWizardMachine"
import MetadataChecklist from "./MetadataChecklist"
import PricingStep from "./PricingStep"

interface Props {
    open: boolean
    book: BookDetail
    onClose: () => void
}

const TOTAL_STEPS = 5

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
] as const

/** Map machine ``state.value`` to the user-visible step index used
 *  by the dot indicator + testid namespace. */
function stepIndexFromState(stateValue: string): 0 | 1 | 2 | 3 | 4 {
    switch (stateValue) {
        case "metadata":
        case "metadataError":
            return 0
        case "cover":
            return 1
        case "pricing":
            return 2
        case "arc":
            return 3
        case "export":
        case "exporting":
        case "exportSuccess":
        case "exportError":
            return 4
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
    // Book.updated_at as of wizard-open time, used by C11's
    // conflict-detection banner (filed for next commit; stored
    // here now so the round-trip is observable).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [bookUpdatedAt, setBookUpdatedAt] = useState<string | null>(null)

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

    // Step-indicator dot row. Visited steps render filled; the
    // current step is the rightmost filled dot.
    const renderStepIndicator = () => (
        <div style={styles.steps} data-testid="kdp-publishing-wizard-step-indicator">
            {STEPS.map((s, i) => (
                <div
                    key={s.key}
                    data-testid={`kdp-publishing-wizard-step-dot-${i}`}
                    style={{
                        ...styles.stepDot,
                        background:
                            i <= step
                                ? "var(--accent, var(--primary))"
                                : "var(--border)",
                    }}
                    aria-label={t(s.labelKey, s.fallback)}
                    title={t(s.labelKey, s.fallback)}
                />
            ))}
        </div>
    )

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(o) => {
                if (!o) closeAndReset()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay style={styles.overlay} />
                <Dialog.Content
                    style={styles.content}
                    data-testid="kdp-publishing-wizard-dialog"
                    aria-describedby={undefined}
                >
                    <Dialog.Title style={styles.title}>
                        <Rocket size={18} />
                        {t(
                            "ui.kdp_publishing_wizard.dialog_title",
                            "Für KDP veröffentlichen",
                        )}
                    </Dialog.Title>

                    <p
                        style={styles.subtitle}
                        data-testid="kdp-publishing-wizard-book-title"
                    >
                        {book.title}
                    </p>

                    {renderStepIndicator()}
                    <div>{renderCurrentStep()}</div>

                    <div style={styles.nav}>
                        <div style={{display: "flex", gap: 8}}>
                            {step > 0 && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => send({type: "BACK"})}
                                    data-testid={`kdp-publishing-wizard-step-${step}-back`}
                                >
                                    <ChevronLeft size={14} />{" "}
                                    {t("ui.common.back", "Zurück")}
                                </button>
                            )}
                        </div>
                        <div style={{display: "flex", gap: 8}}>
                            {!isLastStep && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => send({type: "ADVANCE"})}
                                    disabled={!canAdvance}
                                    data-testid={`kdp-publishing-wizard-step-${step}-next`}
                                >
                                    {t("ui.common.next", "Weiter")}{" "}
                                    <ChevronRight size={14} />
                                </button>
                            )}
                            {isLastStep && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={closeAndReset}
                                    data-testid={`kdp-publishing-wizard-step-${step}-finish`}
                                >
                                    <Check size={14} />{" "}
                                    {t(
                                        "ui.kdp_publishing_wizard.finish",
                                        "Fertig",
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Close button: Dialog.Close handles the onOpenChange
                        path which runs the CANCEL dispatch + onClose in
                        the Dialog.Root handler above. No explicit onClick
                        here — double-firing was the original C1 bug. */}
                    <Dialog.Close asChild>
                        <button
                            type="button"
                            style={styles.close}
                            aria-label={t("ui.common.close", "Schließen")}
                            data-testid="kdp-publishing-wizard-close"
                        >
                            <X size={16} />
                        </button>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

// --- styles --------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9998,
    },
    content: {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-md, 8px)",
        padding: 24,
        width: "min(640px, 92vw)",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "var(--shadow-lg)",
        zIndex: 9999,
    },
    title: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "1.125rem",
        fontWeight: 600,
        margin: 0,
        marginBottom: 4,
        color: "var(--text-primary)",
    },
    subtitle: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginTop: 0,
        marginBottom: 16,
    },
    steps: {
        display: "flex",
        gap: 6,
        justifyContent: "center",
        marginBottom: 20,
    },
    stepDot: {
        width: 10,
        height: 10,
        borderRadius: "50%",
        transition: "background 0.2s",
    },
    nav: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid var(--border)",
    },
    close: {
        position: "absolute",
        top: 12,
        right: 12,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        padding: 4,
    },
}
