/**
 * Tests for DASHBOARD-PAGINATION-LOAD-MORE-01 C4: PageSizeSelector.
 *
 * Pins: renders all four allowed sizes, shows the current value
 * as selected, fires the typed onChange.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import PageSizeSelector from "./PageSizeSelector";

describe("PageSizeSelector", () => {
    it("renders the four allowed sizes as options", () => {
        render(<PageSizeSelector value={25} onChange={() => {}} />);
        const select = screen.getByTestId("page-size-selector-select") as HTMLSelectElement;
        const values = Array.from(select.options).map((o) => o.value);
        expect(values).toEqual(["10", "25", "50", "100"]);
    });

    it("reflects the current value as the selected option", () => {
        render(<PageSizeSelector value={50} onChange={() => {}} />);
        const select = screen.getByTestId("page-size-selector-select") as HTMLSelectElement;
        expect(select.value).toBe("50");
    });

    it("fires onChange with the new page-size on selection", () => {
        const onChange = vi.fn();
        render(<PageSizeSelector value={25} onChange={onChange} />);
        const select = screen.getByTestId("page-size-selector-select");
        fireEvent.change(select, { target: { value: "100" } });
        expect(onChange).toHaveBeenCalledWith(100);
    });

    it("typed onChange — value is a number, not a string", () => {
        const onChange = vi.fn();
        render(<PageSizeSelector value={25} onChange={onChange} />);
        fireEvent.change(screen.getByTestId("page-size-selector-select"), {
            target: { value: "10" },
        });
        expect(onChange).toHaveBeenCalledWith(10);
        expect(typeof onChange.mock.calls[0][0]).toBe("number");
    });

    it("honours a custom data-testid", () => {
        render(
            <PageSizeSelector value={25} onChange={() => {}} data-testid="books-pager" />,
        );
        expect(screen.getByTestId("books-pager")).toBeTruthy();
        expect(screen.getByTestId("books-pager-select")).toBeTruthy();
    });
});
