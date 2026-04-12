/**
 * Tests for HelpContext provider and useHelp hook.
 *
 * Covers: initial state, openHelp with/without slug, closeHelp,
 * error when used outside provider.
 */

import React from "react"
import {describe, it, expect} from "vitest"
import {renderHook, act} from "@testing-library/react"

import {HelpProvider, useHelp} from "./HelpContext"

function wrapper({children}: {children: React.ReactNode}) {
  return <HelpProvider>{children}</HelpProvider>
}

describe("HelpContext", () => {
  it("starts closed with no slug", () => {
    const {result} = renderHook(() => useHelp(), {wrapper})
    expect(result.current.open).toBe(false)
    expect(result.current.slug).toBeNull()
  })

  it("openHelp sets open to true", () => {
    const {result} = renderHook(() => useHelp(), {wrapper})
    act(() => result.current.openHelp())
    expect(result.current.open).toBe(true)
  })

  it("openHelp with slug sets both open and slug", () => {
    const {result} = renderHook(() => useHelp(), {wrapper})
    act(() => result.current.openHelp("export/epub"))
    expect(result.current.open).toBe(true)
    expect(result.current.slug).toBe("export/epub")
  })

  it("openHelp without slug sets slug to null", () => {
    const {result} = renderHook(() => useHelp(), {wrapper})
    act(() => result.current.openHelp("some/page"))
    act(() => result.current.openHelp())
    expect(result.current.open).toBe(true)
    expect(result.current.slug).toBeNull()
  })

  it("closeHelp sets open to false but preserves slug", () => {
    const {result} = renderHook(() => useHelp(), {wrapper})
    act(() => result.current.openHelp("editor/shortcuts"))
    act(() => result.current.closeHelp())
    expect(result.current.open).toBe(false)
    // slug is preserved for re-open convenience
    expect(result.current.slug).toBe("editor/shortcuts")
  })

  it("throws when used outside HelpProvider", () => {
    expect(() => {
      renderHook(() => useHelp())
    }).toThrow("useHelp must be used inside HelpProvider")
  })
})
