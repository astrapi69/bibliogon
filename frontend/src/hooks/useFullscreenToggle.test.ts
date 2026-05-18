/**
 * Vitest coverage for useFullscreenToggle hook
 * (EDITOR-FULLSCREEN-NATIVE-01 C1).
 *
 * Pins:
 * - requestFullscreen() + exitFullscreen() get called from
 *   toggle() based on document.fullscreenElement state.
 * - fullscreenchange event keeps isFullscreen flag in sync when
 *   the user uses F11 or Escape directly (browser-driven, not
 *   via our toggle).
 * - isSupported is false when requestFullscreen is undefined.
 * - toggle() swallows rejections (silent degrade) - no throw
 *   propagated to the caller.
 *
 * happy-dom does not implement the Fullscreen API natively, so
 * the tests mount mocks onto document + documentElement before
 * each case.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {useFullscreenToggle} from "./useFullscreenToggle";

type DocumentMutable = Document & {
    fullscreenElement: Element | null;
};

interface MockState {
    requestFullscreen: ReturnType<typeof vi.fn>;
    exitFullscreen: ReturnType<typeof vi.fn>;
    listeners: Array<EventListenerOrEventListenerObject>;
}

const state: MockState = {
    requestFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    listeners: [],
};

function fireFullscreenChange(targetElement: Element | null) {
    (document as DocumentMutable).fullscreenElement = targetElement;
    state.listeners.forEach((l) => {
        if (typeof l === "function") l(new Event("fullscreenchange"));
    });
}

beforeEach(() => {
    state.requestFullscreen = vi.fn().mockImplementation(() => {
        (document as DocumentMutable).fullscreenElement = document.documentElement;
        state.listeners.forEach((l) => {
            if (typeof l === "function") l(new Event("fullscreenchange"));
        });
        return Promise.resolve();
    });
    state.exitFullscreen = vi.fn().mockImplementation(() => {
        (document as DocumentMutable).fullscreenElement = null;
        state.listeners.forEach((l) => {
            if (typeof l === "function") l(new Event("fullscreenchange"));
        });
        return Promise.resolve();
    });
    state.listeners = [];

    Object.defineProperty(document.documentElement, "requestFullscreen", {
        configurable: true,
        value: state.requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        value: state.exitFullscreen,
    });
    (document as DocumentMutable).fullscreenElement = null;

    const origAdd = document.addEventListener.bind(document);
    const origRemove = document.removeEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "fullscreenchange") state.listeners.push(listener);
        return origAdd(type, listener as EventListener);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "fullscreenchange") {
            state.listeners = state.listeners.filter((l) => l !== listener);
        }
        return origRemove(type, listener as EventListener);
    }) as typeof document.removeEventListener;
});

afterEach(() => {
    state.listeners = [];
    (document as DocumentMutable).fullscreenElement = null;
});

describe("useFullscreenToggle", () => {
    it("reports isSupported = true when requestFullscreen exists", () => {
        const {result} = renderHook(() => useFullscreenToggle());
        expect(result.current.isSupported).toBe(true);
    });

    it("reports isSupported = false when requestFullscreen is missing", () => {
        Object.defineProperty(document.documentElement, "requestFullscreen", {
            configurable: true,
            value: undefined,
        });
        const {result} = renderHook(() => useFullscreenToggle());
        expect(result.current.isSupported).toBe(false);
    });

    it("toggle() calls requestFullscreen when no element is fullscreen", async () => {
        const {result} = renderHook(() => useFullscreenToggle());
        expect(result.current.isFullscreen).toBe(false);
        await act(async () => {
            await result.current.toggle();
        });
        expect(state.requestFullscreen).toHaveBeenCalledTimes(1);
        expect(state.exitFullscreen).not.toHaveBeenCalled();
        expect(result.current.isFullscreen).toBe(true);
    });

    it("toggle() calls exitFullscreen when an element is fullscreen", async () => {
        (document as DocumentMutable).fullscreenElement = document.documentElement;
        const {result} = renderHook(() => useFullscreenToggle());
        await act(async () => {
            await result.current.toggle();
        });
        expect(state.exitFullscreen).toHaveBeenCalledTimes(1);
        expect(state.requestFullscreen).not.toHaveBeenCalled();
    });

    it("syncs isFullscreen when the browser fires fullscreenchange (F11 / Escape)", () => {
        const {result} = renderHook(() => useFullscreenToggle());
        expect(result.current.isFullscreen).toBe(false);

        act(() => {
            fireFullscreenChange(document.documentElement);
        });
        expect(result.current.isFullscreen).toBe(true);

        act(() => {
            fireFullscreenChange(null);
        });
        expect(result.current.isFullscreen).toBe(false);
    });

    it("toggle() silently swallows requestFullscreen() rejection", async () => {
        state.requestFullscreen = vi
            .fn()
            .mockReturnValue(Promise.reject(new Error("user-gesture")));
        Object.defineProperty(document.documentElement, "requestFullscreen", {
            configurable: true,
            value: state.requestFullscreen,
        });

        const {result} = renderHook(() => useFullscreenToggle());
        await expect(
            act(async () => {
                await result.current.toggle();
            }),
        ).resolves.toBeUndefined();
        expect(result.current.isFullscreen).toBe(false);
    });

    it("toggle() is a no-op when isSupported is false", async () => {
        Object.defineProperty(document.documentElement, "requestFullscreen", {
            configurable: true,
            value: undefined,
        });
        const {result} = renderHook(() => useFullscreenToggle());
        expect(result.current.isSupported).toBe(false);
        await act(async () => {
            await result.current.toggle();
        });
        expect(state.requestFullscreen).not.toHaveBeenCalled();
    });
});
