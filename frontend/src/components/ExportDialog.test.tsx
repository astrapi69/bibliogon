/**
 * Tests for ExportDialog.
 *
 * Covers: format selection grid, book type visibility per format,
 * TOC depth selector, manual TOC checkbox, AI-assisted flag,
 * export button label, audiobook-specific dry-run section,
 * batch export button, cancel behavior.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ExportDialog from "./ExportDialog"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

vi.mock("../api/client", () => ({
  api: {
    settings: {
      getPlugin: vi.fn().mockResolvedValue({settings: {}}),
    },
    exportJobs: {
      startAudiobook: vi.fn().mockResolvedValue({job_id: "job-1"}),
    },
    documentExport: {
      download: vi.fn().mockResolvedValue(undefined),
    },
    bookAudiobook: {
      dryRun: vi.fn().mockResolvedValue({
        audioUrl: "blob:test",
        estimatedChapters: 10,
        estimatedCostUsd: "free",
        engine: "edge-tts",
        voice: "de-DE-ConradNeural",
      }),
    },
  },
  ApiError: class extends Error {
    status: number
    detail: string
    detailBody?: Record<string, unknown>
    constructor(s: number, d: string) {
      super(d)
      this.status = s
      this.detail = d
    }
  },
  DryRunResult: class {},
}))

vi.mock("../contexts/AudiobookJobContext", () => ({
  useAudiobookJob: () => ({
    start: vi.fn(),
    jobId: null,
    phase: "idle",
  }),
}))

vi.mock("../utils/notify", () => ({
  notify: {error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn()},
}))

// HelpLink is a simple component that would need HelpContext - mock it
vi.mock("./help/HelpLink", () => ({
  default: () => null,
}))

vi.mock("./AppDialog", () => ({
  useDialog: () => ({
    confirm: vi.fn().mockResolvedValue(false),
    prompt: vi.fn().mockResolvedValue(null),
    alert: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe("ExportDialog", () => {
  const onClose = vi.fn()
  const defaultProps = {
    open: true,
    bookId: "book-123",
    bookTitle: "Test Book",
    hasManualToc: false,
    onClose,
  }

  beforeEach(() => {
    onClose.mockClear()
    vi.spyOn(window, "open").mockImplementation(() => null)
  })

  function renderDialog(overrides: Partial<typeof defaultProps> = {}) {
    return render(<ExportDialog {...defaultProps} {...overrides} />)
  }

  // --- Format selection ---

  it("renders all 7 format buttons", () => {
    renderDialog()
    expect(screen.getByText("EPUB")).toBeTruthy()
    expect(screen.getByText("PDF")).toBeTruthy()
    expect(screen.getByText("Word")).toBeTruthy()
    expect(screen.getByText("HTML")).toBeTruthy()
    expect(screen.getByText("Markdown")).toBeTruthy()
    expect(screen.getByText("Projekt (ZIP)")).toBeTruthy()
    expect(screen.getByText("Audiobook (MP3)")).toBeTruthy()
  })

  it("shows dialog title with book name", () => {
    renderDialog()
    expect(screen.getByText(/Export.*Test Book/)).toBeTruthy()
  })

  it("EPUB is selected by default", () => {
    renderDialog()
    // Export button should show EPUB label
    expect(screen.getByText(/Als EPUB exportieren/)).toBeTruthy()
  })

  it("clicking a format updates the export button label", () => {
    renderDialog()
    fireEvent.click(screen.getByText("PDF"))
    expect(screen.getByText(/Als PDF exportieren/)).toBeTruthy()
  })

  // --- Book type ---

  it("shows book type buttons for document formats", () => {
    renderDialog()
    expect(screen.getByText("E-Book")).toBeTruthy()
    expect(screen.getByText("Taschenbuch")).toBeTruthy()
    expect(screen.getByText("Hardcover")).toBeTruthy()
  })

  it("hides book type buttons for project format", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Projekt (ZIP)"))
    expect(screen.queryByText("E-Book")).toBeNull()
  })

  it("hides book type buttons for audiobook format", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Audiobook (MP3)"))
    expect(screen.queryByText("E-Book")).toBeNull()
  })

  // --- TOC depth ---

  it("shows TOC depth selector for document formats", () => {
    renderDialog()
    expect(screen.getByText("Inhaltsverzeichnis-Tiefe")).toBeTruthy()
  })

  it("hides TOC depth for audiobook format", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Audiobook (MP3)"))
    expect(screen.queryByText("Inhaltsverzeichnis-Tiefe")).toBeNull()
  })

  // --- Manual TOC ---

  it("shows manual TOC checkbox when hasManualToc is true", () => {
    renderDialog({hasManualToc: true})
    expect(
      screen.getByText("Manuelles Inhaltsverzeichnis verwenden"),
    ).toBeTruthy()
  })

  it("hides manual TOC checkbox when hasManualToc is false", () => {
    renderDialog({hasManualToc: false})
    expect(
      screen.queryByText("Manuelles Inhaltsverzeichnis verwenden"),
    ).toBeNull()
  })

  // --- AI-assisted ---

  it("shows AI-assisted checkbox", () => {
    renderDialog()
    expect(
      screen.getByText("AI-assistierte Inhalte kennzeichnen"),
    ).toBeTruthy()
  })

  // --- Audiobook section ---

  it("shows dry-run section when audiobook is selected", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Audiobook (MP3)"))
    expect(screen.getByText("Test-Export")).toBeTruthy()
    expect(screen.getByText("Probe hoeren")).toBeTruthy()
  })

  it("hides dry-run section for non-audiobook formats", () => {
    renderDialog()
    expect(screen.queryByText("Test-Export")).toBeNull()
  })

  // --- Export actions ---

  it("export button calls documentExport.download for document formats", async () => {
    const {api} = await import("../api/client")
    renderDialog()
    fireEvent.click(screen.getByText(/Als EPUB exportieren/))
    expect(api.documentExport.download).toHaveBeenCalledWith(
      "book-123",
      "epub",
      expect.any(URLSearchParams),
    )
  })

  it("batch export button is present", () => {
    renderDialog()
    expect(screen.getByText("Alle Formate (ZIP)")).toBeTruthy()
  })

  it("cancel button calls onClose", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Abbrechen"))
    expect(onClose).toHaveBeenCalled()
  })

  // --- Section order ---

  it("section order toggle is hidden for audiobook format", () => {
    renderDialog()
    fireEvent.click(screen.getByText("Audiobook (MP3)"))
    expect(
      screen.queryByText(/Kapitelreihenfolge anpassen/),
    ).toBeNull()
  })
})
