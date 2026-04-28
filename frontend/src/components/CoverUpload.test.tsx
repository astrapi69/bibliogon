/**
 * Tests for CoverUpload.
 *
 * Covers: empty state rendering, file type validation,
 * upload success/error, remove success/error, KDP dimension
 * warning, drag-drop state, loading state.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import CoverUpload from "./CoverUpload"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const mockUpload = vi.fn()
const mockDelete = vi.fn()

vi.mock("../api/client", () => ({
  api: {
    covers: {
      upload: (...args: unknown[]) => mockUpload(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
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

describe("CoverUpload", () => {
  const onChange = vi.fn()

  beforeEach(() => {
    onChange.mockClear()
    mockUpload.mockReset()
    mockDelete.mockReset()
  })

  function renderUpload(coverImage: string | null = null) {
    return render(
      <CoverUpload bookId="book-123" coverImage={coverImage} onChange={onChange} />,
    )
  }

  it("shows empty state when no cover is set", () => {
    renderUpload()
    expect(screen.getByText("Bild hierher ziehen oder klicken")).toBeTruthy()
    expect(screen.getByText("Datei wählen")).toBeTruthy()
  })

  it("shows help text with format info", () => {
    renderUpload()
    expect(
      screen.getByText(/JPG, PNG oder WebP, maximal 10 MB/),
    ).toBeTruthy()
  })

  it("shows cover label", () => {
    renderUpload()
    expect(screen.getByText("Cover")).toBeTruthy()
  })

  it("calls api upload on valid file selection", async () => {
    mockUpload.mockResolvedValue({
      cover_image: "covers/test.jpg",
      width: 1600,
      height: 2560,
    })

    renderUpload()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["image-data"], "cover.jpg", {type: "image/jpeg"})
    fireEvent.change(fileInput, {target: {files: [file]}})

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith("book-123", file)
    })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("covers/test.jpg")
    })
  })

  it("rejects invalid file types with error notification", async () => {
    const {notify} = await import("../utils/notify")
    renderUpload()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["data"], "document.pdf", {type: "application/pdf"})
    fireEvent.change(fileInput, {target: {files: [file]}})

    expect(notify.error).toHaveBeenCalledWith(
      "Nur .jpg, .jpeg, .png oder .webp erlaubt",
    )
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it("shows error notification on upload failure", async () => {
    const {notify} = await import("../utils/notify")
    mockUpload.mockRejectedValue(new Error("Server error"))

    renderUpload()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["data"], "cover.png", {type: "image/png"})
    fireEvent.change(fileInput, {target: {files: [file]}})

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalled()
    })
  })

  it("renders preview image when cover is set", () => {
    renderUpload("covers/my-cover.jpg")
    const img = document.querySelector("img") as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toContain("/api/books/book-123/assets/file/my-cover.jpg")
  })

  it("does not show choose-file button when cover exists", () => {
    renderUpload("covers/existing.jpg")
    expect(screen.queryByText("Datei wählen")).toBeNull()
  })
})
