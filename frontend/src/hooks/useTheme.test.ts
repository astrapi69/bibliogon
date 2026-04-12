/**
 * Tests for the useTheme hook.
 *
 * Covers: localStorage persistence, system preference fallback,
 * dark/light toggle, appTheme validation against known palettes,
 * DOM attribute syncing (data-theme, data-app-theme).
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {renderHook, act} from "@testing-library/react"

import {useTheme} from "./useTheme"
import {DEFAULT_PALETTE} from "../themes/palettes"

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-app-theme")
})

describe("useTheme", () => {
  describe("initial theme", () => {
    it("defaults to light when no stored preference and no system dark mode", () => {
      const {result} = renderHook(() => useTheme())
      expect(result.current.theme).toBe("light")
    })

    it("reads stored theme from localStorage", () => {
      localStorage.setItem("bibliogon-theme", "dark")
      const {result} = renderHook(() => useTheme())
      expect(result.current.theme).toBe("dark")
    })

    it("falls back to system preference when localStorage is empty", () => {
      // happy-dom supports matchMedia
      const mql = window.matchMedia("(prefers-color-scheme: dark)")
      // In happy-dom, matchMedia always returns matches=false, so light is expected
      const {result} = renderHook(() => useTheme())
      expect(result.current.theme).toBe("light")
    })

    it("ignores invalid localStorage values", () => {
      localStorage.setItem("bibliogon-theme", "sepia")
      const {result} = renderHook(() => useTheme())
      expect(result.current.theme).toBe("light")
    })
  })

  describe("toggle", () => {
    it("toggles from light to dark", () => {
      const {result} = renderHook(() => useTheme())
      act(() => result.current.toggle())
      expect(result.current.theme).toBe("dark")
    })

    it("toggles from dark to light", () => {
      localStorage.setItem("bibliogon-theme", "dark")
      const {result} = renderHook(() => useTheme())
      act(() => result.current.toggle())
      expect(result.current.theme).toBe("light")
    })

    it("persists toggled theme to localStorage", () => {
      const {result} = renderHook(() => useTheme())
      act(() => result.current.toggle())
      expect(localStorage.getItem("bibliogon-theme")).toBe("dark")
    })

    it("sets data-theme attribute on document element", () => {
      const {result} = renderHook(() => useTheme())
      act(() => result.current.toggle())
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    })
  })

  describe("appTheme (palette)", () => {
    it("defaults to warm-literary when no stored value", () => {
      const {result} = renderHook(() => useTheme())
      expect(result.current.appTheme).toBe(DEFAULT_PALETTE)
    })

    it("reads stored palette from localStorage", () => {
      localStorage.setItem("bibliogon-app-theme", "nord")
      const {result} = renderHook(() => useTheme())
      expect(result.current.appTheme).toBe("nord")
    })

    it("falls back to default for unknown stored palette", () => {
      localStorage.setItem("bibliogon-app-theme", "nonexistent-theme")
      const {result} = renderHook(() => useTheme())
      expect(result.current.appTheme).toBe(DEFAULT_PALETTE)
    })

    it("setAppTheme updates the palette", () => {
      const {result} = renderHook(() => useTheme())
      act(() => result.current.setAppTheme("cool-modern"))
      expect(result.current.appTheme).toBe("cool-modern")
    })

    it("persists palette to localStorage", () => {
      const {result} = renderHook(() => useTheme())
      act(() => result.current.setAppTheme("nord"))
      expect(localStorage.getItem("bibliogon-app-theme")).toBe("nord")
    })

    it("sets data-app-theme attribute on document element", () => {
      const {result} = renderHook(() => useTheme())
      act(() => result.current.setAppTheme("classic"))
      expect(document.documentElement.getAttribute("data-app-theme")).toBe("classic")
    })
  })
})
