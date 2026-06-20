/**
 * Tests for FullscreenButton.
 *
 * Coverage:
 * - Renders when fullscreen.isSupported is true.
 * - Does NOT render when fullscreen.isSupported is false (returns
 *   null — clean degradation on unsupported browsers).
 * - Maximize2 icon when not in fullscreen; Minimize2 icon when in
 *   fullscreen. aria-pressed reflects the state.
 * - Click invokes fullscreen.toggle().
 * - Testid prefix renders correctly.
 * - className defaults to btn-icon; overridable.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import FullscreenButton from "./FullscreenButton";

const mockToggle = vi.fn();
const mockState = {
    isSupported: true,
    isFullscreen: false,
    toggle: mockToggle,
};

vi.mock("../hooks/ui/useFullscreenToggle", () => ({
    useFullscreenToggle: () => mockState,
}));

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));

describe("FullscreenButton", () => {
    beforeEach(() => {
        mockToggle.mockClear();
        mockState.isSupported = true;
        mockState.isFullscreen = false;
    });

    it("renders when fullscreen.isSupported is true", () => {
        render(<FullscreenButton testidPrefix="dashboard" />);
        expect(screen.getByTestId("dashboard-fullscreen")).toBeInTheDocument();
    });

    it("does NOT render when fullscreen.isSupported is false", () => {
        mockState.isSupported = false;
        render(<FullscreenButton testidPrefix="dashboard" />);
        expect(
            screen.queryByTestId("dashboard-fullscreen"),
        ).not.toBeInTheDocument();
    });

    it("uses the testidPrefix in the data-testid", () => {
        render(<FullscreenButton testidPrefix="article-list" />);
        expect(
            screen.getByTestId("article-list-fullscreen"),
        ).toBeInTheDocument();
    });

    it("defaults className to btn-icon", () => {
        render(<FullscreenButton testidPrefix="dashboard" />);
        expect(screen.getByTestId("dashboard-fullscreen")).toHaveClass(
            "btn-icon",
        );
    });

    it("accepts a custom className override (editor variant)", () => {
        render(
            <FullscreenButton
                testidPrefix="page-editor"
                className="btn btn-secondary btn-sm"
            />,
        );
        const btn = screen.getByTestId("page-editor-fullscreen");
        expect(btn).toHaveClass("btn", "btn-secondary", "btn-sm");
    });

    it("aria-pressed reflects the fullscreen state (default: false)", () => {
        render(<FullscreenButton testidPrefix="dashboard" />);
        expect(
            screen.getByTestId("dashboard-fullscreen").getAttribute("aria-pressed"),
        ).toBe("false");
    });

    it("aria-pressed=true when in fullscreen mode", () => {
        mockState.isFullscreen = true;
        render(<FullscreenButton testidPrefix="dashboard" />);
        expect(
            screen.getByTestId("dashboard-fullscreen").getAttribute("aria-pressed"),
        ).toBe("true");
    });

    it("click invokes fullscreen.toggle()", () => {
        render(<FullscreenButton testidPrefix="dashboard" />);
        fireEvent.click(screen.getByTestId("dashboard-fullscreen"));
        expect(mockToggle).toHaveBeenCalledTimes(1);
    });

    it("aria-label changes between enter/exit per state", () => {
        const {rerender} = render(
            <FullscreenButton testidPrefix="dashboard" />,
        );
        expect(
            screen.getByTestId("dashboard-fullscreen").getAttribute("aria-label"),
        ).toBe("Vollbild");
        mockState.isFullscreen = true;
        rerender(<FullscreenButton testidPrefix="dashboard" />);
        expect(
            screen.getByTestId("dashboard-fullscreen").getAttribute("aria-label"),
        ).toBe("Vollbild verlassen");
    });

    it("title includes the Esc/F11 exit hint when in fullscreen mode", () => {
        // User direction (2026-05-28): the exit tooltip MUST
        // mention both Esc and F11 so users know the shortcuts.
        // Regression pin so a future refactor cannot silently
        // drop the hint and reintroduce the discoverability gap.
        mockState.isFullscreen = true;
        render(<FullscreenButton testidPrefix="dashboard" />);
        const title = screen
            .getByTestId("dashboard-fullscreen")
            .getAttribute("title");
        expect(title).toContain("Vollbild verlassen");
        expect(title).toContain("Esc oder F11 zum Beenden");
    });

    it("title does NOT include the exit hint when NOT in fullscreen", () => {
        // Esc / F11 only apply on the EXIT path. Mentioning them
        // before the user has entered fullscreen would be noise.
        mockState.isFullscreen = false;
        render(<FullscreenButton testidPrefix="dashboard" />);
        const title = screen
            .getByTestId("dashboard-fullscreen")
            .getAttribute("title");
        expect(title).toBe("Vollbild");
        expect(title).not.toContain("Esc");
        expect(title).not.toContain("F11");
    });
});
