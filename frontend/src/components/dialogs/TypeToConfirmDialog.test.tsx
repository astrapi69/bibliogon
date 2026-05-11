/**
 * TypeToConfirmDialog behavior tests.
 *
 * Covers the numeric-confirm gating: button starts disabled, mismatch
 * surfaces an error and keeps it disabled, exact-match enables it,
 * Enter on a valid input triggers confirm, cancel always works.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TypeToConfirmDialog from "./TypeToConfirmDialog";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

function setup(count: number, extra: Partial<React.ComponentProps<typeof TypeToConfirmDialog>> = {}) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
        <TypeToConfirmDialog
            open
            count={count}
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...extra}
        />,
    );
    return { onConfirm, onCancel };
}

describe("TypeToConfirmDialog", () => {
    it("renders count + summary on open", () => {
        setup(47);
        // Count appears multiple times (summary + input-label prompt);
        // confirm at least one occurrence is rendered.
        expect(screen.getAllByText(/47/).length).toBeGreaterThan(0);
    });

    it("confirm button is disabled before typing", () => {
        setup(47);
        expect(screen.getByTestId("type-to-confirm-confirm")).toBeDisabled();
    });

    it("typing a wrong number shows error + keeps button disabled", () => {
        setup(47);
        const input = screen.getByTestId("type-to-confirm-input");
        fireEvent.change(input, { target: { value: "48" } });
        expect(screen.getByTestId("type-to-confirm-error")).toBeInTheDocument();
        expect(screen.getByTestId("type-to-confirm-confirm")).toBeDisabled();
    });

    it("typing the exact count enables confirm + clears error", () => {
        setup(47);
        const input = screen.getByTestId("type-to-confirm-input");
        fireEvent.change(input, { target: { value: "47" } });
        expect(screen.queryByTestId("type-to-confirm-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("type-to-confirm-confirm")).not.toBeDisabled();
    });

    it("clicking confirm with valid input fires onConfirm", () => {
        const { onConfirm } = setup(47);
        fireEvent.change(screen.getByTestId("type-to-confirm-input"), {
            target: { value: "47" },
        });
        fireEvent.click(screen.getByTestId("type-to-confirm-confirm"));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("pressing Enter with valid input fires onConfirm", () => {
        const { onConfirm } = setup(3);
        const input = screen.getByTestId("type-to-confirm-input");
        fireEvent.change(input, { target: { value: "3" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("pressing Enter with invalid input does NOT fire onConfirm", () => {
        const { onConfirm } = setup(3);
        const input = screen.getByTestId("type-to-confirm-input");
        fireEvent.change(input, { target: { value: "2" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("clicking cancel fires onCancel", () => {
        const { onCancel } = setup(47);
        fireEvent.click(screen.getByTestId("type-to-confirm-cancel"));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("renders the filter clause when provided", () => {
        setup(12, { filterDescription: "Status=Draft, Language=DE" });
        expect(screen.getByText(/Status=Draft, Language=DE/)).toBeInTheDocument();
    });

    it("input has aria-required + the matching pattern attrs", () => {
        setup(5);
        const input = screen.getByTestId("type-to-confirm-input");
        expect(input).toHaveAttribute("aria-required", "true");
        expect(input).toHaveAttribute("inputmode", "numeric");
    });
});
