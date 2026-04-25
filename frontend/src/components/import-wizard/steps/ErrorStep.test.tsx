import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ErrorStep } from "./ErrorStep";
import type { WizardError } from "../errorContext";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
    });
    Object.defineProperty(window, "open", {
        value: vi.fn(),
        configurable: true,
    });
});

const baseError: WizardError = {
    message: "Pandoc returned non-zero exit status",
    context: "execute",
    retryable: true,
    cause: new Error("subprocess.CalledProcessError(1)"),
};

describe("ErrorStep", () => {
    it("renders the error message + context", () => {
        render(<ErrorStep error={baseError} onClose={vi.fn()} />);
        expect(screen.getByTestId("error-step")).toBeInTheDocument();
        expect(
            screen.getByTestId("error-step-message").textContent,
        ).toContain("Pandoc returned non-zero");
        expect(
            screen.getByTestId("error-step-context").textContent,
        ).toContain("execute");
    });

    it("Show details discloses the formatted payload", () => {
        render(<ErrorStep error={baseError} onClose={vi.fn()} />);
        expect(
            screen.queryByTestId("error-step-details"),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("error-step-toggle-details"));
        const details = screen.getByTestId("error-step-details");
        expect(details.textContent).toContain("execute");
        expect(details.textContent).toContain("Pandoc returned non-zero");
    });

    it("Copy details writes the formatted payload to the clipboard", async () => {
        render(<ErrorStep error={baseError} onClose={vi.fn()} />);
        fireEvent.click(screen.getByTestId("error-step-copy-details"));
        await waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalled(),
        );
        const arg = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>)
            .mock.calls[0][0] as string;
        expect(arg).toContain("Bibliogon import error");
        expect(arg).toContain("execute");
        expect(arg).toContain("Pandoc returned non-zero");
    });

    it("Report Issue opens a GitHub URL with the error pre-filled", () => {
        render(<ErrorStep error={baseError} onClose={vi.fn()} />);
        fireEvent.click(screen.getByTestId("error-step-report"));
        expect(window.open).toHaveBeenCalled();
        const url = (window.open as ReturnType<typeof vi.fn>).mock
            .calls[0][0] as string;
        expect(url).toContain("github.com/astrapi69/bibliogon/issues/new");
        expect(url).toContain("title=");
        expect(url).toContain("body=");
        expect(url).toContain("labels=bug");
    });

    it("Retry button shows when retryable + onRetry provided", () => {
        const onRetry = vi.fn();
        render(
            <ErrorStep error={baseError} onRetry={onRetry} onClose={vi.fn()} />,
        );
        fireEvent.click(screen.getByTestId("error-retry"));
        expect(onRetry).toHaveBeenCalled();
    });

    it("Retry button hidden when retryable=false", () => {
        render(
            <ErrorStep
                error={{ ...baseError, retryable: false }}
                onClose={vi.fn()}
            />,
        );
        expect(screen.queryByTestId("error-retry")).not.toBeInTheDocument();
    });
});
