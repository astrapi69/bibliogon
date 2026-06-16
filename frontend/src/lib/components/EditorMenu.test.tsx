import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EditorMenu, type EditorMenuGroup } from "./EditorMenu";

const groups: EditorMenuGroup[] = [
    {
        label: "Datei",
        items: [
            { id: "save", label: "Speichern", shortcut: "Ctrl+S" },
            { separator: true },
            {
                label: "Exportieren",
                submenu: [
                    { id: "export-pdf", label: "PDF" },
                    { id: "export-epub", label: "EPUB" },
                ],
            },
        ],
    },
    {
        label: "Werkzeuge",
        items: [{ id: "ai-template", label: "KI-Vorlage" }],
    },
];

function setup(extra?: { disabled?: Record<string, string> }) {
    const onAction = vi.fn();
    render(
        <EditorMenu
            groups={groups}
            onAction={onAction}
            disabled={extra?.disabled}
            triggerLabel="Menü"
            testIdPrefix="m"
        />,
    );
    return { onAction };
}

describe("EditorMenu", () => {
    it("is closed initially and opens on trigger click", () => {
        setup();
        expect(screen.queryByTestId("m-panel")).toBeNull();
        fireEvent.click(screen.getByTestId("m-trigger"));
        expect(screen.getByTestId("m-panel")).toBeTruthy();
    });

    it("renders group labels, an action, its shortcut, and a separator", () => {
        setup();
        fireEvent.click(screen.getByTestId("m-trigger"));
        expect(screen.getByTestId("m-group-0").textContent).toBe("Datei");
        expect(screen.getByTestId("m-group-1").textContent).toBe("Werkzeuge");
        const save = screen.getByTestId("m-item-save");
        expect(save.textContent).toContain("Speichern");
        expect(save.textContent).toContain("Ctrl+S");
        expect(screen.getByTestId("m-panel").querySelectorAll("hr").length).toBeGreaterThan(0);
    });

    it("fires onAction with the item id and closes after a click", () => {
        const { onAction } = setup();
        fireEvent.click(screen.getByTestId("m-trigger"));
        fireEvent.click(screen.getByTestId("m-item-save"));
        expect(onAction).toHaveBeenCalledTimes(1);
        expect(onAction).toHaveBeenCalledWith("save");
        expect(screen.queryByTestId("m-panel")).toBeNull();
    });

    it("renders a disabled item with its reason tooltip and does not fire onAction", () => {
        const { onAction } = setup({ disabled: { "ai-template": "KI-Anbieter konfigurieren" } });
        fireEvent.click(screen.getByTestId("m-trigger"));
        const item = screen.getByTestId("m-item-ai-template") as HTMLButtonElement;
        expect(item.disabled).toBe(true);
        expect(item.getAttribute("title")).toBe("KI-Anbieter konfigurieren");
        fireEvent.click(item);
        expect(onAction).not.toHaveBeenCalled();
    });

    it("expands a submenu and fires onAction for a sub-item", () => {
        const { onAction } = setup();
        fireEvent.click(screen.getByTestId("m-trigger"));
        // Sub-items hidden until the submenu is expanded.
        expect(screen.queryByTestId("m-item-export-pdf")).toBeNull();
        fireEvent.click(screen.getByTestId("m-submenu-0-Exportieren"));
        expect(screen.getByTestId("m-item-export-pdf")).toBeTruthy();
        fireEvent.click(screen.getByTestId("m-item-export-pdf"));
        expect(onAction).toHaveBeenCalledWith("export-pdf");
    });

    it("closes on Escape", () => {
        setup();
        fireEvent.click(screen.getByTestId("m-trigger"));
        expect(screen.getByTestId("m-panel")).toBeTruthy();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByTestId("m-panel")).toBeNull();
    });

    it("closes on an outside click", () => {
        setup();
        fireEvent.click(screen.getByTestId("m-trigger"));
        expect(screen.getByTestId("m-panel")).toBeTruthy();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByTestId("m-panel")).toBeNull();
    });
});
