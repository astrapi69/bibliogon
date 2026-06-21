/**
 * Tests for useDebouncedCallback (PB-PHASE4 Session 4c Commit 3).
 *
 * Trailing-edge semantics: consecutive calls within the delay
 * window collapse into one. The latest fn reference is captured
 * via ref so callers can pass inline arrows.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {renderHook, act} from "@testing-library/react"

import {useDebouncedCallback} from "./useDebouncedCallback"

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("useDebouncedCallback", () => {
    it("fires the callback once after the delay elapses", () => {
        const cb = vi.fn()
        const {result} = renderHook(() => useDebouncedCallback(cb, 300))

        act(() => {
            result.current("v1")
        })
        expect(cb).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb).toHaveBeenCalledWith("v1")
    })

    it("collapses consecutive calls within the window into the LAST one", () => {
        const cb = vi.fn()
        const {result} = renderHook(() => useDebouncedCallback(cb, 300))

        act(() => {
            result.current("v1")
            vi.advanceTimersByTime(100)
            result.current("v2")
            vi.advanceTimersByTime(100)
            result.current("v3")
        })
        expect(cb).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb).toHaveBeenCalledWith("v3")
    })

    it("captures the LATEST fn reference (re-render-safe)", () => {
        const first = vi.fn()
        const second = vi.fn()
        const {result, rerender} = renderHook(
            ({fn}: {fn: typeof first}) => useDebouncedCallback(fn, 300),
            {initialProps: {fn: first}},
        )
        act(() => {
            result.current("v1")
        })
        rerender({fn: second})
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledWith("v1")
    })

    it("clears the pending timer on unmount", () => {
        const cb = vi.fn()
        const {result, unmount} = renderHook(() =>
            useDebouncedCallback(cb, 300),
        )
        act(() => {
            result.current("v1")
        })
        unmount()
        act(() => {
            vi.advanceTimersByTime(300)
        })
        expect(cb).not.toHaveBeenCalled()
    })

    it("subsequent calls after the delay-window elapses start a fresh timer", () => {
        const cb = vi.fn()
        const {result} = renderHook(() => useDebouncedCallback(cb, 300))
        act(() => {
            result.current("first")
            vi.advanceTimersByTime(300)
        })
        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb).toHaveBeenLastCalledWith("first")

        act(() => {
            result.current("second")
            vi.advanceTimersByTime(300)
        })
        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb).toHaveBeenLastCalledWith("second")
    })
})
