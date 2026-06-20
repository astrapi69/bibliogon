/**
 * Vitest coverage for EditorDisplaySettingsPopover
 * (EDITOR-DISPLAY-SETTINGS-01 C2).
 *
 * Pins:
 *   - Toggle button renders; clicking it opens + closes the panel.
 *   - Open panel exposes 4 selects + reset button + all 4 testids.
 *   - Each select reflects the current value + fires the typed
 *     onChange with the new enum value.
 *   - Reset button fires onReset.
 *   - Click-outside closes the panel.
 *   - Escape key closes the panel.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import EditorDisplaySettingsPopover from "./EditorDisplaySettingsPopover";
import {DEFAULT_EDITOR_DISPLAY_SETTINGS} from "../../hooks/editor/useEditorDisplaySettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

const baseProps = {
    settings: DEFAULT_EDITOR_DISPLAY_SETTINGS,
    onWidthChange: vi.fn(),
    onFontFamilyChange: vi.fn(),
    onFontSizeChange: vi.fn(),
    onLineHeightChange: vi.fn(),
    onReset: vi.fn(),
};

describe("EditorDisplaySettingsPopover", () => {
    it("renders the trigger button (panel hidden by default)", () => {
        render(<EditorDisplaySettingsPopover {...baseProps} />);
        expect(screen.getByTestId("editor-display-settings-toggle")).toBeTruthy();
        expect(screen.queryByTestId("editor-display-settings-panel")).toBeNull();
    });

    it("clicking the toggle opens the panel + shows all 4 selects + reset", () => {
        render(<EditorDisplaySettingsPopover {...baseProps} />);
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        expect(screen.getByTestId("editor-display-settings-panel")).toBeTruthy();
        expect(screen.getByTestId("editor-display-settings-width-trigger")).toBeTruthy();
        expect(screen.getByTestId("editor-display-settings-font-trigger")).toBeTruthy();
        expect(screen.getByTestId("editor-display-settings-size-trigger")).toBeTruthy();
        expect(screen.getByTestId("editor-display-settings-line-trigger")).toBeTruthy();
        expect(screen.getByTestId("editor-display-settings-reset")).toBeTruthy();
    });

    it("clicking the toggle a second time closes the panel", () => {
        render(<EditorDisplaySettingsPopover {...baseProps} />);
        const toggle = screen.getByTestId("editor-display-settings-toggle");
        fireEvent.click(toggle);
        fireEvent.click(toggle);
        expect(screen.queryByTestId("editor-display-settings-panel")).toBeNull();
    });

    it("width select reflects the current setting + fires onWidthChange", () => {
        const onWidthChange = vi.fn();
        render(
            <EditorDisplaySettingsPopover
                {...baseProps}
                onWidthChange={onWidthChange}
                settings={{...DEFAULT_EDITOR_DISPLAY_SETTINGS, width: "narrow"}}
            />,
        );
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        const select = screen.getByTestId(
            "editor-display-settings-width-trigger",
        ) as HTMLSelectElement;
        expect(select.value).toBe("narrow");
        fireEvent.change(select, {target: {value: "medium"}});
        expect(onWidthChange).toHaveBeenCalledWith("medium");
    });

    it("font select fires onFontFamilyChange with the typed enum value", () => {
        const onFontFamilyChange = vi.fn();
        render(
            <EditorDisplaySettingsPopover
                {...baseProps}
                onFontFamilyChange={onFontFamilyChange}
            />,
        );
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        fireEvent.change(
            screen.getByTestId("editor-display-settings-font-trigger"),
            {target: {value: "mono"}},
        );
        expect(onFontFamilyChange).toHaveBeenCalledWith("mono");
    });

    it("size select fires onFontSizeChange", () => {
        const onFontSizeChange = vi.fn();
        render(
            <EditorDisplaySettingsPopover
                {...baseProps}
                onFontSizeChange={onFontSizeChange}
            />,
        );
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        fireEvent.change(
            screen.getByTestId("editor-display-settings-size-trigger"),
            {target: {value: "large"}},
        );
        expect(onFontSizeChange).toHaveBeenCalledWith("large");
    });

    it("line select fires onLineHeightChange", () => {
        const onLineHeightChange = vi.fn();
        render(
            <EditorDisplaySettingsPopover
                {...baseProps}
                onLineHeightChange={onLineHeightChange}
            />,
        );
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        fireEvent.change(
            screen.getByTestId("editor-display-settings-line-trigger"),
            {target: {value: "compact"}},
        );
        expect(onLineHeightChange).toHaveBeenCalledWith("compact");
    });

    it("reset button fires onReset", () => {
        const onReset = vi.fn();
        render(<EditorDisplaySettingsPopover {...baseProps} onReset={onReset} />);
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        fireEvent.click(screen.getByTestId("editor-display-settings-reset"));
        expect(onReset).toHaveBeenCalled();
    });

    it("click-outside closes the panel", () => {
        render(
            <div>
                <button type="button" data-testid="outside-target">outside</button>
                <EditorDisplaySettingsPopover {...baseProps} />
            </div>,
        );
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        expect(screen.getByTestId("editor-display-settings-panel")).toBeTruthy();
        fireEvent.mouseDown(screen.getByTestId("outside-target"));
        expect(screen.queryByTestId("editor-display-settings-panel")).toBeNull();
    });

    it("Escape key closes the panel", () => {
        render(<EditorDisplaySettingsPopover {...baseProps} />);
        fireEvent.click(screen.getByTestId("editor-display-settings-toggle"));
        expect(screen.getByTestId("editor-display-settings-panel")).toBeTruthy();
        fireEvent.keyDown(document, {key: "Escape"});
        expect(screen.queryByTestId("editor-display-settings-panel")).toBeNull();
    });

    it("custom data-testid override scopes both toggle + panel + sub-testids", () => {
        render(<EditorDisplaySettingsPopover {...baseProps} data-testid="book-eds" />);
        expect(screen.getByTestId("book-eds")).toBeTruthy();
        expect(screen.getByTestId("book-eds-toggle")).toBeTruthy();
        fireEvent.click(screen.getByTestId("book-eds-toggle"));
        expect(screen.getByTestId("book-eds-panel")).toBeTruthy();
        expect(screen.getByTestId("book-eds-width-trigger")).toBeTruthy();
    });
});
