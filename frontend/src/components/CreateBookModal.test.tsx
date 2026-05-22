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
import {BookTypesProvider} from "../hooks/useBookTypes"
import type {BookTypeDef} from "../api/client"

// BOOK-TYPES-SSOT-YAML-01 C6: CreateBookModal now reads the
// BookType registry to drive the template-tab visibility
// (capabilities.template_catalog). Static test snapshot.
const TEST_BOOK_TYPES: Record<string, BookTypeDef> = {
  prose: {
    id: "prose",
    label_key: "ui.get_started.book_type_prose_title",
    description_key: "ui.get_started.book_type_prose_desc",
    icon: "BookOpen",
    content_model: "chapters",
    editor_component: "BookEditor",
    capabilities: {
      ebook_export: true,
      paperback_export: true,
      hardcover_export: true,
      audiobook_export: true,
      template_catalog: true,
      kdp_package_supported: true,
    },
    dashboard_create_visible: true,
    immutable_after_create: true,
    default_page_size: null,
  },
  picture_book: {
    id: "picture_book",
    label_key: "ui.get_started.book_type_picture_title",
    description_key: "ui.get_started.book_type_picture_desc",
    icon: "Image",
    content_model: "pages",
    editor_component: "PageEditor",
    capabilities: {
      ebook_export: false,
      paperback_export: true,
      hardcover_export: false,
      audiobook_export: false,
      template_catalog: false,
      kdp_package_supported: true,
    },
    dashboard_create_visible: true,
    immutable_after_create: true,
    default_page_size: "8.5x8.5",
  },
}

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const mockListTemplates = vi.fn()
const mockDeleteTemplate = vi.fn()
const mockConfirm = vi.fn()
const mockListAuthors = vi.fn()
const mockCreateAuthor = vi.fn()

