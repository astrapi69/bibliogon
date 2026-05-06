/**
 * Selection state hook tests. Selection is component-local (NOT
 * URL-synced); these cases pin the toggle / select-all / clear
 * contract and the count semantics that the bulk-action bar
 * depends on.
 */

import {describe, it, expect} from "vitest"
import {renderHook, act} from "@testing-library/react"

import {useArticleSelection} from "./useArticleSelection"

describe("useArticleSelection", () => {
    it("starts empty", () => {
        const {result} = renderHook(() => useArticleSelection())
        expect(result.current.count).toBe(0)
        expect(result.current.isSelected("a")).toBe(false)
    })

    it("toggle adds and removes ids", () => {
        const {result} = renderHook(() => useArticleSelection())
        act(() => result.current.toggle("a"))
        expect(result.current.isSelected("a")).toBe(true)
        expect(result.current.count).toBe(1)
        act(() => result.current.toggle("a"))
        expect(result.current.isSelected("a")).toBe(false)
        expect(result.current.count).toBe(0)
    })

    it("selectAll replaces the set with the supplied ids", () => {
        const {result} = renderHook(() => useArticleSelection())
        act(() => result.current.toggle("x"))
        act(() => result.current.selectAll(["a", "b", "c"]))
        expect(result.current.count).toBe(3)
        expect(result.current.isSelected("x")).toBe(false)
        expect(result.current.isSelected("a")).toBe(true)
    })

    it("clear empties the set", () => {
        const {result} = renderHook(() => useArticleSelection())
        act(() => result.current.selectAll(["a", "b"]))
        act(() => result.current.clear())
        expect(result.current.count).toBe(0)
        expect(result.current.isSelected("a")).toBe(false)
    })
})
