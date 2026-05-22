/**
 * KDP Publishing Wizard (MVP, 3 steps).
 *
 * Walks the user from a configured Book through to a KDP-ready
 * package ZIP. Three steps:
 *   0 — MetadataChecklist    (Step 1: validate KDP-required metadata)
 *   1 — CoverValidation      (Step 2: validate cover image)
 *   2 — ExportPackage        (Step 3: download KDP-package ZIP)
 *
 * Pattern: follows ``ConvertToBookWizard`` (canonical wizard
 * shape per the KDP Pre-Inspection 2026-05-24, Track 2):
 *   - Radix Dialog wrapping a step-index ``useState``
 *   - Conditional render per step
 *   - Per-step "advance-allowed" gating before Next button
 *     enables (filled in by C2/C3/C4 per the implementation plan;
 *     shell always allows for now)
 *   - Testid namespace: ``kdp-publishing-wizard-{step}-{slot}``
 *
 * Phase 1 (MVP) is session-scoped — no ``BookPublishingState``
 * persistence per A5 adjudication. The wizard's state lives in
 * React; closing the dialog clears it. Phase 2 (pricing + ARC)
 * adds the persistence model.
 *
 * Mount: BookMetadataEditor header. Self-contained (open via
 * internal useState in the parent). No prop-drilling through
 * BookEditor needed.
 */

import {useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {ChevronLeft, ChevronRight, Check, X, Rocket} from "lucide-react"

import {BookDetail} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import MetadataChecklist from "./MetadataChecklist"
import CoverValidation from "./CoverValidation"
import ExportPackage from "./ExportPackage"

interface Props {
    open: boolean
    book: BookDetail
    onClose: () => void
}

type StepIndex = 0 | 1 | 2
const TOTAL_STEPS = 3

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
        key: "export",
        labelKey: "ui.kdp_publishing_wizard.step_export",
        fallback: "Paket",
    },
] as const

export default function KdpPublishingWizard({open, book, onClose}: Props) {
    const {t} = useI18n()
    const [step, setStep] = useState<StepIndex>(0)
    // C2/C3: per-step gates. Next is disabled until the step's
    // child component reports it can advance.
    const [step0CanAdvance, setStep0CanAdvance] = useState(false)
    const [step1CanAdvance, setStep1CanAdvance] = useState(false)

    const renderCurrentStep = () => {
        switch (step) {
            case 0:
                return (
                    <MetadataChecklist
                        book={book}
                        onCanAdvanceChange={setStep0CanAdvance}
                    />
                )
            case 1:
                return (
                    <CoverValidation
                        book={book}
                        onCanAdvanceChange={setStep1CanAdvance}
                    />
                )
            case 2:
                return (
                    <ExportPackage
                        book={book}
                        onCanAdvanceChange={() => {
                            /* Last step: Finish is always rendered.
                               Prop preserved for parity with C2 / C3
                               shape; the gate doesn't bind to a
                               wizard-level button here. */
                        }}
                    />
                )
            default:
                return null
        }
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
                if (!o) {
                    setStep(0)
                    onClose()
                }
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
                                    onClick={() =>
                                        setStep((step - 1) as StepIndex)
                                    }
                                    data-testid={`kdp-publishing-wizard-step-${step}-back`}
                                >
                                    <ChevronLeft size={14} />{" "}
                                    {t("ui.common.back", "Zurück")}
                                </button>
                            )}
                        </div>
                        <div style={{display: "flex", gap: 8}}>
                            {step < TOTAL_STEPS - 1 && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() =>
                                        setStep((step + 1) as StepIndex)
                                    }
                                    disabled={
                                        (step === 0 && !step0CanAdvance) ||
                                        (step === 1 && !step1CanAdvance)
                                    }
                                    data-testid={`kdp-publishing-wizard-step-${step}-next`}
                                >
                                    {t("ui.common.next", "Weiter")}{" "}
                                    <ChevronRight size={14} />
                                </button>
                            )}
                            {step === TOTAL_STEPS - 1 && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                        setStep(0)
                                        onClose()
                                    }}
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
                        path which runs the step reset + onClose in the
                        Dialog.Root handler above. No explicit onClick
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
    stepContent: {
        minHeight: 280,
    },
    hint: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
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
