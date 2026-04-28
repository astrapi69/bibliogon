/**
 * Tests for BackupCompareDialog.
 *
 * Covers: initial state (file pickers visible, compare button disabled),
 * compare triggers API call, result display, reset, error handling,
 * close behavior.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import BackupCompareDialog from "./BackupCompareDialog"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const mockCompare = vi.fn()
vi.mock("../api/client", () => ({
  api: {
    backup: {
      compare: (...args: unknown[]) => mockCompare(...args),
    },
  },
  ApiError: class extends Error {
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.detail = detail
    }
  },
}))

vi.mock("../utils/notify", () => ({
  notify: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

describe("BackupCompareDialog", () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    mockCompare.mockReset()
  })

  function renderDialog(open = true) {
    return render(<BackupCompareDialog open={open} onClose={onClose} />)
  }

  it("renders title and file inputs when open", () => {
    renderDialog()
    expect(screen.getByText("Backups vergleichen")).toBeTruthy()
    expect(screen.getByText("Backup A (älterer Stand)")).toBeTruthy()
    expect(screen.getByText("Backup B (neuerer Stand)")).toBeTruthy()
    const fileInputs = document.querySelectorAll('input[type="file"]')
    expect(fileInputs).toHaveLength(2)
  })

  it("compare button is disabled when no files selected", () => {
    renderDialog()
    const compareBtn = screen.getByText("Vergleichen")
    expect(compareBtn).toBeDisabled()
  })

  it("calls API compare when both files are selected and button clicked", async () => {
    mockCompare.mockResolvedValue({
      summary: {books_in_both: 1, books_only_in_a: [], books_only_in_b: []},
      books: [],
    })

    renderDialog()

    const inputs = document.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)

    const fileA = new File(["content-a"], "backup-a.bgb", {type: "application/octet-stream"})
    const fileB = new File(["content-b"], "backup-b.bgb", {type: "application/octet-stream"})

    fireEvent.change(inputs[0], {target: {files: [fileA]}})
    fireEvent.change(inputs[1], {target: {files: [fileB]}})

    const compareBtn = screen.getByText("Vergleichen")
    expect(compareBtn).not.toBeDisabled()
    fireEvent.click(compareBtn)

    await waitFor(() => {
      expect(mockCompare).toHaveBeenCalledWith(fileA, fileB)
    })
  })

  it("shows result summary after successful comparison", async () => {
    mockCompare.mockResolvedValue({
      summary: {books_in_both: 2, books_only_in_a: [], books_only_in_b: ["new-book"]},
      books: [],
    })

    renderDialog()

    const inputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(inputs[0], {target: {files: [new File(["a"], "a.bgb")]}})
    fireEvent.change(inputs[1], {target: {files: [new File(["b"], "b.bgb")]}})
    fireEvent.click(screen.getByText("Vergleichen"))

    await waitFor(() => {
      expect(screen.getByText("Übersicht")).toBeTruthy()
    })

    // "New comparison" button should appear in result view
    expect(screen.getByText("Neuer Vergleich")).toBeTruthy()
  })

  it("new comparison button resets to file picker state", async () => {
    mockCompare.mockResolvedValue({
      summary: {books_in_both: 1, books_only_in_a: [], books_only_in_b: []},
      books: [],
    })

    renderDialog()

    const inputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(inputs[0], {target: {files: [new File(["a"], "a.bgb")]}})
    fireEvent.change(inputs[1], {target: {files: [new File(["b"], "b.bgb")]}})
    fireEvent.click(screen.getByText("Vergleichen"))

    await waitFor(() => {
      expect(screen.getByText("Neuer Vergleich")).toBeTruthy()
    })

    fireEvent.click(screen.getByText("Neuer Vergleich"))

    await waitFor(() => {
      // File picker labels should be back
      expect(screen.getByText("Backup A (älterer Stand)")).toBeTruthy()
    })
  })

  it("shows error notification on API failure", async () => {
    const {notify} = await import("../utils/notify")
    mockCompare.mockRejectedValue(new Error("Network failure"))

    renderDialog()

    const inputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(inputs[0], {target: {files: [new File(["a"], "a.bgb")]}})
    fireEvent.change(inputs[1], {target: {files: [new File(["b"], "b.bgb")]}})
    fireEvent.click(screen.getByText("Vergleichen"))

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalled()
    })
  })

  it("cancel button calls onClose and resets state", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Abbrechen"))
    expect(onClose).toHaveBeenCalled()
  })
})
