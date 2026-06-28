/**
 * Tests for ShortcutsDialog (#662): the keyboard-shortcuts overview modal.
 *
 * Covers: rendering the registered shortcuts grouped by section,
 * context-awareness (editor shortcuts hidden off editor routes), the
 * search filter, the empty state, and Escape-to-close.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import ShortcutsDialog from "./ShortcutsDialog";

// Mock useI18n to return the fallback (mirrors AppDialog.test).
vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function renderDialog(props: Partial<React.ComponentProps<typeof ShortcutsDialog>> = {}) {
    const onOpenChange = vi.fn();
    render(
        <ShortcutsDialog
            open
            onOpenChange={onOpenChange}
            editorScope
            {...props}
        />,
    );
    return { onOpenChange };
}

describe("ShortcutsDialog", () => {
    it("renders the dialog with app + editor shortcuts in editor scope", () => {
        renderDialog({ editorScope: true });
        expect(screen.getByTestId("shortcuts-dialog")).toBeTruthy();
        // App-section shortcut
        expect(screen.getByTestId("shortcuts-row-Ctrl+/")).toBeTruthy();
        // Editor-section shortcut (only visible in editor scope)
        expect(screen.getByTestId("shortcuts-row-Ctrl+B")).toBeTruthy();
        // The new Ctrl+S row with its auto-save reminder note (fallback DE)
        const saveRow = screen.getByTestId("shortcuts-row-Ctrl+S");
        expect(within(saveRow).getByText(/auto-speichern ist aktiv/i)).toBeTruthy();
    });

    it("hides editor-section shortcuts outside editor scope", () => {
        renderDialog({ editorScope: false });
        // App shortcuts still present
        expect(screen.getByTestId("shortcuts-row-Ctrl+/")).toBeTruthy();
        // Editor-only formatting shortcuts are not rendered
        expect(screen.queryByTestId("shortcuts-row-Ctrl+B")).toBeNull();
        expect(screen.queryByTestId("shortcuts-row-Ctrl+I")).toBeNull();
    });

    it("filters the list via the search field", () => {
        renderDialog({ editorScope: true });
        const search = screen.getByTestId("shortcuts-search") as HTMLInputElement;
        // Match against the label (DE fallback "Kursiv" for Ctrl+I).
        fireEvent.change(search, { target: { value: "kursiv" } });
        // The matching editor shortcut survives...
        expect(screen.getByTestId("shortcuts-row-Ctrl+I")).toBeTruthy();
        // ...while non-matching rows are filtered out.
        expect(screen.queryByTestId("shortcuts-row-Ctrl+B")).toBeNull();
        expect(screen.queryByTestId("shortcuts-row-Ctrl+/")).toBeNull();
    });

    it("matches on the key combo as well as the label", () => {
        renderDialog({ editorScope: true });
        const search = screen.getByTestId("shortcuts-search") as HTMLInputElement;
        fireEvent.change(search, { target: { value: "alt" } });
        expect(screen.getByTestId("shortcuts-row-Alt+Z")).toBeTruthy();
        expect(screen.queryByTestId("shortcuts-row-Ctrl+B")).toBeNull();
    });

    it("shows an empty state when nothing matches", () => {
        renderDialog({ editorScope: true });
        const search = screen.getByTestId("shortcuts-search") as HTMLInputElement;
        fireEvent.change(search, { target: { value: "zzzzz-nope" } });
        expect(screen.getByTestId("shortcuts-empty")).toBeTruthy();
        expect(screen.queryByTestId("shortcuts-row-Ctrl+/")).toBeNull();
    });

    it("requests close on Escape", () => {
        const { onOpenChange } = renderDialog({ editorScope: true });
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("requests close via the close button", () => {
        const { onOpenChange } = renderDialog({ editorScope: true });
        fireEvent.click(screen.getByTestId("shortcuts-close"));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