vi.mock("../api/client", () => ({
  api: {
    settings: {
      getApp: vi.fn().mockResolvedValue({author: {name: "", pen_names: []}}),
    },
    templates: {
      list: () => mockListTemplates(),
      delete: (id: string) => mockDeleteTemplate(id),
    },
    authors: {
      list: (...args: unknown[]) => mockListAuthors(...args),
      create: (...args: unknown[]) => mockCreateAuthor(...args),
    },
  },
  ApiError: class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.status = status
      this.detail = detail
    }
  },
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

describe("CreateBookModal", () => {
  const onClose = vi.fn()
  const onCreate = vi.fn()
  const onCreateFromTemplate = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onCreate.mockClear()
    onCreateFromTemplate.mockClear()
    mockListTemplates.mockReset()
    mockDeleteTemplate.mockReset()
    mockConfirm.mockReset()
    mockListAuthors.mockReset()
    mockCreateAuthor.mockReset()
    // Default: Authors-DB is empty; create returns whatever was sent.
    mockListAuthors.mockResolvedValue([])
    mockCreateAuthor.mockImplementation((data) =>
      Promise.resolve({
        id: "new-author-id",
        name: data.name,
        slug: data.name.toLowerCase().replace(/\s+/g, "-"),
        bio: null,
        created_at: "2026-05-19T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z",
      }),
    )
  })

  function renderModal(open = true, bookType?: "prose" | "picture_book") {
    return render(
      <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
        <CreateBookModal
          open={open}
          onClose={onClose}
          onCreate={onCreate}
          onCreateFromTemplate={onCreateFromTemplate}
          bookType={bookType}
        />
      </BookTypesProvider>,
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

    // handleSubmit is async now (Authors-DB create runs before
    // onCreate); wait for the chain to resolve.
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
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
    expect(screen.queryByPlaceholderText("Genre wählen oder eingeben...")).toBeNull()
    // The toggle button should be visible
    expect(screen.getByText("Weitere Details")).toBeTruthy()
  })

  it("expanding details shows genre and subtitle fields", async () => {
    renderModal()
    fireEvent.click(screen.getByText("Weitere Details"))

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Genre wählen oder eingeben..."),
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
        screen.getByPlaceholderText("Genre wählen oder eingeben..."),
      ).toBeTruthy()
    })

    fireEvent.change(
      screen.getByPlaceholderText("Genre wählen oder eingeben..."),
      {target: {value: "Fantasy"}},
    )
    fireEvent.change(screen.getByPlaceholderText("Optional"), {
      target: {value: "A Subtitle"},
    })

    fireEvent.click(screen.getByText("Erstellen"))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
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

    // After submit, fields should be reset (handleSubmit is async
    // now; resetForm runs after the awaited author + book POST chain).
    await waitFor(() => {
      const titleInput = screen.getByPlaceholderText(
        "Der Titel deines Buches",
      ) as HTMLInputElement
      expect(titleInput.value).toBe("")
    })
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

    await waitFor(() => expect(onCreateFromTemplate).toHaveBeenCalledTimes(1))
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
      // Fallback text from t("ui.create_book.template_empty", "Keine Vorlagen verfügbar")
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

  // --- User template delete flow (TM-05) ---

  const USER_TPL = {
    id: "tpl-user",
    name: "My Custom",
    description: "Mine",
    genre: "memoir",
    language: "en",
    is_builtin: false,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
    chapters: [{position: 0, title: "x", chapter_type: "chapter", content: null}],
  }

  it("user templates have a delete button, builtins show a badge", async () => {
    mockListTemplates.mockResolvedValue([FAKE_TEMPLATES[0], USER_TPL])
    renderModal()
    clickTab("create-book-mode-template")

    await waitFor(() => {
      expect(screen.getByText("My Custom")).toBeTruthy()
    })

    // Builtin card: badge visible, no delete button
    expect(screen.getByTestId("template-builtin-badge-tpl-scifi")).toBeTruthy()
    expect(screen.queryByTestId("template-delete-tpl-scifi")).toBeNull()

    // User card: delete button visible, no builtin badge
    expect(screen.getByTestId("template-delete-tpl-user")).toBeTruthy()
    expect(screen.queryByTestId("template-builtin-badge-tpl-user")).toBeNull()
  })

  it("clicking delete on a user template confirms then calls api.templates.delete", async () => {
    mockListTemplates.mockResolvedValue([USER_TPL])
    mockConfirm.mockResolvedValue(true)
    mockDeleteTemplate.mockResolvedValue(undefined)
    renderModal()
    clickTab("create-book-mode-template")

    await waitFor(() => {
      expect(screen.getByTestId("template-delete-tpl-user")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("template-delete-tpl-user"))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockDeleteTemplate).toHaveBeenCalledWith("tpl-user"))
    await waitFor(() => {
      expect(screen.queryByText("My Custom")).toBeNull()
    })
  })

  it("delete cancelled by user does not call the API", async () => {
    mockListTemplates.mockResolvedValue([USER_TPL])
    mockConfirm.mockResolvedValue(false)
    renderModal()
    clickTab("create-book-mode-template")

    await waitFor(() => {
      expect(screen.getByTestId("template-delete-tpl-user")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("template-delete-tpl-user"))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    expect(mockDeleteTemplate).not.toHaveBeenCalled()
    // Card still rendered
    expect(screen.getByText("My Custom")).toBeTruthy()
  })

  // --- PB-PHASE4 Session 3 Commit 9: bookType prop ---

  describe("bookType prop (picture-book branch)", () => {
    it("defaults to prose: title is 'Neues Buch' + Template tab visible", async () => {
      renderModal()
      await waitFor(() =>
        expect(screen.getByTestId("create-book-title-prose")).toBeTruthy(),
      )
      expect(screen.getByText("Neues Buch")).toBeTruthy()
      expect(screen.getByTestId("create-book-mode-template")).toBeTruthy()
    })

    it("with bookType='picture_book': title switches + Template tab hides", async () => {
      renderModal(true, "picture_book")
      await waitFor(() =>
        expect(
          screen.getByTestId("create-book-title-picture_book"),
        ).toBeTruthy(),
      )
      expect(screen.getByText("Neues Bilderbuch")).toBeTruthy()
      expect(screen.queryByTestId("create-book-mode-template")).toBeNull()
      expect(screen.queryByTestId("create-book-mode-blank")).toBeNull()
    })

    it("submit with bookType='picture_book' threads book_type='picture_book' into onCreate", async () => {
      renderModal(true, "picture_book")
      await waitFor(() =>
        expect(screen.getByPlaceholderText("Der Titel deines Buches")).toBeTruthy(),
      )
      fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: {value: "My PB"},
      })
      fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
        target: {value: "Author"},
      })
      fireEvent.click(screen.getByText("Erstellen"))
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      const payload = onCreate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.title).toBe("My PB")
      expect(payload.author).toBe("Author")
      expect(payload.book_type).toBe("picture_book")
    })

    it("submit with default (prose) does NOT include book_type in the payload", async () => {
      renderModal()
      await waitFor(() =>
        expect(screen.getByPlaceholderText("Der Titel deines Buches")).toBeTruthy(),
      )
      fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: {value: "Prose"},
      })
      fireEvent.change(screen.getByPlaceholderText("Autorenname oder Pen Name"), {
        target: {value: "A"},
      })
      fireEvent.click(screen.getByText("Erstellen"))
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      const payload = onCreate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.book_type).toBeUndefined()
    })
  })

  /**
   * Bug-fix 2026-05-19: Authors-Database integration (closes the
   * pre-vs-post-AuthorsDB pattern gap where CreateBookModal still
   * used the older user-identity-only choices even after Authors-DB
   * shipped in v0.34.0). Mirrors the ConvertToBookWizard's Bug 8
   * Phase 2 pattern.
   */
  describe("Authors-Database integration", () => {
    it("fetches global Authors-DB on open and exposes datalist", async () => {
      mockListAuthors.mockResolvedValue([
        {
          id: "a1",
          name: "Aster Raptis",
          slug: "aster-raptis",
          bio: null,
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ])
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      await waitFor(() =>
        expect(screen.getByTestId("create-book-author-datalist")).toBeTruthy(),
      )
      // Suggestion option for the seeded author renders inside the
      // datalist (browser shows it as a dropdown; happy-dom exposes
      // the <option> elements).
      await waitFor(() =>
        expect(
          screen.getByTestId("create-book-author-suggestion-Aster Raptis"),
        ).toBeTruthy(),
      )
    })

    it("Add-to-Authors-DB checkbox is VISIBLE when typed author is new", async () => {
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "Brand New Name"}},
      )
      await waitFor(() =>
        expect(
          screen.getByTestId("create-book-add-to-authors-checkbox"),
        ).toBeTruthy(),
      )
    })

    it("Add-to-Authors-DB checkbox is HIDDEN when typed author already in DB", async () => {
      mockListAuthors.mockResolvedValue([
        {
          id: "a1",
          name: "Existing Author",
          slug: "existing-author",
          bio: null,
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ])
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "Existing Author"}},
      )
      // Checkbox disappears when name matches existing entry
      // (case-insensitive + trim).
      await waitFor(() =>
        expect(
          screen.queryByTestId("create-book-add-to-authors-checkbox"),
        ).toBeNull(),
      )
    })

    it("Add-to-DB checkbox hidden also when name matches case-insensitively", async () => {
      mockListAuthors.mockResolvedValue([
        {
          id: "a1",
          name: "Aster Raptis",
          slug: "aster-raptis",
          bio: null,
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ])
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "  aster raptis  "}},
      )
      await waitFor(() =>
        expect(
          screen.queryByTestId("create-book-add-to-authors-checkbox"),
        ).toBeNull(),
      )
    })

    it("on submit, creates author in Authors-DB BEFORE book POST when checkbox checked + name is new", async () => {
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: {value: "My Book"},
      })
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "Fresh Author"}},
      )
      // Default-checked; just click submit.
      fireEvent.click(screen.getByText("Erstellen"))
      await waitFor(() => expect(mockCreateAuthor).toHaveBeenCalledTimes(1))
      expect(mockCreateAuthor.mock.calls[0][0]).toEqual({name: "Fresh Author"})
      // Book create still fires after the author create:
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      expect(onCreate.mock.calls[0][0].author).toBe("Fresh Author")
    })

    it("on submit with checkbox UNchecked, skips author create but still creates book", async () => {
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: {value: "My Book"},
      })
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "Anonymous Pen Name"}},
      )
      // Uncheck the checkbox before submitting:
      const checkbox = await screen.findByTestId(
        "create-book-add-to-authors-checkbox",
      )
      fireEvent.click(checkbox)
      fireEvent.click(screen.getByText("Erstellen"))
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      expect(mockCreateAuthor).not.toHaveBeenCalled()
    })

    it("on submit when author already in DB, skips create (no checkbox to check)", async () => {
      mockListAuthors.mockResolvedValue([
        {
          id: "a1",
          name: "Existing Author",
          slug: "existing-author",
          bio: null,
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
        },
      ])
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: {value: "My Book"},
      })
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "Existing Author"}},
      )
      fireEvent.click(screen.getByText("Erstellen"))
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      // No author create — the name already exists in the DB.
      expect(mockCreateAuthor).not.toHaveBeenCalled()
    })

    it("on author-create failure, book create still proceeds (fail-soft pattern)", async () => {
      mockCreateAuthor.mockRejectedValue(new Error("Network down"))
      renderModal()
      await waitFor(() => expect(mockListAuthors).toHaveBeenCalled())
      fireEvent.change(screen.getByPlaceholderText("Der Titel deines Buches"), {
        target: {value: "My Book"},
      })
      fireEvent.change(
        screen.getByPlaceholderText("Autorenname oder Pen Name"),
        {target: {value: "Fresh Author"}},
      )
      fireEvent.click(screen.getByText("Erstellen"))
      // Author create was attempted...
      await waitFor(() => expect(mockCreateAuthor).toHaveBeenCalledTimes(1))
      // ...but the book create still fires regardless.
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
      expect(onCreate.mock.calls[0][0].author).toBe("Fresh Author")
    })
  })
})
