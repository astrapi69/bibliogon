/**
 * Vitest coverage for useWordWrap hook
 * (EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01 C1).
 *
 * Pins:
 * - Initial state reads from localStorage ("1" = disabled).
 * - toggle() flips state and updates localStorage.
 * - Body class .no-word-wrap is applied / removed in sync with state.
 * - Hook recovers gracefully when localStorage throws (privacy mode).
 */

import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {useWordWrap} from "./useWordWrap";

const STORAGE_KEY = "bibliogon-word-wrap-disabled";
const BODY_CLASS = "no-word-wrap";

describe("useWordWrap", () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.classList.remove(BODY_CLASS);
    });

    afterEach(() => {
        localStorage.clear();
        document.body.classList.remove(BODY_CLASS);
    });

    it("defaults to wrap-enabled when nothing is stored", () => {
        const {result} = renderHook(() => useWordWrap());
        expect(result.current.disabled).toBe(false);
        expect(document.body.classList.contains(BODY_CLASS)).toBe(false);
    });

    it("reads stored value on mount and applies body class", () => {
        localStorage.setItem(STORAGE_KEY, "1");
        const {result} = renderHook(() => useWordWrap());
        expect(result.current.disabled).toBe(true);
        expect(document.body.classList.contains(BODY_CLASS)).toBe(true);
    });

    it("toggle() flips state from enabled → disabled", () => {
        const {result} = renderHook(() => useWordWrap());
        act(() => result.current.toggle());
        expect(result.current.disabled).toBe(true);
        expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
        expect(document.body.classList.contains(BODY_CLASS)).toBe(true);
    });

    it("toggle() flips state from disabled → enabled and clears storage", () => {
        localStorage.setItem(STORAGE_KEY, "1");
        const {result} = renderHook(() => useWordWrap());
        act(() => result.current.toggle());
        expect(result.current.disabled).toBe(false);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect(document.body.classList.contains(BODY_CLASS)).toBe(false);
    });

    it("two consecutive toggles return to the original state", () => {
        const {result} = renderHook(() => useWordWrap());
        act(() => result.current.toggle());
        act(() => result.current.toggle());
        expect(result.current.disabled).toBe(false);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect(document.body.classList.contains(BODY_CLASS)).toBe(false);
    });

    it("recovers gracefully when localStorage.getItem throws", () => {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = () => {
            throw new Error("privacy mode");
        };
        try {
            const {result} = renderHook(() => useWordWrap());
            expect(result.current.disabled).toBe(false);
        } finally {
            Storage.prototype.getItem = original;
        }
    });

    it("recovers gracefully when localStorage.setItem throws on toggle", () => {
        const {result} = renderHook(() => useWordWrap());
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
            throw new Error("quota exceeded");
        };
        try {
            act(() => result.current.toggle());
            // State still flipped; persistence silently degraded.
            expect(result.current.disabled).toBe(true);
            expect(document.body.classList.contains(BODY_CLASS)).toBe(true);
        } finally {
            Storage.prototype.setItem = original;
        }
    });
});
