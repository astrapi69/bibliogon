/**
 * Selection state hook tests for ``useBookSelection``. Mirrors
 * ``useArticleSelection.test.ts`` — same contract, same coverage.
 */

import {describe, it, expect} from "vitest"
import {renderHook, act} from "@testing-library/react"

import {useBookSelection} from "./useBookSelection"

describe("useBookSelection", () => {
    it("starts empty", () => {
        const {result} = renderHook(() => useBookSelection())
        expect(result.current.count).toBe(0)
        expect(result.current.isSelected("a")).toBe(false)
    })

    it("toggle adds and removes ids", () => {
        const {result} = renderHook(() => useBookSelection())
        act(() => result.current.toggle("a"))
        expect(result.current.isSelected("a")).toBe(true)
        expect(result.current.count).toBe(1)
        act(() => result.current.toggle("a"))
        expect(result.current.isSelected("a")).toBe(false)
        expect(result.current.count).toBe(0)
    })

    it("selectAll replaces the set with the supplied ids", () => {
        const {result} = renderHook(() => useBookSelection())
        act(() => result.current.toggle("x"))
        act(() => result.current.selectAll(["a", "b", "c"]))
        expect(result.current.count).toBe(3)
        expect(result.current.isSelected("x")).toBe(false)
        expect(result.current.isSelected("a")).toBe(true)
    })

    it("clear empties the set", () => {
        const {result} = renderHook(() => useBookSelection())
        act(() => result.current.selectAll(["a", "b"]))
        act(() => result.current.clear())
        expect(result.current.count).toBe(0)
        expect(result.current.isSelected("a")).toBe(false)
    })

    it("remove deletes a single id from the set", () => {
        const {result} = renderHook(() => useBookSelection())
        act(() => result.current.selectAll(["a", "b", "c"]))
        act(() => result.current.remove("b"))
        expect(result.current.count).toBe(2)
        expect(result.current.isSelected("a")).toBe(true)
        expect(result.current.isSelected("b")).toBe(false)
        expect(result.current.isSelected("c")).toBe(true)
    })

    it("remove is a no-op for an id not in the set", () => {
        const {result} = renderHook(() => useBookSelection())
        act(() => result.current.selectAll(["a", "b"]))
        const beforeIds = result.current.selectedIds
        act(() => result.current.remove("never-selected"))
        expect(result.current.selectedIds).toBe(beforeIds)
        expect(result.current.count).toBe(2)
    })

    it("remove on the only selected id leaves the set empty", () => {
        const {result} = renderHook(() => useBookSelection())
        act(() => result.current.toggle("a"))
        expect(result.current.count).toBe(1)
        act(() => result.current.remove("a"))
        expect(result.current.count).toBe(0)
        expect(result.current.isSelected("a")).toBe(false)
    })
})
