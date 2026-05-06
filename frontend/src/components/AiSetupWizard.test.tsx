/**
 * Tests for the AiSetupWizard externally-managed-secrets branch
 * (T-XX secrets refactor, addendum 3).
 *
 * When ``secretsManagedExternally`` is true the wizard must:
 * - Hide the API-key input on step 1
 * - Render the info-note instead
 * - NOT block "Continue" on missing api-key
 *
 * When false: existing behavior (input visible, Continue gated on
 * non-empty key).
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import AiSetupWizard from "./AiSetupWizard";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

// vi.mock is hoisted; vi.hoisted lifts the mock fn to the same
// scope so the factory closure can reference it without TDZ.
const {mockTestConnection} = vi.hoisted(() => ({
    mockTestConnection: vi.fn().mockResolvedValue({
        success: true,
        error_key: "",
        error_detail: "",
    }),
}));

vi.mock("../api/client", () => ({
    api: {
        settings: {
            updateApp: vi.fn().mockResolvedValue({}),
        },
        ai: {
            testConnection: mockTestConnection,
        },
    },
}));

beforeEach(() => {
    localStorage.clear();
});

describe("AiSetupWizard secretsManagedExternally branch", () => {
    it("shows info-note + hides input on step 1 when externally managed", () => {
        render(
            <AiSetupWizard
                open
                onClose={vi.fn()}
                secretsManagedExternally
            />,
        );
        // Advance from step 0 (provider pick) to step 1 (api-key).
        fireEvent.click(screen.getByText(/Weiter|Next/));

        expect(
            screen.getByTestId("wizard-api-key-external-note"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("wizard-api-key-input"),
        ).not.toBeInTheDocument();
    });

    it("Continue button enabled on step 1 even with empty api-key when externally managed", () => {
        render(
            <AiSetupWizard
                open
                onClose={vi.fn()}
                secretsManagedExternally
            />,
        );
        fireEvent.click(screen.getByText(/Weiter|Next/));
        // Step 1 -> next button must NOT be disabled because needsKey
        // collapses to false when externally managed.
        const nextButton = screen.getByText(/Weiter|Next/) as HTMLButtonElement;
        expect(nextButton.disabled).toBe(false);
    });

    it("default behavior unchanged when not externally managed (input visible, Continue gated)", () => {
        render(<AiSetupWizard open onClose={vi.fn()} />);
        fireEvent.click(screen.getByText(/Weiter|Next/));

        expect(screen.getByTestId("wizard-api-key-input")).toBeInTheDocument();
        expect(
            screen.queryByTestId("wizard-api-key-external-note"),
        ).not.toBeInTheDocument();
        // Default provider is anthropic which requires a key; empty
        // key disables Continue.
        const nextButton = screen.getByText(/Weiter|Next/) as HTMLButtonElement;
        expect(nextButton.disabled).toBe(true);
    });
});

describe("AiSetupWizard test-connection step", () => {
    beforeEach(() => {
        mockTestConnection.mockClear();
    });

    it("clicking the test button calls api.ai.testConnection (no bare fetch)", async () => {
        render(
            <AiSetupWizard
                open
                onClose={vi.fn()}
                secretsManagedExternally
            />,
        );
        // Step 0 (provider) -> step 1 (api-key, externally managed
        // so Weiter is enabled with empty input) -> step 2 (test).
        fireEvent.click(screen.getByText(/Weiter|Next/));
        fireEvent.click(screen.getByText(/Weiter|Next/));

        const testBtn = screen.getByText(/Verbindung testen|Test connection/);
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(mockTestConnection).toHaveBeenCalledTimes(1);
        });
    });
});
