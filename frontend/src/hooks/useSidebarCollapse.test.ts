/**
 * Vitest coverage for useSidebarCollapse.
 *
 * Pins the viewport-aware first-run default + persistence contract:
 * - With nothing stored, defaults expanded at/above the menu
 *   breakpoint and collapsed below it.
 * - A stored preference wins over the viewport default on later mount.
 * - toggle() flips state and persists.
 */

import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {
    useSidebarCollapse,
    prefersExpandedSidebar,
    SIDEBAR_MENU_BREAKPOINT_PX,
} from "./useSidebarCollapse";

function setViewport(width: number): void {
    Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
        writable: true,
    });
}

describe("useSidebarCollapse", () => {
    const originalWidth = window.innerWidth;

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
        setViewport(originalWidth);
    });

    it("defaults expanded at the menu breakpoint", () => {
        setViewport(SIDEBAR_MENU_BREAKPOINT_PX);
        const {result} = renderHook(() => useSidebarCollapse("k"));
        expect(result.current.open).toBe(true);
    });

    it("defaults collapsed below the menu breakpoint", () => {
        setViewport(SIDEBAR_MENU_BREAKPOINT_PX - 1);
        const {result} = renderHook(() => useSidebarCollapse("k"));
        expect(result.current.open).toBe(false);
    });

    it("a stored preference overrides the viewport default", () => {
        setViewport(800);
        localStorage.setItem("k", "1");
        const {result} = renderHook(() => useSidebarCollapse("k"));
        expect(result.current.open).toBe(true);
    });

    it("toggle() flips state and persists", () => {
        setViewport(1440);
        const {result} = renderHook(() => useSidebarCollapse("k"));
        expect(result.current.open).toBe(true);
        act(() => result.current.toggle());
        expect(result.current.open).toBe(false);
        expect(localStorage.getItem("k")).toBe("0");
    });

    it("prefersExpandedSidebar tracks the breakpoint", () => {
        setViewport(1280);
        expect(prefersExpandedSidebar()).toBe(true);
        setViewport(1024);
        expect(prefersExpandedSidebar()).toBe(false);
    });
});
