/**
 * Vitest coverage for TileSelectCheckbox (issue #273, 3a).
 *
 * Pins the bulk-selection overlay checkbox used on the Books +
 * Articles grid tiles:
 * - renders the input with the supplied testid + aria-label;
 * - toggling fires onToggle;
 * - the checkbox click does NOT bubble to the tile's click-to-open
 *   handler (the label + input both stopPropagation);
 * - the wrapping label carries the pointer-coarse 44px tap-area
 *   utilities (touch-target compliance).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TileSelectCheckbox from "./TileSelectCheckbox";

describe("TileSelectCheckbox", () => {
    it("renders the input with testid + aria-label", () => {
        render(
            <TileSelectCheckbox
                checked={false}
                onToggle={vi.fn()}
                testId="book-bulk-check-x"
                ariaLabel="Select book"
            />,
        );
        const input = screen.getByTestId("book-bulk-check-x") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.type).toBe("checkbox");
        expect(input.getAttribute("aria-label")).toBe("Select book");
    });

    it("reflects the checked state", () => {
        render(
            <TileSelectCheckbox
                checked
                onToggle={vi.fn()}
                testId="book-bulk-check-x"
                ariaLabel="Select book"
            />,
        );
        const input = screen.getByTestId("book-bulk-check-x") as HTMLInputElement;
        expect(input.checked).toBe(true);
    });

    it("toggling fires onToggle and does not bubble to the tile handler", () => {
        const onToggle = vi.fn();
        const onTileClick = vi.fn();
        render(
            <div onClick={onTileClick} data-testid="tile">
                <TileSelectCheckbox
                    checked={false}
                    onToggle={onToggle}
                    testId="book-bulk-check-x"
                    ariaLabel="Select book"
                />
            </div>,
        );
        fireEvent.click(screen.getByTestId("book-bulk-check-x"));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onTileClick).not.toHaveBeenCalled();
    });

    it("wraps the input in a label carrying the coarse 44px tap-area utilities", () => {
        render(
            <TileSelectCheckbox
                checked={false}
                onToggle={vi.fn()}
                testId="book-bulk-check-x"
                ariaLabel="Select book"
            />,
        );
        const input = screen.getByTestId("book-bulk-check-x");
        const label = input.closest("label");
        expect(label).not.toBeNull();
        expect(label?.className).toContain("pointer-coarse:-m-[13px]");
        expect(label?.className).toContain("pointer-coarse:p-[13px]");
    });
});
