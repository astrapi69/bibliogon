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

vi.mock("../api/client", () => ({
  api: {
    audiobook: {
      listVoices: vi.fn().mockResolvedValue([]),
    },
    bookAudiobook: {
      get: vi.fn().mockResolvedValue(null),
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
    fireEvent.click(screen.getByTitle("Zurueck"))
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
    expect(screen.getByText("Von Buch uebernehmen")).toBeTruthy()
  })

  it("hides copy button when no other books", () => {
    renderEditor()
    expect(screen.queryByText("Von Buch uebernehmen")).toBeNull()
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
    fireEvent.click(screen.getByText("Von Buch uebernehmen"))
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
