/**
 * WizardShell — shared Dialog-chrome + step-indicator + nav for
 * multi-step wizards in Bibliogon. Extracted 2026-05-24 from
 * `KdpPublishingWizard` and `ConvertToBookWizard` per the RCU
 * 2-site trigger (WIZARD-SHELL-COMPONENT-EXTRACT-01).
 *
 * Scope (intentional asymmetry — see commit history):
 *   - Migrated: KdpPublishingWizard, ConvertToBookWizard.
 *   - NOT migrated: ImportWizardModal. Different shape
 *     (className-based dialog styling, 900px width, text-only
 *     step indicator "Step X of 4", per-step nav inside each
 *     step component, WizardErrorBoundary wrapper). A 2nd
 *     surface matching that shape would fire
 *     WIZARD-SHELL-IMPORT-VARIANT-01 (P5).
 *
 * Composition pattern:
 *   <WizardShell namespace="..." steps={...} currentStep={...}
 *                banner={<OptionalBannerElement/>}
 *                nav={<WizardNav .../>}>
 *     {renderCurrentStepBody()}
 *   </WizardShell>
 *
 * Testid namespace: every interactive surface inside the shell
 * carries `{namespace}-{slot}` testids derived from the
 * `namespace` prop. WizardNav reads the namespace from a React
 * context provided by WizardShell so consumers declare it once.
 */

import {createContext, useContext} from "react"
import type {ReactNode, RefObject} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {ChevronLeft, ChevronRight, X} from "lucide-react"

import {useI18n} from "../../hooks/useI18n"

export interface StepDef {
    /** Stable key (used as React `key` prop on the dot). */
    key: string
    /** Visible label for aria-label + title attribute on the dot.
     *  Optional: omit when no per-dot label is desired (the
     *  ConvertToBookWizard shape, which puts the aria-label on
     *  the indicator container instead). */
    label?: string
}

interface WizardShellProps {
    open: boolean
    /** Fires on every close path (overlay click, escape, X button).
     *  Consumer is responsible for cleanup (machine CANCEL, etc.). */
    onClose: () => void
    /** Testid prefix for dialog, indicator, dots, close. Threaded
     *  through React context for WizardNav consumption. */
    namespace: string
    title: string
    titleIcon?: ReactNode
    /** Optional subtitle line under the title. Gets testid
     *  `{namespace}-book-title` when present (KDP shape). */
    subtitle?: string
    /** Dot indicator step list — order defines visual order. */
    steps: ReadonlyArray<StepDef>
    /** 0-based current step index. */
    currentStep: number
    /** Indicator coloring policy:
     *   - "single" (default, KDP shape): visited (i <= current) =
     *     accent; unvisited = border.
     *   - "current-vs-completed" (Convert shape): three colors —
     *     current = accent, completed = success-green,
     *     future = border. */
    stepColorPolicy?: "single" | "current-vs-completed"
    /** Optional banner slot rendered between indicator and body
     *  (conflict / validation / etc.). Caller owns testid +
     *  dismiss state. */
    banner?: ReactNode
    children: ReactNode
    /** Optional nav slot rendered below the body. Typically
     *  `<WizardNav .../>` but free-form. */
    nav?: ReactNode
    /** Body wrapper ref — for consumer-managed focus on step
     *  change. */
    bodyRef?: RefObject<HTMLDivElement | null>
    /** Dialog content width. Defaults to "min(640px, 92vw)". */
    width?: string
    /** aria-label for the X close button. Consumer passes t()
     *  result. */
    closeAriaLabel: string
    /** Disable the X close button (e.g. during a submitting
     *  state). Overlay + escape still fire onClose. */
    closeDisabled?: boolean
}

const WizardNamespaceContext = createContext<string | null>(null)

function useWizardNamespace(componentName: string): string {
    const namespace = useContext(WizardNamespaceContext)
    if (namespace === null) {
        throw new Error(
            `${componentName} must be rendered inside a <WizardShell>`,
        )
    }
    return namespace
}

export default function WizardShell({
    open,
    onClose,
    namespace,
    title,
    titleIcon,
    subtitle,
    steps,
    currentStep,
    stepColorPolicy = "single",
    banner,
    children,
    nav,
    bodyRef,
    width = "min(640px, 92vw)",
    closeAriaLabel,
    closeDisabled,
}: WizardShellProps) {
    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) onClose()
    }

    return (
        <WizardNamespaceContext.Provider value={namespace}>
            <Dialog.Root open={open} onOpenChange={handleOpenChange}>
                <Dialog.Portal>
                    <Dialog.Overlay style={styles.overlay} />
                    <Dialog.Content
                        style={{...styles.content, width}}
                        data-testid={`${namespace}-dialog`}
                        aria-describedby={undefined}
                    >
                        <Dialog.Title
                            style={{
                                ...styles.title,
                                marginBottom: subtitle ? 4 : 16,
                            }}
                        >
                            {titleIcon}
                            {title}
                        </Dialog.Title>

                        {subtitle && (
                            <p
                                style={styles.subtitle}
                                data-testid={`${namespace}-book-title`}
                            >
                                {subtitle}
                            </p>
                        )}

                        <StepDotIndicator
                            namespace={namespace}
                            steps={steps}
                            currentStep={currentStep}
                            policy={stepColorPolicy}
                        />

                        {banner}

                        <div ref={bodyRef}>{children}</div>

                        {nav}

                        <Dialog.Close asChild>
                            <button
                                type="button"
                                style={styles.close}
                                aria-label={closeAriaLabel}
                                data-testid={`${namespace}-close`}
                                disabled={closeDisabled}
                            >
                                <X size={16} />
                            </button>
                        </Dialog.Close>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </WizardNamespaceContext.Provider>
    )
}

