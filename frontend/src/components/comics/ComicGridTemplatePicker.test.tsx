/**
 * ComicGridTemplatePicker tests (Phase 1, 2026-05-20).
 *
 * Pins:
 * - 6 user-facing options rendered (single_panel through grid_3x2;
 *   excludes grid_3x3)
 * - Picker reads current value + falls back to single_panel when
 *   value is null
 * - onChange fires with the selected template-id
 * - disabled prop disables the select
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {ComicGridTemplatePicker} from "./ComicGridTemplatePicker";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("ComicGridTemplatePicker", () => {
    it("renders 6 user-facing options (excludes grid_3x3)", () => {
        render(
            <ComicGridTemplatePicker
                value="single_panel"
                onChange={() => {}}
            />,
        );
        const select = screen.getByTestId(
            "comic-grid-template-picker-select",
        ) as HTMLSelectElement;
        const optionValues = Array.from(select.options).map((o) => o.value);
        expect(optionValues).toEqual([
            "single_panel",
            "grid_1x2",
            "grid_2x1",
            "grid_2x2",
            "grid_2x3",
            "grid_3x2",
        ]);
        expect(optionValues).not.toContain("grid_3x3");
    });

    it("renders each option with its data-testid for E2E targeting", () => {
        render(
            <ComicGridTemplatePicker
                value="single_panel"
                onChange={() => {}}
            />,
        );
        for (const template of [
            "single_panel",
            "grid_1x2",
            "grid_2x1",
            "grid_2x2",
            "grid_2x3",
            "grid_3x2",
        ]) {
            expect(
                screen.getByTestId(`comic-grid-template-option-${template}`),
            ).toBeInTheDocument();
        }
    });

    it("reflects the current value on the select", () => {
        render(
            <ComicGridTemplatePicker
                value="grid_2x2"
                onChange={() => {}}
            />,
        );
        const select = screen.getByTestId(
            "comic-grid-template-picker-select",
        ) as HTMLSelectElement;
        expect(select.value).toBe("grid_2x2");
    });

    it("falls back to single_panel when value is null", () => {
        render(
            <ComicGridTemplatePicker value={null} onChange={() => {}} />,
        );
        const select = screen.getByTestId(
            "comic-grid-template-picker-select",
        ) as HTMLSelectElement;
        expect(select.value).toBe("single_panel");
    });

    it("fires onChange with the selected template-id", () => {
        const onChange = vi.fn();
        render(
            <ComicGridTemplatePicker
                value="single_panel"
                onChange={onChange}
            />,
        );
        const select = screen.getByTestId(
            "comic-grid-template-picker-select",
        ) as HTMLSelectElement;
        fireEvent.change(select, {target: {value: "grid_2x2"}});
        expect(onChange).toHaveBeenCalledWith("grid_2x2");
    });

    it("disables the select when disabled prop is true", () => {
        render(
            <ComicGridTemplatePicker
                value="single_panel"
                onChange={() => {}}
                disabled={true}
            />,
        );
        const select = screen.getByTestId(
            "comic-grid-template-picker-select",
        ) as HTMLSelectElement;
        expect(select.disabled).toBe(true);
    });
});
