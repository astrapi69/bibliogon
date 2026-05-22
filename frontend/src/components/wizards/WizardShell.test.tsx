/**
 * WizardShell + WizardNav Vitest cases.
 *
 * Covers the extracted shared-shell pinned by RCU 2-site
 * trigger (KDP + Convert). Each case asserts a positive
 * shell-level testid resolves (per the "Testid namespace
 * pinning prevents silent E2E skips" lesson) AND the
 * underlying behavior fires (per the "End-to-end behavior
 * tests are not 'kwarg passes through' tests" lesson).
 */

import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import WizardShell, {WizardNav} from "./WizardShell"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const NS = "test-wizard"

const STEPS = [
    {key: "a", label: "Step A"},
    {key: "b", label: "Step B"},
    {key: "c", label: "Step C"},
]

describe("WizardShell — namespace + dialog chrome", () => {
    it("renders dialog with namespace-prefixed testid when open", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(screen.getByTestId(`${NS}-dialog`)).toBeTruthy()
    })

    it("does not render dialog content when open=false", () => {
        render(
            <WizardShell
                open={false}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(screen.queryByTestId(`${NS}-dialog`)).toBeNull()
    })

    it("renders subtitle with book-title testid when provided", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                subtitle="My Book"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        const subtitle = screen.getByTestId(`${NS}-book-title`)
        expect(subtitle.textContent).toBe("My Book")
    })

    it("omits subtitle testid when subtitle not provided", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(screen.queryByTestId(`${NS}-book-title`)).toBeNull()
    })

    it("close button fires onClose", () => {
        const onClose = vi.fn()
        render(
            <WizardShell
                open={true}
                onClose={onClose}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        fireEvent.click(screen.getByTestId(`${NS}-close`))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("close button is disabled when closeDisabled=true", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
                closeDisabled={true}
            >
                <div>body</div>
            </WizardShell>,
        )
        const closeBtn = screen.getByTestId(`${NS}-close`) as HTMLButtonElement
        expect(closeBtn.disabled).toBe(true)
    })

    it("renders body via children", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
            >
                <div data-testid="body-content">My step body</div>
            </WizardShell>,
        )
        expect(screen.getByTestId("body-content").textContent).toBe("My step body")
    })

    it("renders optional banner slot above body", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={0}
                closeAriaLabel="Close"
                banner={<div data-testid="my-banner">banner content</div>}
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(screen.getByTestId("my-banner")).toBeTruthy()
    })
})

describe("WizardShell — step-dot indicator", () => {
    it("renders step-indicator + one dot per step with aria-label", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={1}
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(screen.getByTestId(`${NS}-step-indicator`)).toBeTruthy()
        for (let i = 0; i < STEPS.length; i++) {
            const dot = screen.getByTestId(`${NS}-step-dot-${i}`)
            expect(dot.getAttribute("aria-label")).toBe(STEPS[i].label)
            expect(dot.getAttribute("title")).toBe(STEPS[i].label)
        }
    })

    it("policy=single: visited (i<=current) vs future", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={1}
                stepColorPolicy="single"
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(
            screen.getByTestId(`${NS}-step-dot-0`).getAttribute("data-step-state"),
        ).toBe("visited")
        expect(
            screen.getByTestId(`${NS}-step-dot-1`).getAttribute("data-step-state"),
        ).toBe("visited")
        expect(
            screen.getByTestId(`${NS}-step-dot-2`).getAttribute("data-step-state"),
        ).toBe("future")
    })

    it("policy=current-vs-completed: three distinct states", () => {
        render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={1}
                stepColorPolicy="current-vs-completed"
                closeAriaLabel="Close"
            >
                <div>body</div>
            </WizardShell>,
        )
        expect(
            screen.getByTestId(`${NS}-step-dot-0`).getAttribute("data-step-state"),
        ).toBe("completed")
        expect(
            screen.getByTestId(`${NS}-step-dot-1`).getAttribute("data-step-state"),
        ).toBe("current")
        expect(
            screen.getByTestId(`${NS}-step-dot-2`).getAttribute("data-step-state"),
        ).toBe("future")
    })
})

describe("WizardNav — navigation slot", () => {
    function renderNav(props: Parameters<typeof WizardNav>[0]) {
        return render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={props.step}
                closeAriaLabel="Close"
                nav={<WizardNav {...props} />}
            >
                <div>body</div>
            </WizardShell>,
        )
    }

    it("renders no buttons when no handlers passed", () => {
        renderNav({step: 0})
        expect(screen.queryByTestId(`${NS}-step-0-back`)).toBeNull()
        expect(screen.queryByTestId(`${NS}-step-0-skip`)).toBeNull()
        expect(screen.queryByTestId(`${NS}-step-0-next`)).toBeNull()
        expect(screen.queryByTestId(`${NS}-step-0-finish`)).toBeNull()
    })

    it("Back button fires onBack with step in testid", () => {
        const onBack = vi.fn()
        renderNav({step: 2, onBack})
        const back = screen.getByTestId(`${NS}-step-2-back`)
        fireEvent.click(back)
        expect(onBack).toHaveBeenCalledTimes(1)
    })

    it("Next button fires onAdvance + respects advanceDisabled", () => {
        const onAdvance = vi.fn()
        const {rerender} = render(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={1}
                closeAriaLabel="Close"
                nav={
                    <WizardNav step={1} onAdvance={onAdvance} advanceDisabled />
                }
            >
                <div>body</div>
            </WizardShell>,
        )
        const next = screen.getByTestId(`${NS}-step-1-next`) as HTMLButtonElement
        expect(next.disabled).toBe(true)
        fireEvent.click(next)
        expect(onAdvance).toHaveBeenCalledTimes(0)

        rerender(
            <WizardShell
                open={true}
                onClose={vi.fn()}
                namespace={NS}
                title="Test Wizard"
                steps={STEPS}
                currentStep={1}
                closeAriaLabel="Close"
                nav={<WizardNav step={1} onAdvance={onAdvance} />}
            >
                <div>body</div>
            </WizardShell>,
        )
        fireEvent.click(screen.getByTestId(`${NS}-step-1-next`))
        expect(onAdvance).toHaveBeenCalledTimes(1)
    })

    it("Next is hidden on last step; Finish appears when onFinish defined", () => {
        const onFinish = vi.fn()
        renderNav({
            step: 2,
            onAdvance: vi.fn(),
            onFinish,
            isLastStep: true,
            finishLabel: "Done",
        })
        expect(screen.queryByTestId(`${NS}-step-2-next`)).toBeNull()
        const finish = screen.getByTestId(`${NS}-step-2-finish`)
        expect(finish.textContent).toContain("Done")
        fireEvent.click(finish)
        expect(onFinish).toHaveBeenCalledTimes(1)
    })

    it("Skip button fires onSkip when provided", () => {
        const onSkip = vi.fn()
        renderNav({step: 1, onSkip})
        fireEvent.click(screen.getByTestId(`${NS}-step-1-skip`))
        expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it("WizardNav outside a WizardShell throws (namespace required)", () => {
        // Suppress React error boundary log spam.
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(() => render(<WizardNav step={0} onBack={vi.fn()} />)).toThrow(
            /WizardNav must be rendered inside a <WizardShell>/,
        )
        spy.mockRestore()
    })
})