interface StepDotIndicatorProps {
    namespace: string
    steps: ReadonlyArray<StepDef>
    currentStep: number
    policy: "single" | "current-vs-completed"
}

function StepDotIndicator({
    namespace,
    steps,
    currentStep,
    policy,
}: StepDotIndicatorProps) {
    return (
        <div
            style={styles.steps}
            data-testid={`${namespace}-step-indicator`}
        >
            {steps.map((step, i) => {
                const state = dotState(i, currentStep, policy)
                // Omit aria-label / title attributes entirely when
                // no label is provided (Convert wizard shape) so
                // happy-dom + DOM both report the attribute as
                // absent, not as the literal string "undefined".
                const a11yProps: Record<string, string> = step.label
                    ? {"aria-label": step.label, title: step.label}
                    : {}
                // a11y: mark the current step dot so screen readers
                // announce "step X of N" instead of just N identical
                // bullets. WAI-ARIA aria-current="step" is the
                // standard for step indicators in a multi-step flow.
                if (i === currentStep) a11yProps["aria-current"] = "step"
                return (
                    <div
                        key={step.key}
                        data-testid={`${namespace}-step-dot-${i}`}
                        data-step-state={state}
                        style={{
                            ...styles.stepDot,
                            background: dotBackground(state),
                        }}
                        {...a11yProps}
                    />
                )
            })}
        </div>
    )
}

type DotState = "current" | "visited" | "completed" | "future"

function dotState(
    i: number,
    currentStep: number,
    policy: "single" | "current-vs-completed",
): DotState {
    if (policy === "current-vs-completed") {
        if (i === currentStep) return "current"
        if (i < currentStep) return "completed"
        return "future"
    }
    // "single" — KDP shape: visited (i <= current) vs future
    return i <= currentStep ? "visited" : "future"
}

function dotBackground(state: DotState): string {
    switch (state) {
        case "current":
            return "var(--accent)"
        case "completed":
            return "var(--success, #16a34a)"
        case "visited":
            return "var(--accent)"
        case "future":
            return "var(--border)"
    }
}

interface WizardNavProps {
    /** Current step index. Threaded into testids
     *  (`{namespace}-step-{step}-back/skip/next/finish`). */
    step: number
    onBack?: () => void
    backDisabled?: boolean
    /** Optional skip button (Convert wizard's skippable steps). */
    onSkip?: () => void
    skipDisabled?: boolean
    /** Advance button — shown when defined AND NOT isLastStep. */
    onAdvance?: () => void
    advanceDisabled?: boolean
    /** Finish button — shown when defined AND isLastStep. */
    onFinish?: () => void
    finishDisabled?: boolean
    isLastStep?: boolean
    /** Override next button label (default: t("ui.common.next")). */
    nextLabel?: string
    /** Override back button label (default: t("ui.common.back")). */
    backLabel?: string
    /** Override skip button label (default: t("ui.common.skip")). */
    skipLabel?: string
    /** Finish button label — REQUIRED when onFinish is provided
     *  (varies per wizard, e.g. "Fertig" / "Done"). */
    finishLabel?: string
    /** Optional leading icon for the Finish button. */
    finishIcon?: ReactNode
}

export function WizardNav({
    step,
    onBack,
    backDisabled,
    onSkip,
    skipDisabled,
    onAdvance,
    advanceDisabled,
    onFinish,
    finishDisabled,
    isLastStep,
    nextLabel,
    backLabel,
    skipLabel,
    finishLabel,
    finishIcon,
}: WizardNavProps) {
    const namespace = useWizardNamespace("WizardNav")
    const {t} = useI18n()

    const showBack = onBack !== undefined
    const showSkip = onSkip !== undefined
    const showAdvance = onAdvance !== undefined && !isLastStep
    const showFinish = onFinish !== undefined && isLastStep

    return (
        <div style={styles.nav}>
            <div style={styles.navGroup}>
                {showBack && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={onBack}
                        disabled={backDisabled}
                        data-testid={`${namespace}-step-${step}-back`}
                    >
                        <ChevronLeft size={14} />{" "}
                        {backLabel ?? t("ui.common.back", "Zurück")}
                    </button>
                )}
                {showSkip && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={onSkip}
                        disabled={skipDisabled}
                        data-testid={`${namespace}-step-${step}-skip`}
                    >
                        {skipLabel ?? t("ui.common.skip", "Überspringen")}
                    </button>
                )}
            </div>
            <div style={styles.navGroup}>
                {showAdvance && (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={onAdvance}
                        disabled={advanceDisabled}
                        data-testid={`${namespace}-step-${step}-next`}
                    >
                        {nextLabel ?? t("ui.common.next", "Weiter")}{" "}
                        <ChevronRight size={14} />
                    </button>
                )}
                {showFinish && (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={onFinish}
                        disabled={finishDisabled}
                        data-testid={`${namespace}-step-${step}-finish`}
                    >
                        {finishIcon}
                        {finishIcon && " "}
                        {finishLabel}
                    </button>
                )}
            </div>
        </div>
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
    navGroup: {
        display: "flex",
        gap: 8,
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
