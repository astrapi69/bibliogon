/**
 * Tests for useEditorPluginStatus hook and utility functions.
 *
 * Covers: initial fetch, error handling (silently treats as unavailable),
 * manual refresh, and the two pure utility functions.
 *
 * Polling and focus-refetch are not tested here because fake timers
 * conflict with renderHook's async internals. Those behaviors are
 * covered by the E2E suite.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {renderHook, act, waitFor} from "@testing-library/react"

import {
  isPluginAvailable,
  pluginDisabledMessage,
  type EditorPluginStatusMap,
} from "./useEditorPluginStatus"

// --- Pure utility functions (no React, no async) ---

describe("isPluginAvailable", () => {
  const statusMap: EditorPluginStatusMap = {
    grammar: {available: true, reason: null},
    audiobook: {available: false, reason: "no_license"},
  }

  it("returns true for an available plugin", () => {
    expect(isPluginAvailable(statusMap, "grammar")).toBe(true)
  })

  it("returns false for an unavailable plugin", () => {
    expect(isPluginAvailable(statusMap, "audiobook")).toBe(false)
  })

  it("returns false for an unknown plugin", () => {
    expect(isPluginAvailable(statusMap, "nonexistent")).toBe(false)
  })

  it("returns false for empty status map", () => {
    expect(isPluginAvailable({}, "grammar")).toBe(false)
  })
})

describe("pluginDisabledMessage", () => {
  it("returns the plugin message when set", () => {
    const statusMap: EditorPluginStatusMap = {
      grammar: {available: false, reason: "no_license", message: "Lizenz fehlt"},
    }
    expect(pluginDisabledMessage(statusMap, "grammar")).toBe("Lizenz fehlt")
  })

  it("returns default message when no message set", () => {
    const statusMap: EditorPluginStatusMap = {
      grammar: {available: false, reason: "no_license"},
    }
    expect(pluginDisabledMessage(statusMap, "grammar")).toBe("Plugin nicht verfügbar")
  })

  it("returns default message for unknown plugin", () => {
    expect(pluginDisabledMessage({}, "unknown")).toBe("Plugin nicht verfügbar")
  })
})

// --- Hook (uses real timers, mocked API) ---

// Dynamic import to allow vi.mock to take effect before the module loads
vi.mock("../api/client", () => ({
  api: {
    editorPluginStatus: vi.fn(),
  },
}))

describe("useEditorPluginStatus hook", () => {
  let mockEditorPluginStatus: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const {api} = await import("../api/client")
    mockEditorPluginStatus = vi.mocked(api.editorPluginStatus)
    mockEditorPluginStatus.mockReset()
  })

  it("fetches status on mount and clears loading", async () => {
    const mockData: EditorPluginStatusMap = {
      grammar: {available: true, reason: null},
    }
    mockEditorPluginStatus.mockResolvedValue(mockData)

    // Import dynamically so mock is in place
    const {useEditorPluginStatus} = await import("./useEditorPluginStatus")
    const {result} = renderHook(() => useEditorPluginStatus())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.status).toEqual(mockData)
    expect(mockEditorPluginStatus).toHaveBeenCalled()
  })

  it("starts in loading state with empty status", async () => {
    mockEditorPluginStatus.mockImplementation(
      () => new Promise(() => {}), // never resolves
    )

    const {useEditorPluginStatus} = await import("./useEditorPluginStatus")
    const {result} = renderHook(() => useEditorPluginStatus())

    expect(result.current.loading).toBe(true)
    expect(result.current.status).toEqual({})
  })

  it("handles fetch error gracefully (empty status, not loading)", async () => {
    mockEditorPluginStatus.mockRejectedValue(new Error("Network error"))

    const {useEditorPluginStatus} = await import("./useEditorPluginStatus")
    const {result} = renderHook(() => useEditorPluginStatus())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.status).toEqual({})
  })

  it("provides a working refresh function", async () => {
    mockEditorPluginStatus.mockResolvedValue({})

    const {useEditorPluginStatus} = await import("./useEditorPluginStatus")
    const {result} = renderHook(() => useEditorPluginStatus())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Update mock for the refresh call
    mockEditorPluginStatus.mockResolvedValue({
      grammar: {available: true, reason: null},
    })

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.status).toEqual({
        grammar: {available: true, reason: null},
      })
    })
  })
})
