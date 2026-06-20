/**
 * Vitest coverage for SearchClearButton.
 *
 * Pins:
 * - Renders nothing when value is empty (the button must not occupy
 *   visual space when there is nothing to clear).
 * - Renders an X button when value is non-empty.
 * - onClear fires on click.
 * - data-testid passes through.
 * - aria-label comes from i18n (with the "Leeren" fallback).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import SearchClearButton from "../SearchClearButton";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("SearchClearButton", () => {
    it("renders nothing when value is empty", () => {
        const {container} = render(
            <SearchClearButton value="" onClear={() => {}} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders an X button when value is non-empty", () => {
        render(
            <SearchClearButton
                value="hello"
                onClear={() => {}}
                data-testid="my-clear"
            />,
        );
        expect(screen.getByTestId("my-clear")).toBeInTheDocument();
    });

    it("onClear fires on click", () => {
        const onClear = vi.fn();
        render(
            <SearchClearButton
                value="x"
                onClear={onClear}
                data-testid="my-clear"
            />,
        );
        fireEvent.click(screen.getByTestId("my-clear"));
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("aria-label uses the i18n fallback", () => {
        render(
            <SearchClearButton
                value="x"
                onClear={() => {}}
                data-testid="my-clear"
            />,
        );
        expect(screen.getByTestId("my-clear")).toHaveAttribute(
            "aria-label",
            "Leeren",
        );
    });
});
