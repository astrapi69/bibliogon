import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useIsMobile } from "./useIsMobile";

type ChangeHandler = (event: MediaQueryListEvent) => void;

/** Install a controllable matchMedia stub. Returns a setter that flips the
 *  match state and fires the registered `change` listeners. */
function mockMatchMedia(initial: boolean) {
    let matches = initial;
    const handlers = new Set<ChangeHandler>();
    const mql = {
        get matches() {
            return matches;
        },
        media: "",
        addEventListener: (_type: string, cb: ChangeHandler) => handlers.add(cb),
        removeEventListener: (_type: string, cb: ChangeHandler) => handlers.delete(cb),
    };
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => mql),
    );
    return (next: boolean) => {
        matches = next;
        handlers.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
    it("returns true when the viewport matches the max-width query", () => {
        mockMatchMedia(true);
        const { result } = renderHook(() => useIsMobile(768));
        expect(result.current).toBe(true);
    });

    it("returns false when the viewport does not match (desktop)", () => {
        mockMatchMedia(false);
        const { result } = renderHook(() => useIsMobile(768));
        expect(result.current).toBe(false);
    });

    it("reacts to a viewport change crossing the breakpoint", () => {
        const setMatches = mockMatchMedia(false);
        const { result } = renderHook(() => useIsMobile(768));
        expect(result.current).toBe(false);

        act(() => setMatches(true));
        expect(result.current).toBe(true);

        act(() => setMatches(false));
        expect(result.current).toBe(false);
    });

    it("falls back to false when matchMedia is unavailable (SSR-safe)", () => {
        vi.stubGlobal("matchMedia", undefined);
        const { result } = renderHook(() => useIsMobile(768));
        expect(result.current).toBe(false);
    });

    it("uses the supplied breakpoint in the media query", () => {
        const spy = vi.fn(() => ({
            matches: false,
            media: "",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        vi.stubGlobal("matchMedia", spy);
        renderHook(() => useIsMobile(600));
        expect(spy).toHaveBeenCalledWith("(max-width: 599px)");
    });
});
