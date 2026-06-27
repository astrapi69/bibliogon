/**
 * Tests for GlobalShortcuts (#662): the app-global combos + dialog owner.
 *
 * Covers: Ctrl+/ and ? open the overview dialog, Ctrl+S surfaces the
 * auto-save reminder (and does not open the dialog), and route-derived
 * editor scope drives which shortcuts the dialog lists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import GlobalShortcuts from "./GlobalShortcuts";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const toggleWordWrap = vi.fn();
vi.mock("../../hooks/editor/useWordWrap", () => ({
    useWordWrap: () => ({ toggle: toggleWordWrap }),
}));

const notifyInfo = vi.fn();
vi.mock("../../utils/platform/notify", () => ({
    notify: { info: (...args: unknown[]) => notifyInfo(...args) },
}));

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <GlobalShortcuts />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    toggleWordWrap.mockClear();
    notifyInfo.mockClear();
});

describe("GlobalShortcuts", () => {
    it("opens the dialog on Ctrl+/", () => {
        renderAt("/");
        expect(screen.queryByTestId("shortcuts-dialog")).toBeNull();
        fireEvent.keyDown(window, { key: "/", ctrlKey: true });
        expect(screen.getByTestId("shortcuts-dialog")).toBeTruthy();
    });

    it("opens the dialog on ?", () => {
        renderAt("/");
        fireEvent.keyDown(window, { key: "?", shiftKey: true });
        expect(screen.getByTestId("shortcuts-dialog")).toBeTruthy();
    });

    it("Ctrl+S surfaces the auto-save reminder and does not open the dialog", () => {
        renderAt("/");
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
        expect(notifyInfo).toHaveBeenCalledWith("Auto-Speichern ist aktiv");
        expect(screen.queryByTestId("shortcuts-dialog")).toBeNull();
    });

    it("Alt+Z toggles word wrap", () => {
        renderAt("/");
        fireEvent.keyDown(window, { key: "z", altKey: true });
        expect(toggleWordWrap).toHaveBeenCalledTimes(1);
    });

    it("lists editor shortcuts only on an editor route", () => {
        const { unmount } = renderAt("/");
        fireEvent.keyDown(window, { key: "/", ctrlKey: true });
        expect(screen.queryByTestId("shortcuts-row-Ctrl+B")).toBeNull();
        unmount();

        renderAt("/book/abc123");
        fireEvent.keyDown(window, { key: "/", ctrlKey: true });
        expect(screen.getByTestId("shortcuts-row-Ctrl+B")).toBeTruthy();
    });
});
