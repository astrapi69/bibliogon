/**
 * CategoryInput tests (Bug 9). Pins the chip-list + add-input
 * surface + the case-insensitive dedup matching the server-side
 * coercion contract.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import CategoryInput from "./CategoryInput";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("CategoryInput", () => {
    it("renders root + add input when categories is empty", () => {
        render(<CategoryInput categories={[]} onChange={() => {}} />);
        expect(screen.getByTestId("category-input")).toBeTruthy();
        expect(screen.getByTestId("category-input-add")).toBeTruthy();
        expect(screen.queryByTestId("category-input-chip-list")).toBeNull();
    });

    it("renders one chip per category", () => {
        render(
            <CategoryInput
                categories={["Fiction", "Fantasy", "Mystery"]}
                onChange={() => {}}
            />,
        );
        expect(screen.getByTestId("category-chip-0").textContent).toContain(
            "Fiction",
        );
        expect(screen.getByTestId("category-chip-2").textContent).toContain(
            "Mystery",
        );
    });

    it("Add button is disabled when draft is empty + enables on input", () => {
        render(<CategoryInput categories={[]} onChange={() => {}} />);
        const btn = screen.getByTestId("category-input-add-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        fireEvent.change(screen.getByTestId("category-input-add"), {
            target: {value: "Fiction"},
        });
        expect(btn.disabled).toBe(false);
    });

    it("clicking Add appends a category + clears the draft", () => {
        const onChange = vi.fn();
        render(<CategoryInput categories={["Fiction"]} onChange={onChange} />);
        const input = screen.getByTestId("category-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Fantasy"}});
        fireEvent.click(screen.getByTestId("category-input-add-button"));
        expect(onChange).toHaveBeenCalledWith(["Fiction", "Fantasy"]);
        expect(input.value).toBe("");
    });

    it("Enter key adds the category", () => {
        const onChange = vi.fn();
        render(<CategoryInput categories={[]} onChange={onChange} />);
        const input = screen.getByTestId("category-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Solo"}});
        fireEvent.keyDown(input, {key: "Enter"});
        expect(onChange).toHaveBeenCalledWith(["Solo"]);
    });

    it("dedups case-insensitively (does NOT call onChange on duplicate)", () => {
        const onChange = vi.fn();
        render(<CategoryInput categories={["Fiction"]} onChange={onChange} />);
        const input = screen.getByTestId("category-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "fiction"}});
        fireEvent.click(screen.getByTestId("category-input-add-button"));
        expect(onChange).not.toHaveBeenCalled();
        // Draft still clears so the user sees the dedup took effect.
        expect(input.value).toBe("");
    });

    it("trims whitespace before appending", () => {
        const onChange = vi.fn();
        render(<CategoryInput categories={[]} onChange={onChange} />);
        const input = screen.getByTestId("category-input-add") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "  Padded  "}});
        fireEvent.click(screen.getByTestId("category-input-add-button"));
        expect(onChange).toHaveBeenCalledWith(["Padded"]);
    });

    it("delete button removes the targeted chip", () => {
        const onChange = vi.fn();
        render(
            <CategoryInput
                categories={["Fiction", "Fantasy", "Mystery"]}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("category-chip-1-delete"));
        expect(onChange).toHaveBeenCalledWith(["Fiction", "Mystery"]);
    });

    it("renders the datalist only when suggestions are provided", () => {
        const {rerender} = render(
            <CategoryInput categories={[]} onChange={() => {}} />,
        );
        expect(screen.queryByTestId("category-input-datalist")).toBeNull();
        rerender(
            <CategoryInput
                categories={[]}
                onChange={() => {}}
                suggestions={["Fiction", "Non-Fiction"]}
            />,
        );
        expect(screen.getByTestId("category-input-datalist")).toBeTruthy();
    });
});
