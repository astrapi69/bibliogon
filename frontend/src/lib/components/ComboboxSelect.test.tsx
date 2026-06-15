import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ComboboxSelect, type ComboboxSelectOption } from "./ComboboxSelect";

const OPTIONS: ComboboxSelectOption[] = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "English" },
    { value: "fr", label: "Français" },
];

describe("ComboboxSelect", () => {
    it("renders all options once opened", () => {
        render(
            <ComboboxSelect
                options={OPTIONS}
                value="de"
                onChange={vi.fn()}
                testId="combo"
            />,
        );
        fireEvent.focus(screen.getByTestId("combo"));
        expect(screen.getByTestId("combo-option-de")).toBeTruthy();
        expect(screen.getByTestId("combo-option-en")).toBeTruthy();
        expect(screen.getByTestId("combo-option-fr")).toBeTruthy();
    });

    it("filters options as the user types (case-insensitive)", () => {
        render(
            <ComboboxSelect
                options={OPTIONS}
                value="de"
                onChange={vi.fn()}
                testId="combo"
            />,
        );
        const input = screen.getByTestId("combo") as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "eng" } });
        expect(screen.getByTestId("combo-option-en")).toBeTruthy();
        expect(screen.queryByTestId("combo-option-de")).toBeNull();
        expect(screen.queryByTestId("combo-option-fr")).toBeNull();
    });

    it("selects an option via click", () => {
        const onChange = vi.fn();
        render(
            <ComboboxSelect
                options={OPTIONS}
                value="de"
                onChange={onChange}
                testId="combo"
            />,
        );
        fireEvent.focus(screen.getByTestId("combo"));
        fireEvent.mouseDown(screen.getByTestId("combo-option-en"));
        expect(onChange).toHaveBeenCalledWith("en");
    });

    it("commits a custom value when allowCustom is set", () => {
        const onChange = vi.fn();
        const onCustomAdd = vi.fn();
        render(
            <ComboboxSelect
                options={OPTIONS}
                value="de"
                onChange={onChange}
                onCustomAdd={onCustomAdd}
                allowCustom
                testId="combo"
            />,
        );
        const input = screen.getByTestId("combo") as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "Latin" } });
        fireEvent.mouseDown(screen.getByTestId("combo-custom-add"));
        expect(onChange).toHaveBeenCalledWith("Latin");
        expect(onCustomAdd).toHaveBeenCalledWith("Latin");
    });

    it("rejects a custom value shorter than 2 chars", () => {
        render(
            <ComboboxSelect
                options={OPTIONS}
                value="de"
                onChange={vi.fn()}
                allowCustom
                testId="combo"
            />,
        );
        const input = screen.getByTestId("combo") as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "x" } });
        expect(screen.queryByTestId("combo-custom-add")).toBeNull();
    });

    it("does not offer a custom add for allowCustom=false", () => {
        render(
            <ComboboxSelect
                options={OPTIONS}
                value="de"
                onChange={vi.fn()}
                testId="combo"
            />,
        );
        const input = screen.getByTestId("combo") as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "Latin" } });
        expect(screen.queryByTestId("combo-custom-add")).toBeNull();
    });
});
