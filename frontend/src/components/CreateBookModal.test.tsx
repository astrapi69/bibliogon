/**
 * Tests for CreateBookModal.
 *
 * Covers: required field validation, form submission with trimming,
 * collapsible optional fields, series toggle conditional fields,
 * genre-to-key mapping, form reset after submit.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import CreateBookModal from "./CreateBookModal"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const mockListTemplates = vi.fn()

vi.mock("../api/client", () => ({
  api: {
    settings: {
      getApp: vi.fn().mockResolvedValue({author: {name: "", pen_names: []}}),
    },
    templates: {
      list: () => mockListTemplates(),
    },
  },
}))

describe("CreateBookModal", () => {
  const onClose = vi.fn()
  const onCreate = vi.fn()
  const onCreateFromTemplate = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onCreate.mockClear()
    onCreateFromTemplate.mockClear()
    mockListTemplates.mockReset()
  })

  function renderModal(open = true) {
    return render(
      <CreateBookModal
        open={open}
        onClose={onClose}
        onCreate={onCreate}
        onCreateFromTemplate={onCreateFromTemplate}
      />,
    )
  }

  it("renders title and author fields when open", async () => {
    renderModal()
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Der Titel deines Buches")).toBeTruthy()
    })
    expect(screen.getByText("Neues Buch")).toBeTruthy()
  })

  it("submit button is disabled when title is empty", async () => {
    renderModal()
    await waitFor(() => {
      expect(screen.getByText("Erstellen")).toBeTruthy()
    })
    const submitBtn = screen.getByText("Erstellen")
    expect(submitBtn).toBeDisabled()
  })

  it("submit button is disabled when author is empty", async () => {
    renderModal()
    const titleInput = screen.getByPlaceholderText("Der Titel deines Buches")
    fireEvent.change(titleInput, {target: {value: "My Book"}})

    const submitBtn = screen.getByText("Erstellen")
    expect(submitBtn).toBeDisabled()
  })

  it("calls onCreate with trimmed title and author", async () => {
    renderModal()
    const titleInput = screen.getByPlaceholderText("Der Titel deines Buches")
    const authorInput = screen.getByPlaceholderText("Autorenname oder Pen Name")

    fireEvent.change(titleInput, {target: {value: "  My Book  "}})
    fireEvent.change(authorInput, {target: {value: "  Author Name  "}})

    fireEvent.click(screen.getByText("Erstellen"))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const arg = onCreate.mock.calls[0][0]
    expect(arg.title).toBe("My Book")
    expect(arg.author).toBe("Author Name")
    expect(arg.language).toBe("de")
  })

  it("does not call onCreate when submit with whitespace-only title", async () => {
    renderModal()
    const titleInput = screen.getByPlaceholderText("Der Titel deines Buches")
    const authorInput = screen.getByPlaceholderText("Autorenname oder Pen Name")

    fireEvent.change(titleInput, {target: {value: "   "}})
    fireEvent.change(authorInput, {target: {value: "Author"}})

    // Button should be disabled
    expect(screen.getByText("Erstellen")).toBeDisabled()
  })

  it("cancel button calls onClose", async () => {
    renderModal()
    fireEvent.click(screen.getByText("Abbrechen"))
    expect(onClose).toHaveBeenCalled()
  })

  it("optional fields are collapsed by default", async () => {
    renderModal()
    // Genre placeholder should not be visible when collapsed
    expect(screen.queryByPlaceholderText("Genre waehlen oder eingeben...")).toBeNull()
    // The toggle button should be visible
    expect(screen.getByText("Weitere Details")).toBeTruthy()
  })

  it("expanding details shows genre and subtitle fields", async () => {
    renderModal()
    fireEvent.click(screen.getByText("Weitere Details"))

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Genre waehlen oder eingeben..."),
      ).toBeTruthy()
    })
    expect(screen.getByPlaceholderText("Optional")).toBeTruthy()
  })

  it("series fields appear when series checkbox is checked", async () => {
    renderModal()
    fireEvent.click(screen.getByText("Weitere Details"))

    await waitFor(() => {
      expect(screen.getByText("Teil einer Serie")).toBeTruthy()
    })

    // Series fields should not be visible yet
    expect(screen.queryByPlaceholderText("z.B. Das unsterbliche Muster")).toBeNull()

    // Check the series checkbox
    const checkbox = screen.getByRole("checkbox")
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("z.B. Das unsterbliche Muster"),
      ).toBeTruthy()
    })
  })

  it("includes optional fields in submission when filled", async () => {
    renderModal()

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
      target: {value: "Book"},
    })
    fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
      target: {value: "Author"},
    })

    // Expand and fill optional
    fireEvent.click(screen.getByText("Weitere Details"))
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Genre waehlen oder eingeben..."),
      ).toBeTruthy()
    })

    fireEvent.change(
      screen.getByPlaceholderText("Genre waehlen oder eingeben..."),
      {target: {value: "Fantasy"}},
    )
    fireEvent.change(screen.getByPlaceholderText("Optional"), {
      target: {value: "A Subtitle"},
    })

    fireEvent.click(screen.getByText("Erstellen"))

    const arg = onCreate.mock.calls[0][0]
    expect(arg.genre).toBe("fantasy") // mapped to key
    expect(arg.subtitle).toBe("A Subtitle")
  })

  it("resets form fields after successful submit", async () => {
    renderModal()

    fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
      target: {value: "Book"},
    })
    fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
      target: {value: "Author"},
    })

    fireEvent.click(screen.getByText("Erstellen"))

    // After submit, fields should be reset
    const titleInput = screen.getByPlaceholderText(
      "Der Titel deines Buches",
    ) as HTMLInputElement
    expect(titleInput.value).toBe("")
  })

  // --- Template mode ---

  /**
   * Radix Tabs reacts to the pointerdown event, not to a plain click. In the
   * happy-dom environment we dispatch the pointer/mouse sequence explicitly.
   */
  function clickTab(testId: string) {
    const el = screen.getByTestId(testId)
    fireEvent.pointerDown(el, {button: 0})
    fireEvent.mouseDown(el, {button: 0})
    fireEvent.pointerUp(el, {button: 0})
    fireEvent.mouseUp(el, {button: 0})
    fireEvent.click(el)
  }

  const FAKE_TEMPLATES = [
    {
      id: "tpl-scifi",
      name: "Sci-Fi Novel",
      description: "A sci-fi story",
      genre: "scifi",
      language: "en",
      is_builtin: true,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
      chapters: [
        {position: 0, title: "Chapter 1", chapter_type: "chapter", content: null},
        {position: 1, title: "Chapter 2", chapter_type: "chapter", content: null},
      ],
    },
    {
      id: "tpl-memoir",
      name: "Memoir",
      description: "A memoir",
      genre: "memoir",
      language: "de",
      is_builtin: true,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
      chapters: [
        {position: 0, title: "Page 1", chapter_type: "chapter", content: null},
      ],
    },
  ]

  it("renders both mode tabs", async () => {
    mockListTemplates.mockResolvedValue([])
    renderModal()
    expect(screen.getByTestId("create-book-mode-blank")).toBeTruthy()
    expect(screen.getByTestId("create-book-mode-template")).toBeTruthy()
  })

  it("switching to template mode fetches and shows templates", async () => {
    mockListTemplates.mockResolvedValue(FAKE_TEMPLATES)
    renderModal()
    clickTab("create-book-mode-template")

    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText("Sci-Fi Novel")).toBeTruthy()
      expect(screen.getByText("Memoir")).toBeTruthy()
    })
  })

  it("create button is disabled in template mode until a template is selected", async () => {
    mockListTemplates.mockResolvedValue(FAKE_TEMPLATES)
    renderModal()

    // Fill required fields first
    fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
      target: {value: "My Book"},
    })
    fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
      target: {value: "Author"},
    })

    // Switch to template mode
    clickTab("create-book-mode-template")

    await waitFor(() => {
      expect(screen.getByText("Sci-Fi Novel")).toBeTruthy()
    })

    // Button still disabled because no template selected
    expect(screen.getByText("Erstellen")).toBeDisabled()

    // Select a template
    fireEvent.click(screen.getByTestId("template-card-tpl-scifi"))
    expect(screen.getByText("Erstellen")).not.toBeDisabled()
  })

  it("submit in template mode calls onCreateFromTemplate with template_id", async () => {
    mockListTemplates.mockResolvedValue(FAKE_TEMPLATES)
    renderModal()

    fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
      target: {value: "My Memoir"},
    })
    fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
      target: {value: "Aster"},
    })

    clickTab("create-book-mode-template")
    await waitFor(() => {
      expect(screen.getByText("Memoir")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("template-card-tpl-memoir"))

    fireEvent.click(screen.getByText("Erstellen"))

    expect(onCreateFromTemplate).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
    const arg = onCreateFromTemplate.mock.calls[0][0]
    expect(arg.template_id).toBe("tpl-memoir")
    expect(arg.title).toBe("My Memoir")
    expect(arg.author).toBe("Aster")
    // Selected template had language "de"; picker pre-fills it
    expect(arg.language).toBe("de")
  })

  it("shows 'no templates' state when the list is empty", async () => {
    mockListTemplates.mockResolvedValue([])
    renderModal()
    clickTab("create-book-mode-template")

    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalled()
    })
    await waitFor(() => {
      // Fallback text from t("ui.create_book.template_empty", "Keine Vorlagen verfuegbar")
      expect(screen.getByText(/Keine Vorlagen/i)).toBeTruthy()
    })
  })

  it("shows error state when template fetch fails", async () => {
    mockListTemplates.mockRejectedValue(new Error("boom"))
    renderModal()
    clickTab("create-book-mode-template")

    await waitFor(() => {
      // Fallback text from t("ui.create_book.template_load_error", "Vorlagen konnten nicht geladen werden")
      expect(screen.getByText(/konnten nicht geladen/i)).toBeTruthy()
    })
  })
})
