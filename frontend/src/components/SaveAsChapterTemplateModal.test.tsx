/**
 * Tests for SaveAsChapterTemplateModal (TM-04).
 *
 * Covers: name pre-fill from chapter.title, required validation,
 * empty-placeholder vs preserve-content payload shape, 409 name
 * collision -> inline error.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import SaveAsChapterTemplateModal from "./SaveAsChapterTemplateModal"
import type {Chapter} from "../api/client"

const mockCreate = vi.fn()
const mockGetChapter = vi.fn()

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
      chapterTemplates: {create: (...a: unknown[]) => mockCreate(...a)},
      chapters: {get: (...a: unknown[]) => mockGetChapter(...a)},
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

const FAKE_CHAPTER: Chapter = {
  id: "ch-1",
  book_id: "book-1",
  title: "Recipe For Bread",
  content: "",
  position: 0,
  chapter_type: "chapter",
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
}

describe("SaveAsChapterTemplateModal", () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    mockCreate.mockReset()
    mockGetChapter.mockReset()
  })

  function renderModal(chapter = FAKE_CHAPTER) {
    return render(
      <SaveAsChapterTemplateModal
        open={true}
        chapter={chapter}
        bookId="book-1"
        onClose={onClose}
      />,
    )
  }

  it("name input is pre-filled from chapter.title", () => {
    renderModal()
    const nameInput = screen.getByTestId("save-chapter-template-name") as HTMLInputElement
    expect(nameInput.value).toBe("Recipe For Bread")
  })

  it("submit is disabled until name and description are filled", () => {
    renderModal()
    // name is pre-filled but description is empty
    expect(screen.getByTestId("save-chapter-template-submit")).toBeDisabled()

    fireEvent.change(screen.getByTestId("save-chapter-template-description"), {
      target: {value: "Reusable recipe layout"},
    })
    expect(screen.getByTestId("save-chapter-template-submit")).not.toBeDisabled()
  })

  it("empty-placeholder mode sends content: null, no chapter fetch", async () => {
    mockCreate.mockResolvedValue({id: "new-tpl"})
    renderModal()

    fireEvent.change(screen.getByTestId("save-chapter-template-description"), {
      target: {value: "Reusable recipe layout"},
    })
    fireEvent.click(screen.getByTestId("save-chapter-template-submit"))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockGetChapter).not.toHaveBeenCalled()
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.name).toBe("Recipe For Bread")
    expect(payload.description).toBe("Reusable recipe layout")
    expect(payload.chapter_type).toBe("chapter")
    expect(payload.content).toBeNull()
  })

  it("preserve-content mode fetches the chapter and sends its content", async () => {
    mockCreate.mockResolvedValue({id: "new-tpl"})
    mockGetChapter.mockResolvedValue({...FAKE_CHAPTER, content: '{"type":"doc","content":[{"type":"paragraph"}]}'})
    renderModal()

    fireEvent.change(screen.getByTestId("save-chapter-template-description"), {
      target: {value: "Full pattern"},
    })
    fireEvent.click(screen.getByTestId("save-chapter-template-content-preserve"))
    fireEvent.click(screen.getByTestId("save-chapter-template-submit"))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockGetChapter).toHaveBeenCalledWith("book-1", "ch-1")
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.content).toBe('{"type":"doc","content":[{"type":"paragraph"}]}')
  })

  it("409 renders the inline name_taken error", async () => {
    const {ApiError} = await import("../api/client")
    mockCreate.mockRejectedValue(new ApiError(409, "Chapter template name already exists", "", "POST", ""))
    renderModal()

    fireEvent.change(screen.getByTestId("save-chapter-template-description"), {
      target: {value: "Duplicate"},
    })
    fireEvent.click(screen.getByTestId("save-chapter-template-submit"))

    await waitFor(() => {
      expect(screen.getByTestId("save-chapter-template-name-error")).toBeTruthy()
    })
    expect(screen.getByTestId("save-chapter-template-name-error").textContent).toMatch(
      /existiert bereits/i,
    )
  })
})
