/**
 * Tests for SaveAsTemplateModal.
 *
 * Covers: book title in header, name validation (required),
 * empty-placeholder vs preserve-content payload shape, 409 name
 * collision -> inline error, no-chapters disables submit.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import SaveAsTemplateModal from "./SaveAsTemplateModal"
import type {BookDetail} from "../api/client"

const mockCreate = vi.fn()
const mockGetBook = vi.fn()

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number
    detail: string
    endpoint: string
    method: string
    stacktrace: string
    constructor(
      status: number,
      detail: string,
      endpoint = "",
      method = "",
      stacktrace = "",
    ) {
      super(detail)
      this.status = status
      this.detail = detail
      this.endpoint = endpoint
      this.method = method
      this.stacktrace = stacktrace
    }
  }
  return {
    api: {
      templates: {create: (...a: unknown[]) => mockCreate(...a)},
      books: {get: (...a: unknown[]) => mockGetBook(...a)},
    },
    ApiError,
  }
})

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

vi.mock("../utils/notify", () => ({
  notify: {success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()},
}))

const FAKE_BOOK: BookDetail = {
  id: "book-1",
  title: "My Memoir",
  subtitle: null,
  author: "Aster",
  language: "en",
  genre: "memoir",
  series: null,
  series_index: null,
  description: "A life story",
  edition: null,
  publisher: null,
  publisher_city: null,
  publish_date: null,
  isbn_ebook: null,
  isbn_paperback: null,
  isbn_hardcover: null,
  asin_ebook: null,
  asin_paperback: null,
  asin_hardcover: null,
  keywords: [],
  html_description: null,
  backpage_description: null,
  backpage_author_bio: null,
  cover_image: null,
  custom_css: null,
  ai_assisted: false,
  ai_tokens_used: 0,
  tts_engine: null,
  tts_voice: null,
  tts_language: null,
  tts_speed: null,
  audiobook_merge: null,
  audiobook_filename: null,
  audiobook_overwrite_existing: false,
  audiobook_skip_chapter_types: [],
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
  chapters: [
    {
      id: "c1", book_id: "book-1", title: "Prologue",
      content: "existing content 1", position: 0,
      chapter_type: "prologue",
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
      version: 1,
    },
    {
      id: "c2", book_id: "book-1", title: "Chapter 1",
      content: "", position: 1, chapter_type: "chapter",
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
      version: 1,
    },
  ],
}

describe("SaveAsTemplateModal", () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    mockCreate.mockReset()
    mockGetBook.mockReset()
  })

  function renderModal(book = FAKE_BOOK) {
    return render(
      <SaveAsTemplateModal open={true} book={book} onClose={onClose} />,
    )
  }

  it("renders with the book title in the header", () => {
    renderModal()
    expect(screen.getByText(/My Memoir/)).toBeTruthy()
  })

  it("submit is disabled when name is empty", () => {
    renderModal()
    expect(screen.getByTestId("save-template-submit")).toBeDisabled()
  })

  it("submit with empty placeholders sends content: null for every chapter", async () => {
    mockCreate.mockResolvedValue({id: "new-tpl"})
    renderModal()

    fireEvent.change(screen.getByTestId("save-template-name"), {
      target: {value: "Memoir Blueprint"},
    })

    const submit = screen.getByTestId("save-template-submit")
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockGetBook).not.toHaveBeenCalled()
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.name).toBe("Memoir Blueprint")
    expect(payload.description).toBe("A life story")
    expect(payload.genre).toBe("memoir")
    expect(payload.language).toBe("en")
    expect(payload.chapters).toHaveLength(2)
    for (const c of payload.chapters) {
      expect(c.content).toBeNull()
    }
    expect(payload.chapters[0].title).toBe("Prologue")
    expect(payload.chapters[0].chapter_type).toBe("prologue")
  })

  it("submit with preserve content fetches content and sends it", async () => {
    mockCreate.mockResolvedValue({id: "new-tpl"})
    mockGetBook.mockResolvedValue({
      ...FAKE_BOOK,
      chapters: [
        {...FAKE_BOOK.chapters[0], content: "full prologue body"},
        {...FAKE_BOOK.chapters[1], content: "full chapter body"},
      ],
    })
    renderModal()

    fireEvent.change(screen.getByTestId("save-template-name"), {
      target: {value: "Full Pattern"},
    })
    fireEvent.click(screen.getByTestId("save-template-content-preserve"))

    const submit = screen.getByTestId("save-template-submit")
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.click(submit)

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockGetBook).toHaveBeenCalledWith("book-1", true)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.chapters[0].content).toBe("full prologue body")
    expect(payload.chapters[1].content).toBe("full chapter body")
  })

  it("409 from server renders inline name_taken error", async () => {
    const {ApiError} = await import("../api/client")
    mockCreate.mockRejectedValue(new ApiError(409, "Template name already exists", "", "POST", ""))
    renderModal()

    fireEvent.change(screen.getByTestId("save-template-name"), {
      target: {value: "Duplicate Name"},
    })
    fireEvent.click(screen.getByTestId("save-template-submit"))

    await waitFor(() => {
      expect(screen.getByTestId("save-template-name-error")).toBeTruthy()
    })
    // German fallback comes through the t() mock; match substring.
    expect(screen.getByTestId("save-template-name-error").textContent).toMatch(
      /existiert bereits/i,
    )
  })

  it("disables submit when the book has zero chapters", () => {
    renderModal({...FAKE_BOOK, chapters: []})
    fireEvent.change(screen.getByTestId("save-template-name"), {
      target: {value: "Empty"},
    })
    expect(screen.getByTestId("save-template-submit")).toBeDisabled()
  })
})
