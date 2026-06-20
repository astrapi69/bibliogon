import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import ViewToggle from "./ViewToggle";

describe("ViewToggle", () => {
    it("renders both buttons", () => {
        render(<ViewToggle mode="grid" onChange={() => {}} />);
        expect(screen.getByTestId("view-toggle-grid")).toBeTruthy();
        expect(screen.getByTestId("view-toggle-list")).toBeTruthy();
    });

    it("marks the active mode via aria-checked", () => {
        render(<ViewToggle mode="grid" onChange={() => {}} />);
        expect(screen.getByTestId("view-toggle-grid").getAttribute("aria-checked")).toBe("true");
        expect(screen.getByTestId("view-toggle-list").getAttribute("aria-checked")).toBe("false");
    });

    it("calls onChange with 'list' when the list button is clicked", () => {
        const onChange = vi.fn();
        render(<ViewToggle mode="grid" onChange={onChange} />);
        fireEvent.click(screen.getByTestId("view-toggle-list"));
        expect(onChange).toHaveBeenCalledWith("list");
    });

    it("calls onChange with 'grid' when the grid button is clicked from list mode", () => {
        const onChange = vi.fn();
        render(<ViewToggle mode="list" onChange={onChange} />);
        fireEvent.click(screen.getByTestId("view-toggle-grid"));
        expect(onChange).toHaveBeenCalledWith("grid");
    });

    it("exposes a radiogroup role on the wrapper", () => {
        render(<ViewToggle mode="grid" onChange={() => {}} />);
        expect(screen.getByRole("radiogroup")).toBeTruthy();
    });
});
