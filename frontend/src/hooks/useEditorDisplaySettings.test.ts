/**
 * Vitest coverage for useEditorDisplaySettings
 * (EDITOR-DISPLAY-SETTINGS-01 C1).
 *
 * Pins:
 * - Initial state defaults when no storage; reads stored JSON on mount.
 * - Setters update state, persist to localStorage, AND apply the
 *   corresponding CSS custom property to document.documentElement.
 * - reset() returns all four to defaults + clears storage.
 * - Bad JSON / out-of-enum stored values fall back to per-key defaults.
 * - Hook recovers gracefully when localStorage throws (privacy mode).
 */

import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {
    useEditorDisplaySettings,
    DEFAULT_EDITOR_DISPLAY_SETTINGS,
} from "./useEditorDisplaySettings";

const STORAGE_KEY = "bibliogon-editor-display-settings";

function clearCssVars(): void {
    const root = document.documentElement;
    root.style.removeProperty("--editor-content-width");
    root.style.removeProperty("--editor-font-family");
    root.style.removeProperty("--editor-font-size");
    root.style.removeProperty("--editor-line-height");
}

describe("useEditorDisplaySettings", () => {
    beforeEach(() => {
        localStorage.clear();
        clearCssVars();
    });

    afterEach(() => {
        localStorage.clear();
        clearCssVars();
    });

    it("defaults to no-preference shape when nothing is stored", () => {
        const {result} = renderHook(() => useEditorDisplaySettings());
        expect(result.current.settings).toEqual(DEFAULT_EDITOR_DISPLAY_SETTINGS);
    });

    it("applies default CSS variables on mount", () => {
        renderHook(() => useEditorDisplaySettings());
        const root = document.documentElement;
        // Default width "full" → "none"
        expect(root.style.getPropertyValue("--editor-content-width")).toBe("none");
        // Default font "serif" → var(--font-display)
        expect(root.style.getPropertyValue("--editor-font-family")).toBe(
            "var(--font-display)",
        );
        expect(root.style.getPropertyValue("--editor-font-size")).toBe("1.125rem");
        expect(root.style.getPropertyValue("--editor-line-height")).toBe("1.8");
    });

    it("reads stored JSON on mount", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                width: "narrow",
                fontFamily: "sans",
                fontSize: "small",
                lineHeight: "compact",
            }),
        );
        const {result} = renderHook(() => useEditorDisplaySettings());
        expect(result.current.settings.width).toBe("narrow");
        expect(result.current.settings.fontFamily).toBe("sans");
        expect(result.current.settings.fontSize).toBe("small");
        expect(result.current.settings.lineHeight).toBe("compact");
    });

    it("applies stored CSS variables on mount", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                width: "narrow",
                fontFamily: "mono",
                fontSize: "large",
                lineHeight: "compact",
            }),
        );
        renderHook(() => useEditorDisplaySettings());
        const root = document.documentElement;
        expect(root.style.getPropertyValue("--editor-content-width")).toBe("680px");
        expect(root.style.getPropertyValue("--editor-font-family")).toBe(
            "var(--font-mono)",
        );
        expect(root.style.getPropertyValue("--editor-font-size")).toBe("1.25rem");
        expect(root.style.getPropertyValue("--editor-line-height")).toBe("1.4");
    });

    it("setWidth updates state, persists, and reapplies CSS var", () => {
        const {result} = renderHook(() => useEditorDisplaySettings());
        act(() => result.current.setWidth("medium"));
        expect(result.current.settings.width).toBe("medium");
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
        expect(stored.width).toBe("medium");
        expect(
            document.documentElement.style.getPropertyValue("--editor-content-width"),
        ).toBe("780px");
    });

    it("setFontFamily, setFontSize, setLineHeight each persist + reapply", () => {
        const {result} = renderHook(() => useEditorDisplaySettings());
        act(() => result.current.setFontFamily("sans"));
        act(() => result.current.setFontSize("small"));
        act(() => result.current.setLineHeight("normal"));
        expect(result.current.settings.fontFamily).toBe("sans");
        expect(result.current.settings.fontSize).toBe("small");
        expect(result.current.settings.lineHeight).toBe("normal");
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
        expect(stored).toMatchObject({
            fontFamily: "sans",
            fontSize: "small",
            lineHeight: "normal",
        });
    });

    it("reset() returns all four to defaults and clears + re-writes storage", () => {
        const {result} = renderHook(() => useEditorDisplaySettings());
        act(() => result.current.setWidth("narrow"));
        act(() => result.current.setFontFamily("mono"));
        act(() => result.current.reset());
        expect(result.current.settings).toEqual(DEFAULT_EDITOR_DISPLAY_SETTINGS);
        // Storage carries the default shape (not removed) — keeps
        // the "no preference set" / "explicitly default" semantics
        // explicit.
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
        expect(stored).toEqual(DEFAULT_EDITOR_DISPLAY_SETTINGS);
    });

    it("falls back to defaults on bad JSON in storage", () => {
        localStorage.setItem(STORAGE_KEY, "{not-json");
        const {result} = renderHook(() => useEditorDisplaySettings());
        expect(result.current.settings).toEqual(DEFAULT_EDITOR_DISPLAY_SETTINGS);
    });

    it("falls back to per-key defaults on out-of-enum stored values", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                width: "huge", // invalid
                fontFamily: "comic", // invalid
                fontSize: "small", // valid
                lineHeight: "double", // invalid
            }),
        );
        const {result} = renderHook(() => useEditorDisplaySettings());
        expect(result.current.settings.width).toBe(
            DEFAULT_EDITOR_DISPLAY_SETTINGS.width,
        );
        expect(result.current.settings.fontFamily).toBe(
            DEFAULT_EDITOR_DISPLAY_SETTINGS.fontFamily,
        );
        expect(result.current.settings.fontSize).toBe("small");
        expect(result.current.settings.lineHeight).toBe(
            DEFAULT_EDITOR_DISPLAY_SETTINGS.lineHeight,
        );
    });

    it("hook recovers gracefully when localStorage.getItem throws", () => {
        const original = localStorage.getItem.bind(localStorage);
        const spy = vi
            .spyOn(Storage.prototype, "getItem")
            .mockImplementation(() => {
                throw new Error("privacy mode");
            });
        const {result} = renderHook(() => useEditorDisplaySettings());
        expect(result.current.settings).toEqual(DEFAULT_EDITOR_DISPLAY_SETTINGS);
        spy.mockRestore();
        // ensure subsequent reads still work
        expect(original(STORAGE_KEY)).toBeNull();
    });

    it("hook recovers gracefully when localStorage.setItem throws", () => {
        const spy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(() => {
                throw new Error("quota exceeded");
            });
        const {result} = renderHook(() => useEditorDisplaySettings());
        // setter does not throw; in-session state still updates
        act(() => result.current.setWidth("wide"));
        expect(result.current.settings.width).toBe("wide");
        spy.mockRestore();
    });
});
