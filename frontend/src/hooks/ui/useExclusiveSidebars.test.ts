/**
 * Vitest coverage for useExclusiveSidebars (issue #273, 3c).
 *
 * Pins the mobile mutual-exclusion contract for the BookEditor's pair
 * of overlay sidebars (left ChapterSidebar + right StoryBibleSidebar):
 * - below the 768px breakpoint, opening one panel closes the other;
 * - at/above the breakpoint both handlers are plain pass-throughs (no
 *   desktop behaviour change).
 *
 * The hook does not own state (BookEditor passes the setters in), so
 * the harness mirrors the real wiring: a left open-flag + toggle, a
 * right open-flag + setter.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, useCallback } from "react";
import { useExclusiveSidebars } from "./useExclusiveSidebars";
import { SIDEBAR_MOBILE_BREAKPOINT_PX } from "./useSidebarCollapse";

function setViewport(width: number): void {
    Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
        writable: true,
    });
}

function useHarness() {
    const [leftOpen, setLeftOpen] = useState(false);
    const [rightOpen, setRightOpen] = useState(false);
    const toggleLeft = useCallback(() => setLeftOpen((v) => !v), []);
    const wrapped = useExclusiveSidebars(leftOpen, toggleLeft, setLeftOpen, setRightOpen);
    return { leftOpen, rightOpen, setRightOpen, ...wrapped };
}

describe("useExclusiveSidebars", () => {
    const originalWidth = window.innerWidth;

    afterEach(() => {
        setViewport(originalWidth);
        vi.restoreAllMocks();
    });

    it("opening the left panel closes the right below the breakpoint", () => {
        setViewport(SIDEBAR_MOBILE_BREAKPOINT_PX - 1);
        const { result } = renderHook(() => useHarness());

        act(() => result.current.setRightOpen(true));
        expect(result.current.rightOpen).toBe(true);

        act(() => result.current.toggleLeft());
        expect(result.current.leftOpen).toBe(true);
        expect(result.current.rightOpen).toBe(false);
    });

    it("opening the right panel closes the left below the breakpoint", () => {
        setViewport(SIDEBAR_MOBILE_BREAKPOINT_PX - 1);
        const { result } = renderHook(() => useHarness());

        act(() => result.current.toggleLeft());
        expect(result.current.leftOpen).toBe(true);

        act(() => result.current.openRight());
        expect(result.current.rightOpen).toBe(true);
        expect(result.current.leftOpen).toBe(false);
    });

    it("both panels may stay open at/above the breakpoint", () => {
        setViewport(SIDEBAR_MOBILE_BREAKPOINT_PX);
        const { result } = renderHook(() => useHarness());

        act(() => result.current.toggleLeft());
        act(() => result.current.openRight());
        expect(result.current.leftOpen).toBe(true);
        expect(result.current.rightOpen).toBe(true);
    });

    it("closing the left panel never reopens the right", () => {
        setViewport(SIDEBAR_MOBILE_BREAKPOINT_PX - 1);
        const { result } = renderHook(() => useHarness());

        act(() => result.current.toggleLeft());
        expect(result.current.leftOpen).toBe(true);

        act(() => result.current.toggleLeft());
        expect(result.current.leftOpen).toBe(false);
        expect(result.current.rightOpen).toBe(false);
    });
});
