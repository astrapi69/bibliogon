import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardErrorBoundary } from "./WizardErrorBoundary";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function Boom(): JSX.Element {
    throw new Error("synthetic render crash");
}

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
    });
    // suppress React's expected console.error spam from the
    // intentional render throw; assertions cover the outcome.
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("WizardErrorBoundary", () => {
    it("renders children when no error", () => {
        render(
            <WizardErrorBoundary onClose={vi.fn()}>
                <div data-testid="child">ok</div>
            </WizardErrorBoundary>,
        );
        expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("catches render-time exception and shows ErrorStep", () => {
        render(
            <WizardErrorBoundary onClose={vi.fn()}>
                <Boom />
            </WizardErrorBoundary>,
        );
        expect(
            screen.getByTestId("wizard-error-boundary"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("error-step-message").textContent,
        ).toContain("synthetic render crash");
        expect(
            screen.getByTestId("error-step-context").textContent,
        ).toContain("render");
    });

    it("close button clears state and calls onClose", () => {
        const onClose = vi.fn();
        render(
            <WizardErrorBoundary onClose={onClose}>
                <Boom />
            </WizardErrorBoundary>,
        );
        fireEvent.click(screen.getByTestId("error-close"));
        expect(onClose).toHaveBeenCalled();
    });
});
