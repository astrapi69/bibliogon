/**
 * Tests for BookMetadataEditor.
 *
 * Covers: form initialization from book data, save button triggers
 * onSave with correct payload, tab navigation renders correct fields,
 * copy-from-book dialog, keywords integration, save error handling.
 *
 * The audiobook sub-component (AudiobookBookConfig) is tested at a
 * high level (tab renders, engine select visible) but not in full
 * depth - voice fetching and TTS integration are better covered by
 * E2E tests.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import BookMetadataEditor from "./BookMetadataEditor"
import type {BookDetail, Book} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

vi.mock("./AppDialog", () => ({
  useDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn().mockResolvedValue(null),
    alert: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock("../hooks/useAuthorChoices", () => ({
  useAuthorChoices: () => [],
}))

vi.mock("../hooks/useAuthorProfile", () => ({
  useAuthorProfile: () => ({
    name: "Test Author",
    pen_names: ["Pen One", "Pen Two"],
  }),
  profileDisplayNames: (p: {name: string; pen_names: string[]} | null) => {
    if (!p) return []
    const out: string[] = []
    if (p.name) out.push(p.name)
    out.push(...p.pen_names)
    return out
  },
}))

const assetsListMock = vi.fn().mockResolvedValue([])
const assetsDeleteMock = vi.fn().mockResolvedValue(undefined)

vi.mock("../api/client", () => ({
  api: {
    audiobook: {
      listVoices: vi.fn().mockResolvedValue([]),
    },
    bookAudiobook: {
      get: vi.fn().mockResolvedValue(null),
    },
    settings: {
      getApp: vi.fn().mockResolvedValue({}),
    },
    assets: {
      list: (...args: unknown[]) => assetsListMock(...args),
      delete: (...args: unknown[]) => assetsDeleteMock(...args),
    },
    translations: {
      list: vi.fn().mockResolvedValue({
        book_id: "book-1",
        translation_group_id: null,
        siblings: [],
      }),
      link: vi.fn(),
      unlink: vi.fn(),
    },
    books: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
  ApiError: class extends Error {
    detail: string
    constructor(s: number, d: string) {
      super(d)
      this.detail = d
    }
  },
  formatVoiceLabel: (v: {id: string}) => v.id,
}))

vi.mock("../utils/notify", () => ({
  notify: {error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn()},
}))

// PGS-04 ``TranslationLinks`` (mounted by the General tab) calls
// ``useNavigate``; without a Router the mount throws and every
// metadata-editor test fails. Stub the hook here.
vi.mock("react-router-dom", async () => ({
  useNavigate: () => vi.fn(),
}))

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    id: "book-1",
    title: "Test Book",
    subtitle: "A Subtitle",
    author: "Author",
    language: "de",
    genre: "fantasy",
    series: null,
    series_index: null,
    description: "A description",
    edition: "1st",
    publisher: "Test Publisher",
    publisher_city: "Berlin",
    publish_date: "2026",
    isbn_ebook: "978-0-123",
    isbn_paperback: null,
    isbn_hardcover: null,
    asin_ebook: null,
    asin_paperback: null,
    asin_hardcover: null,
    keywords: ["fantasy", "adventure"],
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-04-12T00:00:00Z",
    chapters: [
      {id: "ch-1", title: "Chapter 1", content: "{}", position: 0, chapter_type: "chapter", book_id: "book-1", created_at: "", updated_at: ""},
    ],
    ...overrides,
  } as BookDetail
}

describe("BookMetadataEditor", () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onBack = vi.fn()

  beforeEach(() => {
    onSave.mockClear()
    onBack.mockClear()
  })

  function renderEditor(bookOverrides: Partial<BookDetail> = {}, allBooks?: Book[]) {
    return render(
      <BookMetadataEditor
        book={makeBook(bookOverrides)}
        onSave={onSave}
        onBack={onBack}
        allBooks={allBooks}
      />,
    )
  }

  // --- Header ---

  it("renders the metadata heading", () => {
    renderEditor()
    expect(screen.getByText("Buch-Metadaten")).toBeTruthy()
  })

  it("back button calls onBack", () => {
    renderEditor()
    fireEvent.click(screen.getByTitle("Zurück"))
    expect(onBack).toHaveBeenCalled()
  })

  it("save button has correct testid", () => {
    renderEditor()
    expect(screen.getByTestId("metadata-save")).toBeTruthy()
  })

  // --- Tabs ---

  it("renders all 6 tab triggers", () => {
    renderEditor()
    expect(screen.getByText("Allgemein")).toBeTruthy()
    expect(screen.getByText("Verlag")).toBeTruthy()
    expect(screen.getByText("ISBN")).toBeTruthy()
    expect(screen.getByText("Marketing")).toBeTruthy()
    expect(screen.getByText("Design")).toBeTruthy()
    expect(screen.getByText("Audiobook")).toBeTruthy()
  })

  it("general tab is shown by default with subtitle field", () => {
    renderEditor()
    const subtitleInput = screen.getByDisplayValue("A Subtitle")
    expect(subtitleInput).toBeTruthy()
  })

  it("general tab shows description field", () => {
    renderEditor({description: "My description"})
    expect(screen.getByDisplayValue("My description")).toBeTruthy()
  })

  it("general tab is active by default", () => {
    renderEditor()
    const generalTab = screen.getByText("Allgemein")
    expect(generalTab.getAttribute("data-state")).toBe("active")
  })

  it("ISBN tab trigger exists with correct role", () => {
    renderEditor()
    const isbnTab = screen.getByText("ISBN")
    expect(isbnTab.getAttribute("role")).toBe("tab")
  })

  it("marketing tab has the testid", () => {
    renderEditor()
    expect(screen.getByTestId("metadata-tab-marketing")).toBeTruthy()
  })

  it("all tab panels are present in the DOM", () => {
    renderEditor()
    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect(panels.length).toBe(7)
  })

  // --- Save ---

  it("save triggers onSave with form data", async () => {
    renderEditor()

    fireEvent.click(screen.getByTestId("metadata-save"))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })

    const savedData = onSave.mock.calls[0][0]
    expect(savedData.subtitle).toBe("A Subtitle")
    expect(savedData.keywords).toEqual(["fantasy", "adventure"])
  })

  it("save shows success notification", async () => {
    const {notify} = await import("../utils/notify")
    renderEditor()

    fireEvent.click(screen.getByTestId("metadata-save"))

    await waitFor(() => {
      expect(notify.success).toHaveBeenCalled()
    })
  })

  it("save shows error notification on failure", async () => {
    const {notify} = await import("../utils/notify")
    onSave.mockRejectedValueOnce(new Error("Save failed"))
    renderEditor()

    fireEvent.click(screen.getByTestId("metadata-save"))

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalled()
    })
  })

  // --- Form field editing ---

  it("editing a field updates form state", () => {
    renderEditor()
    const subtitleInput = screen.getByDisplayValue("A Subtitle") as HTMLInputElement
    fireEvent.change(subtitleInput, {target: {value: "New Subtitle"}})
    expect(subtitleInput.value).toBe("New Subtitle")
  })

  it("empty fields are saved as null", async () => {
    renderEditor({subtitle: ""})

    fireEvent.click(screen.getByTestId("metadata-save"))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled()
    })

    const savedData = onSave.mock.calls[0][0]
    expect(savedData.subtitle).toBeNull()
  })

  // --- Copy from book ---

  it("shows copy button when other books exist", () => {
    const otherBooks = [
      makeBook({id: "book-2", title: "Other Book", author: "Other Author"}),
    ]
    renderEditor({}, otherBooks)
    expect(screen.getByText("Von Buch übernehmen")).toBeTruthy()
  })

  it("hides copy button when no other books", () => {
    renderEditor()
    expect(screen.queryByText("Von Buch übernehmen")).toBeNull()
  })

  it("copy dialog shows other books when clicked", () => {
    const otherBooks = [
      makeBook({
        id: "book-2",
        title: "Source Book",
        author: "Source Author",
        publisher: "Source Publisher",
      }),
    ]
    renderEditor({}, otherBooks)
    fireEvent.click(screen.getByText("Von Buch übernehmen"))
    expect(screen.getByText(/Source Book/)).toBeTruthy()
  })

  // --- Audiobook settings ---

  it("audiobook tab trigger has correct role", () => {
    renderEditor({language: "en"})
    const audioTab = screen.getByText("Audiobook")
    expect(audioTab.getAttribute("role")).toBe("tab")
  })
})

// --- HTML description preview sanitization ---

import {sanitizeAmazonHtml} from "./BookMetadataEditor"

describe("sanitizeAmazonHtml", () => {
  it("preserves allowed Amazon tags", () => {
    const html = "<b>bold</b> <i>italic</i> <em>em</em> <strong>strong</strong> <u>underline</u>"
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<b>bold</b>")
    expect(result).toContain("<i>italic</i>")
    expect(result).toContain("<em>em</em>")
    expect(result).toContain("<strong>strong</strong>")
    expect(result).toContain("<u>underline</u>")
  })

  it("preserves list tags", () => {
    const html = "<ul><li>item 1</li><li>item 2</li></ul>"
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<ul>")
    expect(result).toContain("<li>")
  })

  it("preserves allowed heading tags", () => {
    const html = "<h4>heading 4</h4><h5>heading 5</h5><h6>heading 6</h6>"
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<h4>")
    expect(result).toContain("<h5>")
    expect(result).toContain("<h6>")
  })

  it("preserves paragraph and break tags", () => {
    const html = "<p>paragraph</p><br>"
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<p>")
    expect(result).toContain("<br>")
  })

  it("strips script tags", () => {
    const html = '<b>safe</b><script>alert("xss")</script>'
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<b>safe</b>")
    expect(result).not.toContain("script")
    expect(result).not.toContain("alert")
  })

  it("strips style tags", () => {
    const html = "<p>text</p><style>body{color:red}</style>"
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<p>text</p>")
    expect(result).not.toContain("style")
    expect(result).not.toContain("color")
  })

  it("strips iframe tags", () => {
    // No src attribute so happy-dom's HTML parser does not try to resolve
    // or load a page. The sanitizer strips the tag regardless of src.
    const html = "<p>safe</p><iframe></iframe>"
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<p>safe</p>")
    expect(result).not.toContain("iframe")
  })

  it("strips all attributes", () => {
    const html = '<b style="color:red" class="big" onclick="alert()">text</b>'
    const result = sanitizeAmazonHtml(html)
    expect(result).toContain("<b>text</b>")
    expect(result).not.toContain("style")
    expect(result).not.toContain("class")
    expect(result).not.toContain("onclick")
  })

  it("returns empty string for empty input", () => {
    expect(sanitizeAmazonHtml("")).toBe("")
  })
})

// --- HtmlFieldWithPreview toggle behavior ---

import {HtmlFieldWithPreview} from "./BookMetadataEditor"

describe("HtmlFieldWithPreview", () => {
  it("renders textarea by default", () => {
    render(
      <HtmlFieldWithPreview label="Description" value="<b>bold</b>" onChange={() => {}} />,
    )
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("shows preview when toggle is clicked", () => {
    render(
      <HtmlFieldWithPreview label="Description" value="<b>bold</b>" onChange={() => {}} />,
    )
    fireEvent.click(screen.getByTestId("html-preview-toggle"))
    // Textarea should be gone, preview should show rendered content
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByText("bold")).toBeInTheDocument()
  })

  it("shows textarea again when toggled back", () => {
    render(
      <HtmlFieldWithPreview label="Description" value="<b>bold</b>" onChange={() => {}} />,
    )
    const toggle = screen.getByTestId("html-preview-toggle")
    fireEvent.click(toggle) // show preview
    fireEvent.click(toggle) // back to textarea
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("calls onChange when typing in textarea", () => {
    const handleChange = vi.fn()
    render(
      <HtmlFieldWithPreview label="Description" value="" onChange={handleChange} />,
    )
    fireEvent.change(screen.getByRole("textbox"), {target: {value: "new text"}})
    expect(handleChange).toHaveBeenCalledWith("new text")
  })

  it("sanitizes dangerous HTML in preview", () => {
    render(
      <HtmlFieldWithPreview label="Test" value='<b>safe</b><script>alert("xss")</script>' onChange={() => {}} />,
    )
    fireEvent.click(screen.getByTestId("html-preview-toggle"))
    expect(screen.getByText("safe")).toBeInTheDocument()
    expect(screen.queryByText("alert")).not.toBeInTheDocument()
  })
})

// --- author + language in general tab ---

describe("BookMetadataEditor — author + language fields", () => {
  const onSave = vi.fn()
  const onBack = vi.fn()

  it("renders author as a select dropdown (not editable input)", () => {
    render(
      <BookMetadataEditor
        book={{
          id: "b1",
          title: "T",
          subtitle: null,
          author: "Test Author",
          language: "en",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          keywords: [],
          chapters: [],
          ai_tokens_used: 0,
        } as unknown as BookDetail}
        onSave={onSave}
        onBack={onBack}
      />,
    )
    const select = screen.getByTestId("metadata-author-select") as HTMLSelectElement
    expect(select.tagName).toBe("SELECT")
    expect(select.value).toBe("Test Author")
  })

  it("dropdown lists profile name + all pen names", () => {
    render(
      <BookMetadataEditor
        book={{
          id: "b3",
          title: "T",
          subtitle: null,
          author: "Test Author",
          language: "en",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          keywords: [],
          chapters: [],
          ai_tokens_used: 0,
        } as unknown as BookDetail}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    const select = screen.getByTestId("metadata-author-select")
    const options = select.querySelectorAll("option")
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value)
    expect(values).toContain("Test Author")
    expect(values).toContain("Pen One")
    expect(values).toContain("Pen Two")
  })

  it("unknown author value renders as disabled fallback option", () => {
    render(
      <BookMetadataEditor
        book={{
          id: "b4",
          title: "T",
          subtitle: null,
          author: "Stale Author",
          language: "en",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          keywords: [],
          chapters: [],
          ai_tokens_used: 0,
        } as unknown as BookDetail}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    const select = screen.getByTestId("metadata-author-select") as HTMLSelectElement
    expect(select.value).toBe("Stale Author")
    const staleOption = Array.from(
      select.querySelectorAll("option"),
    ).find((o) => (o as HTMLOptionElement).value === "Stale Author") as HTMLOptionElement
    expect(staleOption).toBeDefined()
    expect(staleOption.disabled).toBe(true)
    expect(staleOption.textContent).toContain("Stale Author")
  })

  it("manage-link is rendered next to the author field", () => {
    render(
      <BookMetadataEditor
        book={{
          id: "b5",
          title: "T",
          subtitle: null,
          author: "Test Author",
          language: "en",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          keywords: [],
          chapters: [],
          ai_tokens_used: 0,
        } as unknown as BookDetail}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByTestId("metadata-author-manage-link")).toBeInTheDocument()
  })

  it("changing dropdown selection updates form state", () => {
    render(
      <BookMetadataEditor
        book={{
          id: "b6",
          title: "T",
          subtitle: null,
          author: "Test Author",
          language: "en",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          keywords: [],
          chapters: [],
          ai_tokens_used: 0,
        } as unknown as BookDetail}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    const select = screen.getByTestId("metadata-author-select") as HTMLSelectElement
    fireEvent.change(select, {target: {value: "Pen One"}})
    expect(select.value).toBe("Pen One")
  })

  it("renders language input with current code", () => {
    render(
      <BookMetadataEditor
        book={{
          id: "b2",
          title: "T",
          subtitle: null,
          author: "A",
          language: "fr",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          keywords: [],
          chapters: [],
          ai_tokens_used: 0,
        } as unknown as BookDetail}
        onSave={onSave}
        onBack={onBack}
      />,
    )
    expect(screen.getByDisplayValue("fr")).toBeInTheDocument()
  })
})

// --- AuthorAssetsPanel (Design tab) ---

import {AuthorAssetsPanel} from "./BookMetadataEditor"

describe("AuthorAssetsPanel", () => {
  beforeEach(() => {
    assetsListMock.mockReset()
    assetsDeleteMock.mockReset()
  })

  it("panel hidden when no author-assets", async () => {
    assetsListMock.mockResolvedValue([])
    render(<AuthorAssetsPanel bookId="book-x"/>)
    await waitFor(() => expect(assetsListMock).toHaveBeenCalledWith("book-x"))
    expect(screen.queryByTestId("author-assets-panel")).not.toBeInTheDocument()
  })

  it("filters list to asset_type=author-asset", async () => {
    assetsListMock.mockResolvedValue([
      {id: "a1", filename: "figure.png", asset_type: "figure", path: "uploads/book-y/figure/figure.png"},
      {id: "a2", filename: "portrait.png", asset_type: "author-asset", path: "uploads/book-y/author-asset/portrait.png"},
      {id: "a3", filename: "signature.png", asset_type: "author-asset", path: "uploads/book-y/author-asset/signature.png"},
    ])
    render(<AuthorAssetsPanel bookId="book-y"/>)
    await waitFor(() =>
      expect(screen.getByTestId("author-assets-panel")).toBeInTheDocument(),
    )
    expect(screen.getByTestId("author-asset-portrait.png")).toBeInTheDocument()
    expect(screen.getByTestId("author-asset-signature.png")).toBeInTheDocument()
    expect(screen.queryByTestId("author-asset-figure.png")).not.toBeInTheDocument()
  })

  it("delete button removes asset from grid and calls api", async () => {
    assetsListMock.mockResolvedValue([
      {id: "a1", filename: "portrait.png", asset_type: "author-asset", path: "uploads/book-z/author-asset/portrait.png"},
    ])
    assetsDeleteMock.mockResolvedValue(undefined)
    render(<AuthorAssetsPanel bookId="book-z"/>)
    await waitFor(() =>
      expect(screen.getByTestId("author-asset-portrait.png")).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId("author-asset-delete-portrait.png"))
    await waitFor(() =>
      expect(assetsDeleteMock).toHaveBeenCalledWith("book-z", "a1"),
    )
    await waitFor(() =>
      expect(screen.queryByTestId("author-asset-portrait.png")).not.toBeInTheDocument(),
    )
  })
})
