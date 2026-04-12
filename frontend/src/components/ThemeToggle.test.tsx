/**
 * Tests for ThemeToggle.
 *
 * Covers: renders correct icon for light/dark, calls toggle on click,
 * testid is present.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import ThemeToggle from "./ThemeToggle"

const mockToggle = vi.fn()
let mockTheme = "light"

vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: mockTheme,
    toggle: mockToggle,
    appTheme: "warm-literary",
    setAppTheme: vi.fn(),
  }),
}))

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockToggle.mockClear()
    mockTheme = "light"
  })

  it("renders with data-testid", () => {
    render(<ThemeToggle />)
    expect(screen.getByTestId("theme-toggle")).toBeTruthy()
  })

  it("shows Moon icon in light mode", () => {
    mockTheme = "light"
    render(<ThemeToggle />)
    expect(screen.getByTestId("theme-toggle").title).toBe("Dark Mode")
  })

  it("shows Sun icon in dark mode", () => {
    mockTheme = "dark"
    render(<ThemeToggle />)
    expect(screen.getByTestId("theme-toggle").title).toBe("Light Mode")
  })

  it("calls toggle on click", () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByTestId("theme-toggle"))
    expect(mockToggle).toHaveBeenCalledTimes(1)
  })
})
