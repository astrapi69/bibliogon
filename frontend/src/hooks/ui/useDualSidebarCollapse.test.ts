/**
 * Vitest coverage for useDualSidebarCollapse.
 *
 * Pins the mobile mutual-exclusion contract layered on top of the two
 * useSidebarCollapse slots:
 * - below the exclusive breakpoint, opening one sidebar collapses the
 *   other;
 * - at/above it, both may be open at once;
 * - closing a sidebar never reopens the other.
 */

import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {
    useDualSidebarCollapse,
    SIDEBAR_EXCLUSIVE_BREAKPOINT_PX,
} from "./useDualSidebarCollapse";

function setViewport(width: number): void {
    Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
        writable: true,
    });
}

describe("useDualSidebarCollapse", () => {
    const originalWidth = window.innerWidth;

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
        setViewport(originalWidth);
    });

    it("opening one collapses the other below the exclusive breakpoint", () => {
        setViewport(SIDEBAR_EXCLUSIVE_BREAKPOINT_PX - 1);
        const {result} = renderHook(() =>
            useDualSidebarCollapse("left", "right"),
        );

        act(() => result.current.left.setOpen(false));
        act(() => result.current.right.setOpen(false));
        act(() => result.current.left.toggle());
        expect(result.current.left.open).toBe(true);
        expect(result.current.right.open).toBe(false);

        act(() => result.current.right.toggle());
        expect(result.current.right.open).toBe(true);
        expect(result.current.left.open).toBe(false);
    });

    it("both may stay open at/above the exclusive breakpoint", () => {
        setViewport(SIDEBAR_EXCLUSIVE_BREAKPOINT_PX);
        const {result} = renderHook(() =>
            useDualSidebarCollapse("left", "right"),
        );

        act(() => result.current.left.setOpen(false));
        act(() => result.current.right.setOpen(false));
        act(() => result.current.left.toggle());
        act(() => result.current.right.toggle());
        expect(result.current.left.open).toBe(true);
        expect(result.current.right.open).toBe(true);
    });

    it("closing a sidebar leaves the other untouched", () => {
        setViewport(SIDEBAR_EXCLUSIVE_BREAKPOINT_PX - 1);
        const {result} = renderHook(() =>
            useDualSidebarCollapse("left", "right"),
        );

        act(() => result.current.left.setOpen(true));
        act(() => result.current.right.setOpen(false));
        act(() => result.current.left.toggle());
        expect(result.current.left.open).toBe(false);
        expect(result.current.right.open).toBe(false);
    });
});
