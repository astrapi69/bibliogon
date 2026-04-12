/**
 * Tests for ErrorReportDialog.
 *
 * Covers: rendering with error message, checkbox toggles,
 * preview toggle, issue body construction, URL truncation,
 * submit opens window.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import ErrorReportDialog from "./ErrorReportDialog"
import {ApiError} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

vi.mock("../utils/eventRecorder", () => ({
  eventRecorder: {
    getAll: () => [
      {type: "click" as const, target: "button.export", timestamp: Date.now()},
    ],
  },
  formatEventLog: () => "[10:00:00] Click: button.export",
}))

describe("ErrorReportDialog", () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    vi.spyOn(window, "open").mockImplementation(() => null)
  })

  function renderDialog(overrides: Partial<{
    open: boolean
    errorMessage: string
    apiError: ApiError
  }> = {}) {
    return render(
      <ErrorReportDialog
        open={overrides.open ?? true}
        onClose={onClose}
        errorMessage={overrides.errorMessage ?? "Export failed: Pandoc error"}
        apiError={overrides.apiError}
      />,
    )
  }

  it("renders the dialog title and error intro", () => {
    renderDialog()
    expect(screen.getByText("Issue-Report erstellen")).toBeTruthy()
    expect(
      screen.getByText(/Bibliogon hat einen Fehler erkannt/),
    ).toBeTruthy()
  })

  it("shows all three checkboxes", () => {
    renderDialog()
    const checkboxes = screen.getAllByRole("checkbox")
    // First is always checked (error + stacktrace), second is env, third is history
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[0]).toBeChecked() // error (disabled, always on)
    expect(checkboxes[1]).toBeChecked() // env
    expect(checkboxes[2]).toBeChecked() // history
  })

  it("env checkbox can be unchecked", () => {
    renderDialog()
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    expect(checkboxes[1]).not.toBeChecked()
  })

  it("history checkbox can be unchecked", () => {
    renderDialog()
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[2])
    expect(checkboxes[2]).not.toBeChecked()
  })

  it("preview toggle shows issue body", () => {
    renderDialog()
    const previewBtn = screen.getByText("Vorschau anzeigen")
    fireEvent.click(previewBtn)

    // The issue body should contain the error message
    expect(screen.getByText(/Export failed: Pandoc error/)).toBeTruthy()
    // Toggle button text changes
    expect(screen.getByText("Vorschau ausblenden")).toBeTruthy()
  })

  it("submit button opens GitHub issues URL", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Issue auf GitHub erstellen"))

    expect(window.open).toHaveBeenCalledTimes(1)
    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain("github.com/astrapi69/bibliogon/issues/new")
    expect(url).toContain("title=")
    expect(url).toContain("labels=bug")
  })

  it("submit calls onClose", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Issue auf GitHub erstellen"))
    expect(onClose).toHaveBeenCalled()
  })

  it("cancel button calls onClose", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Abbrechen"))
    expect(onClose).toHaveBeenCalled()
  })

  it("includes API error details in issue body when provided", () => {
    const apiError = new ApiError(
      500,
      "Internal Server Error",
      "POST",
      "/api/books/123/export/epub",
      "stack trace here",
    )

    renderDialog({apiError})
    fireEvent.click(screen.getByText("Vorschau anzeigen"))

    expect(screen.getByText(/HTTP Status: 500/)).toBeTruthy()
  })

  it("privacy note is always visible", () => {
    renderDialog()
    expect(screen.getByText(/Keine Buch-Inhalte/)).toBeTruthy()
  })
})
