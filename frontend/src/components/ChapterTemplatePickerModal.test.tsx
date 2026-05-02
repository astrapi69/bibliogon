/**
 * Tests for ChapterTemplatePickerModal (TM-04).
 *
 * Covers: fetch on open, builtin badge + user delete action,
 * insert calls onInsert with the selected template, empty and
 * error states, delete flow with confirm.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ChapterTemplatePickerModal from "./ChapterTemplatePickerModal"
import type {ChapterTemplate} from "../api/client"

const mockList = vi.fn()
const mockDelete = vi.fn()
const mockConfirm = vi.fn()

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.status = status
      this.detail = detail
    }
  }
  return {
    api: {
      chapterTemplates: {
        list: () => mockList(),
        delete: (id: string) => mockDelete(id),
      },
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

vi.mock("./AppDialog", () => ({
  useDialog: () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
    alert: vi.fn(),
    prompt: vi.fn(),
  }),
}))

vi.mock("../utils/notify", () => ({
  notify: {success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()},
}))

const BUILTIN_TPL: ChapterTemplate = {
  id: "tpl-interview",
  name: "Interview",
  description: "Structured interview",
  chapter_type: "chapter",
  content: '{"type":"doc","content":[]}',
  language: "en",
  is_builtin: true,
  child_template_ids: null,
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
}

const USER_TPL: ChapterTemplate = {
  id: "tpl-user",
  name: "My Custom",
  description: "User template",
  chapter_type: "chapter",
  content: null,
  language: "en",
  is_builtin: false,
  child_template_ids: null,
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
}

describe("ChapterTemplatePickerModal", () => {
  const onClose = vi.fn()
  const onInsert = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onInsert.mockClear()
    mockList.mockReset()
    mockDelete.mockReset()
    mockConfirm.mockReset()
  })

  function renderOpen() {
    return render(
      <ChapterTemplatePickerModal
        open={true}
        onClose={onClose}
        onInsert={onInsert}
      />,
    )
  }

  it("fetches templates on open and renders cards", async () => {
    mockList.mockResolvedValue([BUILTIN_TPL, USER_TPL])
    renderOpen()

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.getByText("Interview")).toBeTruthy()
      expect(screen.getByText("My Custom")).toBeTruthy()
    })
  })

  it("builtin card has badge and no delete; user card has delete and no badge", async () => {
    mockList.mockResolvedValue([BUILTIN_TPL, USER_TPL])
    renderOpen()

    await waitFor(() => expect(screen.getByText("Interview")).toBeTruthy())

    expect(screen.getByTestId("chapter-template-builtin-badge-tpl-interview")).toBeTruthy()
    expect(screen.queryByTestId("chapter-template-delete-tpl-interview")).toBeNull()

    expect(screen.getByTestId("chapter-template-delete-tpl-user")).toBeTruthy()
    expect(screen.queryByTestId("chapter-template-builtin-badge-tpl-user")).toBeNull()
  })

  it("insert button is disabled until a template is selected", async () => {
    mockList.mockResolvedValue([BUILTIN_TPL])
    renderOpen()

    await waitFor(() => expect(screen.getByText("Interview")).toBeTruthy())
    expect(screen.getByTestId("chapter-template-insert")).toBeDisabled()

    fireEvent.click(screen.getByTestId("chapter-template-card-tpl-interview"))
    expect(screen.getByTestId("chapter-template-insert")).not.toBeDisabled()
  })

  it("inserting calls onInsert with the selected template and closes the modal", async () => {
    mockList.mockResolvedValue([BUILTIN_TPL])
    renderOpen()

    await waitFor(() => expect(screen.getByText("Interview")).toBeTruthy())
    fireEvent.click(screen.getByTestId("chapter-template-card-tpl-interview"))
    fireEvent.click(screen.getByTestId("chapter-template-insert"))

    expect(onInsert).toHaveBeenCalledTimes(1)
    expect(onInsert.mock.calls[0][0].id).toBe("tpl-interview")
    expect(onClose).toHaveBeenCalled()
  })

  it("shows empty state when the list returns no templates", async () => {
    mockList.mockResolvedValue([])
    renderOpen()

    await waitFor(() => {
      expect(screen.getByText(/Keine Kapitelvorlagen/i)).toBeTruthy()
    })
  })

  it("shows error state when fetch fails", async () => {
    mockList.mockRejectedValue(new Error("boom"))
    renderOpen()

    await waitFor(() => {
      expect(screen.getByText(/konnten nicht geladen/i)).toBeTruthy()
    })
  })

  it("confirmed delete calls api.chapterTemplates.delete and removes the card", async () => {
    mockList.mockResolvedValue([USER_TPL])
    mockConfirm.mockResolvedValue(true)
    mockDelete.mockResolvedValue(undefined)
    renderOpen()

    await waitFor(() => expect(screen.getByText("My Custom")).toBeTruthy())
    fireEvent.click(screen.getByTestId("chapter-template-delete-tpl-user"))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("tpl-user"))
    await waitFor(() => expect(screen.queryByText("My Custom")).toBeNull())
  })

  it("cancelled delete does not call the API", async () => {
    mockList.mockResolvedValue([USER_TPL])
    mockConfirm.mockResolvedValue(false)
    renderOpen()

    await waitFor(() => expect(screen.getByText("My Custom")).toBeTruthy())
    fireEvent.click(screen.getByTestId("chapter-template-delete-tpl-user"))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.getByText("My Custom")).toBeTruthy()
  })
})
