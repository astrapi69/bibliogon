/**
 * Vitest coverage for useCollapsibleState hook.
 *
 * Pins:
 * - Initial state reads from localStorage when present, otherwise
 *   falls back to defaultOpen.
 * - onOpenChange flips state and writes to localStorage.
 * - "0" and "1" round-trip correctly.
 * - Different storageKeys are isolated.
 * - Hook recovers gracefully when localStorage throws.
 */

import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {useCollapsibleState} from "./useCollapsibleState";

describe("useCollapsibleState", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("defaults to defaultOpen=false when nothing is stored", () => {
        const {result} = renderHook(() => useCollapsibleState("test-key"));
        expect(result.current.open).toBe(false);
    });

    it("honours defaultOpen=true when nothing is stored", () => {
        const {result} = renderHook(() =>
            useCollapsibleState("test-key", true),
        );
        expect(result.current.open).toBe(true);
    });

    it("reads stored '1' as open", () => {
        localStorage.setItem("test-key", "1");
        const {result} = renderHook(() => useCollapsibleState("test-key"));
        expect(result.current.open).toBe(true);
    });

    it("reads stored '0' as closed even when defaultOpen=true", () => {
        localStorage.setItem("test-key", "0");
        const {result} = renderHook(() =>
            useCollapsibleState("test-key", true),
        );
        expect(result.current.open).toBe(false);
    });

    it("onOpenChange(true) writes '1' and updates state", () => {
        const {result} = renderHook(() => useCollapsibleState("test-key"));
        act(() => result.current.onOpenChange(true));
        expect(result.current.open).toBe(true);
        expect(localStorage.getItem("test-key")).toBe("1");
    });

    it("onOpenChange(false) writes '0' and updates state", () => {
        localStorage.setItem("test-key", "1");
        const {result} = renderHook(() => useCollapsibleState("test-key"));
        act(() => result.current.onOpenChange(false));
        expect(result.current.open).toBe(false);
        expect(localStorage.getItem("test-key")).toBe("0");
    });

    it("different storageKeys are isolated", () => {
        localStorage.setItem("key-a", "1");
        localStorage.setItem("key-b", "0");
        const {result: a} = renderHook(() => useCollapsibleState("key-a"));
        const {result: b} = renderHook(() => useCollapsibleState("key-b"));
        expect(a.current.open).toBe(true);
        expect(b.current.open).toBe(false);
    });

    it("recovers gracefully when localStorage.getItem throws", () => {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = () => {
            throw new Error("privacy mode");
        };
        try {
            const {result} = renderHook(() =>
                useCollapsibleState("test-key", true),
            );
            expect(result.current.open).toBe(true);
        } finally {
            Storage.prototype.getItem = original;
        }
    });

    it("recovers gracefully when localStorage.setItem throws", () => {
        const {result} = renderHook(() => useCollapsibleState("test-key"));
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
            throw new Error("quota exceeded");
        };
        try {
            act(() => result.current.onOpenChange(true));
            expect(result.current.open).toBe(true);
        } finally {
            Storage.prototype.setItem = original;
        }
    });
});
