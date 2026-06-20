/**
 * BUG-2 regression: ErrorBoundary catches a throwing child and
 * renders the localized fallback + Reload button instead of
 * propagating the crash (which would blank the app).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import ErrorBoundary from "../ErrorBoundary";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

function Boom(): never {
    throw new Error("boom");
}

describe("ErrorBoundary", () => {
    let consoleErr: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // React logs the caught error to console.error; silence the
        // expected noise so the test output stays clean.
        consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        consoleErr.mockRestore();
    });

    it("renders children when no error is thrown", () => {
        render(
            <ErrorBoundary surface="test">
                <div data-testid="ok-child">fine</div>
            </ErrorBoundary>,
        );
        expect(screen.getByTestId("ok-child")).toBeInTheDocument();
        expect(screen.queryByTestId("error-boundary-test")).not.toBeInTheDocument();
    });

    it("catches a throwing child and renders the fallback + reload button", () => {
        render(
            <ErrorBoundary surface="test">
                <Boom />
            </ErrorBoundary>,
        );
        expect(screen.getByTestId("error-boundary-test")).toBeInTheDocument();
        expect(screen.getByTestId("error-boundary-test-reload")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toBeInTheDocument();
    });
});
