/**
 * Tests for ChapterTemplatePickerModal (TM-04).
 *
 * Covers: fetch on open, builtin badge + user delete action,
 * insert calls onInsert with the selected template, empty and
 * error states, delete flow with confirm, and the JSON round-trip.
 *
 * Everything runs through the storage seam (#731), so the mocks below
 * stand in for BOTH backends: the api delegate online and Dexie offline.
 * The Dexie behaviour itself is pinned in storage/dexie-storage.test.ts.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ChapterTemplatePickerModal from "./ChapterTemplatePickerModal"
import type {ChapterTemplate} from "../../api/client"

const mockList = vi.fn()
const mockDelete = vi.fn()
const mockExport = vi.fn()
const mockImport = vi.fn()
const mockConfirm = vi.fn()

vi.mock("../../storage", () => ({
  getStorage: () => ({
    chapterTemplates: {
      list: () => mockList(),
      delete: (id: string) => mockDelete(id),
      exportJson: (id: string) => mockExport(id),
      importJson: (file: File) => mockImport(file),
    },
  }),
}))

vi.mock("../../api/client", () => {
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

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

vi.mock("../shared/AppDialog", () => ({
  useDialog: () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
    alert: vi.fn(),
    prompt: vi.fn(),
  }),
}))

vi.mock("../../utils/platform/notify", () => ({
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
    mockExport.mockReset()
    mockImport.mockReset()
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

  it("export hands the template id to the seam", async () => {
    mockList.mockResolvedValue([BUILTIN_TPL, USER_TPL])
    mockExport.mockResolvedValue(undefined)
    renderOpen()
    const button = await screen.findByTestId(
      `chapter-template-export-${USER_TPL.id}`,
    )
    fireEvent.click(button)
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith(USER_TPL.id))
  })

  it("import adds the new template and reloads the list", async () => {
    const imported: ChapterTemplate = {...USER_TPL, id: "tpl-imported", name: "Imported"}
    mockList.mockResolvedValueOnce([BUILTIN_TPL])
    mockImport.mockResolvedValue(imported)
    mockList.mockResolvedValueOnce([BUILTIN_TPL, imported])
    renderOpen()
    await screen.findByTestId(`chapter-template-card-${BUILTIN_TPL.id}`)

    const input = screen.getByTestId("chapter-template-import-input")
    const file = new File(['{"format":"bibliogon-chapter-template"}'], "t.json", {
      type: "application/json",
    })
    fireEvent.change(input, {target: {files: [file]}})

    await waitFor(() => expect(mockImport).toHaveBeenCalledWith(file))
    // The list is re-read so the imported card appears.
    await waitFor(() =>
      expect(
        screen.getByTestId(`chapter-template-card-${imported.id}`),
      ).toBeTruthy(),
    )
  })

  it("a rejected import leaves the list untouched", async () => {
    mockList.mockResolvedValue([BUILTIN_TPL])
    mockImport.mockRejectedValue(new Error("Not a Bibliogon chapter template"))
    renderOpen()
    await screen.findByTestId(`chapter-template-card-${BUILTIN_TPL.id}`)

    fireEvent.change(screen.getByTestId("chapter-template-import-input"), {
      target: {files: [new File(["{}"], "x.json")]},
    })

    await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1))
    // One load on open, none after the failure.
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(
      screen.getByTestId(`chapter-template-card-${BUILTIN_TPL.id}`),
    ).toBeTruthy()
  })
})
