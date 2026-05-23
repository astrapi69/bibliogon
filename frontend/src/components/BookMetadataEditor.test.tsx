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
import {
    render as rtlRender,
    screen,
    fireEvent,
    waitFor,
    within,
    type RenderOptions,
} from "@testing-library/react"

import BookMetadataEditor from "./BookMetadataEditor"
import {ApiError, type BookDetail, type Book, type BookTypeDef} from "../api/client"
import {notify} from "../utils/notify"
import {BookTypesProvider} from "../hooks/useBookTypes"

// BOOK-TYPES-SSOT-YAML-01 C7: BookMetadataEditor now reads
// content_model from the registry to gate the Audiobook +
// Quality tabs. Wrap every render call with a BookTypesProvider
// so the hook resolves.
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
    comic_book: {
        id: "comic_book",
        label_key: "ui.get_started.book_type_comic_title",
        description_key: "ui.get_started.book_type_comic_desc",
        icon: "Layers",
        content_model: "pages",
        editor_component: "ComicBookEditor",
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
        default_page_size: "7x10",
    },
}

// Wrapped render that auto-wraps every test in BookTypesProvider.
// Existing render(<X />) call sites keep working without churn.
function render(ui: React.ReactElement, options?: RenderOptions) {
    return rtlRender(ui, {
        wrapper: ({children}) => (
            <BookTypesProvider initialTypes={TEST_BOOK_TYPES}>
                {children}
            </BookTypesProvider>
        ),
        ...options,
    })
}

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

const documentExportDownloadMock = vi.fn()

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
    documentExport: {
      download: (...args: unknown[]) => documentExportDownloadMock(...args),
    },
    kdp: {
      listCategories: vi.fn().mockResolvedValue([]),
    },
    authors: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(
        async ({name}: {name: string}) => ({
          id: `mock-${name}`,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          email: null,
          bio: null,
          website: null,
          social_links: {},
        }),
      ),
    },
  },
  ApiError: class extends Error {
    status: number
    detail: string
    endpoint: string
    method: string
    stacktrace: string
    timestamp: string
    constructor(
      s: number,
      d: string,
      endpoint: string = "",
      method: string = "GET",
      stacktrace: string = "",
      timestamp: string = "",
    ) {
      super(d)
      this.status = s
      this.detail = d
      this.endpoint = endpoint
      this.method = method
      this.stacktrace = stacktrace
      this.timestamp = timestamp
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
    book_type: "prose",
    title: "Test Book",
    subtitle: "A Subtitle",
    author: "Author",
    language: "de",
    genre: "fantasy",
    series: null,
    series_index: null,
    description: "A description",
    book_idea: null,
    expose: null,
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
    categories: [],
    bisac_codes: [],
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
    // 7 original + AI Template (Session 2 commit 5) + Story
    // (EXPOSE-BUCHIDEE-METADATA-01 C2) = 9 panels.
    expect(panels.length).toBe(9)
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
    // Bug 9: categories + bisac_codes also flow through onSave so
    // the backend PATCH receives the full Marketing-tab state.
    expect(savedData.categories).toEqual([])
    expect(savedData.bisac_codes).toEqual([])
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

  it("renders author as a free-text input pre-filled with current value", () => {
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
    const input = screen.getByTestId("metadata-author") as HTMLInputElement
    expect(input.tagName).toBe("INPUT")
    expect(input.value).toBe("Test Author")
  })

  it("datalist exposes profile name + all pen names as suggestions", () => {
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
    const datalist = screen.getByTestId("metadata-author-datalist")
    const values = Array.from(datalist.querySelectorAll("option")).map(
      (o) => (o as HTMLOptionElement).value,
    )
    expect(values).toContain("Test Author")
    expect(values).toContain("Pen One")
    expect(values).toContain("Pen Two")
  })

  it("unknown author value is accepted as free text (no disabled-fallback)", () => {
    // Pattern A regression: unfamiliar names (ghostwritten works,
    // collaborators, historical imports) survive as plain free-text
    // values. The OLD Pattern B forced them to appear as a disabled
    // <option> — that affordance is gone, and that is the intended
    // behavior change. The new pin is "the value renders as-is."
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
    const input = screen.getByTestId("metadata-author") as HTMLInputElement
    expect(input.value).toBe("Stale Author")
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

  it("typing in the author input updates form state", () => {
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
    const input = screen.getByTestId("metadata-author") as HTMLInputElement
    fireEvent.change(input, {target: {value: "Pen One"}})
    expect(input.value).toBe("Pen One")
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

// ---------------------------------------------------------------------------
// Bug 9: Categories + BISAC fields in the Marketing tab
// ---------------------------------------------------------------------------

describe("BookMetadataEditor — Bug 9 Categories + BISAC", () => {
    const localOnSave = vi.fn().mockResolvedValue(undefined)
    const localOnBack = vi.fn()

    beforeEach(() => {
        localOnSave.mockClear()
        localOnBack.mockClear()
    })

    function renderBookMeta(overrides: Partial<BookDetail> = {}) {
        const result = render(
            <BookMetadataEditor
                book={makeBook(overrides)}
                onSave={localOnSave}
                onBack={localOnBack}
            />,
        )
        // HOTFIX (Categories+BISAC tab-leak bug): forceMount was
        // removed from the Marketing Tabs.Content, so inactive
        // tabs no longer render their content in the DOM. Click
        // the Marketing tab once after mount so Bug 9 testids
        // (metadata-categories-field, metadata-bisac-field,
        // category-input, bisac-input, etc.) are queryable.
        // Radix Tabs.Trigger uses onMouseDown (NOT onClick) for tab
        // activation. fireEvent.click is a no-op on the trigger.
        fireEvent.mouseDown(screen.getByTestId("metadata-tab-marketing"))
        return result
    }

    it("renders both fields in the Marketing tab (after selecting it)", () => {
        renderBookMeta()
        expect(screen.getByTestId("metadata-categories-field")).toBeTruthy()
        expect(screen.getByTestId("metadata-bisac-field")).toBeTruthy()
        expect(screen.getByTestId("category-input")).toBeTruthy()
        expect(screen.getByTestId("bisac-input")).toBeTruthy()
    })

    // HOTFIX regression pin: Categories + BISAC must NOT render on
    // initial mount when the default tab is 'general'. The leak
    // that prompted this fix was forceMount keeping the Marketing
    // content visible on every tab; removing forceMount + verifying
    // initial-mount absence + post-click presence proves the fix.
    //
    // The "switch BACK to general unmounts them" path is
    // intentionally NOT tested in Vitest. Radix Presence transitions
    // through an "unmountSuspended" state driven by CSS animationend
    // events that jsdom does not fire reliably. The Playwright E2E
    // spec covers the round-trip path in a real browser.
    it("does NOT render Categories + BISAC on initial mount (default 'general' tab)", () => {
        // Render the editor at its default 'general' tab (skip the
        // renderBookMeta helper so we don't auto-click Marketing).
        render(
            <BookMetadataEditor
                book={makeBook()}
                onSave={localOnSave}
                onBack={localOnBack}
            />,
        )
        expect(screen.queryByTestId("metadata-categories-field")).toBeNull()
        expect(screen.queryByTestId("metadata-bisac-field")).toBeNull()
        expect(screen.queryByTestId("category-input")).toBeNull()
        expect(screen.queryByTestId("bisac-input")).toBeNull()
        // Switching to Marketing mounts them. Radix Tabs.Trigger
        // listens to onMouseDown (NOT onClick); fireEvent.click is
        // a no-op on the trigger.
        fireEvent.mouseDown(screen.getByTestId("metadata-tab-marketing"))
        expect(screen.getByTestId("metadata-categories-field")).toBeTruthy()
        expect(screen.getByTestId("metadata-bisac-field")).toBeTruthy()
    })

    it("seeds CategoryInput + BisacCodeInput from book.categories + book.bisac_codes", () => {
        renderBookMeta({
            categories: ["Fiction", "Fantasy"],
            bisac_codes: ["FIC022020", "BIO000000"],
        })
        expect(screen.getByTestId("category-chip-0").textContent).toContain(
            "Fiction",
        )
        expect(screen.getByTestId("category-chip-1").textContent).toContain(
            "Fantasy",
        )
        expect(screen.getByTestId("bisac-chip-0").textContent).toContain(
            "FIC022020",
        )
        expect(screen.getByTestId("bisac-chip-1").textContent).toContain(
            "BIO000000",
        )
    })

    it("adding a category and saving sends it through onSave", async () => {
        renderBookMeta()
        const input = screen.getByTestId(
            "category-input-add",
        ) as HTMLInputElement
        fireEvent.change(input, {target: {value: "Coming of Age"}})
        fireEvent.click(screen.getByTestId("category-input-add-button"))
        fireEvent.click(screen.getByTestId("metadata-save"))
        await waitFor(() => expect(localOnSave).toHaveBeenCalled())
        const savedData = localOnSave.mock.calls[0][0]
        expect(savedData.categories).toEqual(["Coming of Age"])
    })

    it("adding a BISAC code (lowercased) saves it uppercased", async () => {
        renderBookMeta()
        const input = screen.getByTestId(
            "bisac-input-add",
        ) as HTMLInputElement
        fireEvent.change(input, {target: {value: "fic022020"}})
        fireEvent.click(screen.getByTestId("bisac-input-add-button"))
        fireEvent.click(screen.getByTestId("metadata-save"))
        await waitFor(() => expect(localOnSave).toHaveBeenCalled())
        const savedData = localOnSave.mock.calls[0][0]
        expect(savedData.bisac_codes).toEqual(["FIC022020"])
    })

    it("pre-existing categories + bisac_codes survive a no-touch save", async () => {
        renderBookMeta({
            categories: ["Pre-existing Category"],
            bisac_codes: ["FIC022020"],
        })
        fireEvent.click(screen.getByTestId("metadata-save"))
        await waitFor(() => expect(localOnSave).toHaveBeenCalled())
        const savedData = localOnSave.mock.calls[0][0]
        expect(savedData.categories).toEqual(["Pre-existing Category"])
        expect(savedData.bisac_codes).toEqual(["FIC022020"])
    })

    // KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01: the BookMetadataEditor
    // fires GET /api/kdp/categories once on mount and passes the
    // returned catalog into CategoryInput's `suggestions` prop. Prior
    // to this wiring the prop was hardcoded `[]` (Half-Wired-Visible-
    // in-Production: visible Categories field with no autocomplete
    // despite the 26-entry backend catalog). This pin prevents the
    // wiring from regressing to the empty default and verifies the
    // datalist is populated for the autocomplete to fire.
    it("on mount, calls api.kdp.listCategories and the datalist exposes its options", async () => {
        const {api} = await import("../api/client")
        const listCategoriesMock = vi.mocked(api.kdp.listCategories)
        listCategoriesMock.mockClear()
        listCategoriesMock.mockResolvedValueOnce([
            "Fiction",
            "Mystery",
            "Science Fiction",
        ])
        renderBookMeta()
        // Endpoint fired exactly once on mount.
        await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledTimes(1))
        // The category-input's datalist must carry the fetched
        // options (CategoryInput renders a sibling <datalist> whose
        // <option>s mirror the suggestions prop).
        await waitFor(() => {
            const options = Array.from(
                document.querySelectorAll("datalist option"),
            ).map((o) => (o as HTMLOptionElement).value)
            expect(options).toContain("Fiction")
            expect(options).toContain("Mystery")
            expect(options).toContain("Science Fiction")
        })
    })

    it("when api.kdp.listCategories fails, CategoryInput degrades to no suggestions (no crash)", async () => {
        const {api} = await import("../api/client")
        const listCategoriesMock = vi.mocked(api.kdp.listCategories)
        listCategoriesMock.mockClear()
        listCategoriesMock.mockRejectedValueOnce(new Error("network down"))
        // Should not throw; the Marketing tab still renders.
        renderBookMeta()
        await waitFor(() => expect(listCategoriesMock).toHaveBeenCalled())
        expect(screen.getByTestId("category-input")).toBeTruthy()
    })
})

// --- Session 5 Commit 1: book_type-aware tab filtering ---
//
// Picture-books and comic-books carry no chapters by design.
// The Audiobook + Quality tabs both read from book.chapters
// (AudiobookBookConfig + AudiobookDownloads + QualityTab) so
// exposing them ships a write-surface without a consumer — the
// half-wired-feature-lifecycle anti-pattern. Both tabs are
// hidden for non-prose book_types. Prose-flow stays unchanged.

describe("BookMetadataEditor — book_type tab filtering (Session 5 Commit 1)", () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onBack = vi.fn()

    beforeEach(() => {
        onSave.mockClear()
        onBack.mockClear()
    })

    function renderEditor(bookOverrides: Partial<BookDetail> = {}) {
        return render(
            <BookMetadataEditor
                book={makeBook(bookOverrides)}
                onSave={onSave}
                onBack={onBack}
            />,
        )
    }

    it("prose (default): all 9 tabs render (including Story added by EXPOSE-BUCHIDEE-METADATA-01)", () => {
        renderEditor({book_type: "prose"})
        expect(screen.getByTestId("metadata-tab-general")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-story")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-publisher")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-isbn")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-marketing")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-design")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-audiobook")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-quality")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-ai-template")).toBeTruthy()
    })

    it("picture_book: Audiobook + Quality tabs hidden, other 7 visible (incl. Story)", () => {
        renderEditor({book_type: "picture_book", chapters: []})
        expect(screen.getByTestId("metadata-tab-general")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-story")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-publisher")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-isbn")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-marketing")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-design")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-ai-template")).toBeTruthy()
        expect(screen.queryByTestId("metadata-tab-audiobook")).toBeNull()
        expect(screen.queryByTestId("metadata-tab-quality")).toBeNull()
    })

    it("comic_book: Audiobook + Quality tabs hidden (same as picture_book)", () => {
        renderEditor({book_type: "comic_book", chapters: []})
        expect(screen.getByTestId("metadata-tab-general")).toBeTruthy()
        expect(screen.queryByTestId("metadata-tab-audiobook")).toBeNull()
        expect(screen.queryByTestId("metadata-tab-quality")).toBeNull()
    })

    it("undefined book_type (defensive fallback): treated as prose, all 8 tabs render", () => {
        // Pre-Session-3 rows wouldn't have a book_type field at all.
        // The backend defaults it to 'prose' (BookOut schema line
        // 393), but if a frontend test fixture or some import path
        // strips the field, the editor must NOT silently hide tabs.
        const book = makeBook({book_type: undefined as unknown as BookDetail["book_type"]})
        render(<BookMetadataEditor book={book} onSave={onSave} onBack={onBack}/>)
        expect(screen.getByTestId("metadata-tab-audiobook")).toBeTruthy()
        expect(screen.getByTestId("metadata-tab-quality")).toBeTruthy()
    })

    it("picture_book: marketing tab (Categories + BISAC from Bug 9) is still visible", () => {
        // Picture-books gain Categories + BISAC for free via the
        // shared Marketing tab. Asymmetry resolution: prior to this
        // session, BookEditor (prose) exposed Marketing but
        // BookEditor (picture_book) returned <PageEditor> with no
        // metadata access at all. Tab visibility is the necessary
        // condition for Bug 9's Categories + BISAC to reach picture-
        // book authors.
        renderEditor({book_type: "picture_book", chapters: []})
        expect(screen.getByTestId("metadata-tab-marketing")).toBeTruthy()
    })
})

// --- PB-PHASE4 Session 6 Commit 5: Design-tab Export-PDF button ---

describe("BookMetadataEditor Design-tab Export-PDF button (picture_book only)", () => {
    const onSave = vi.fn()
    const onBack = vi.fn()

    beforeEach(() => {
        onSave.mockClear()
        onBack.mockClear()
        documentExportDownloadMock.mockReset()
        documentExportDownloadMock.mockResolvedValue(undefined)
        ;(notify.error as ReturnType<typeof vi.fn>).mockClear()
    })

    function renderEditor(bookOverrides: Partial<BookDetail> = {}) {
        return render(
            <BookMetadataEditor
                book={makeBook(bookOverrides)}
                onSave={onSave}
                onBack={onBack}
            />,
        )
    }

    /**
     * Switch to the Design tab. Radix Tabs.Trigger uses
     * `onMouseDown` internally (per the "Radix Tabs onMouseDown
     * not onClick" lessons-learned rule), so `fireEvent.click`
     * is a no-op. Use `fireEvent.mouseDown` to activate the tab.
     */
    function activateDesignTab() {
        fireEvent.mouseDown(screen.getByTestId("metadata-tab-design"))
    }

    it("picture_book: Export-PDF button is rendered in the Design tab", async () => {
        renderEditor({book_type: "picture_book", chapters: []})
        activateDesignTab()
        await waitFor(() =>
            expect(
                screen.getByTestId("metadata-export-pdf"),
            ).toBeTruthy(),
        )
    })

    it("prose: Export-PDF button is NOT rendered in the Design tab (picture-book-only feature)", async () => {
        renderEditor({book_type: "prose"})
        activateDesignTab()
        // Allow async mount of the Design tab content; THEN assert
        // the picture-book-only button stays absent.
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(
            screen.queryByTestId("metadata-export-pdf"),
        ).toBeNull()
    })

    it("clicking Export-PDF calls api.documentExport.download with bookId + 'pdf' + empty URLSearchParams", async () => {
        renderEditor({book_type: "picture_book", chapters: []})
        activateDesignTab()
        const btn = await screen.findByTestId(
            "metadata-export-pdf",
        )
        fireEvent.click(btn)
        await waitFor(() =>
            expect(documentExportDownloadMock).toHaveBeenCalledTimes(1),
        )
        const [bookId, fmt, params] = documentExportDownloadMock.mock.calls[0]
        expect(bookId).toBe("book-1")
        expect(fmt).toBe("pdf")
        expect(params).toBeInstanceOf(URLSearchParams)
        expect(params.toString()).toBe("")
    })

    it("ApiError surfaces as notify.error with the server's detail", async () => {
        documentExportDownloadMock.mockRejectedValue(
            new ApiError(
                500,
                "Picture-book PDF generation failed: WeasyPrint crashed",
                "/books/book-1/export/pdf",
                "GET",
            ),
        )
        renderEditor({book_type: "picture_book", chapters: []})
        activateDesignTab()
        const btn = await screen.findByTestId(
            "metadata-export-pdf",
        )
        fireEvent.click(btn)
        await waitFor(() =>
            expect(notify.error).toHaveBeenCalledTimes(1),
        )
        const firstArg = (notify.error as ReturnType<typeof vi.fn>).mock
            .calls[0][0]
        expect(firstArg).toContain("Picture-book PDF generation failed")
    })

    it("re-click while exporting is a no-op", async () => {
        let resolveDownload: ((value: undefined) => void) | undefined
        documentExportDownloadMock.mockReturnValue(
            new Promise<undefined>((resolve) => {
                resolveDownload = resolve
            }),
        )
        renderEditor({book_type: "picture_book", chapters: []})
        activateDesignTab()
        const btn = await screen.findByTestId(
            "metadata-export-pdf",
        )
        fireEvent.click(btn)
        await waitFor(() =>
            expect(documentExportDownloadMock).toHaveBeenCalledTimes(1),
        )
        // Second click while first is pending — no-op.
        fireEvent.click(btn)
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(documentExportDownloadMock).toHaveBeenCalledTimes(1)
        resolveDownload?.(undefined)
    })
})

// --- EXPOSE-BUCHIDEE-METADATA-01 C2: Story tab + book_idea/expose fields ---

describe("BookMetadataEditor Story tab (EXPOSE-BUCHIDEE-METADATA-01)", () => {
    const onSave = vi.fn()
    const onBack = vi.fn()

    beforeEach(() => {
        onSave.mockClear()
        onBack.mockClear()
    })

    // Per LL "Radix Tabs onMouseDown not onClick" — Radix Tabs
    // activates the trigger on mouseDown, NOT click. fireEvent.click
    // is a no-op for the activation.
    const activateStoryTab = () => {
        fireEvent.mouseDown(screen.getByTestId("metadata-tab-story"))
    }

    it("Story tab content mounts both book_idea + expose fields when clicked", () => {
        render(<BookMetadataEditor book={makeBook()} onSave={onSave} onBack={onBack}/>)
        activateStoryTab()
        // The Story tab content body is uniquely identified.
        expect(screen.getByTestId("metadata-story-content")).toBeTruthy()
        // Both Field labels render. The Field component renders its
        // ``label`` prop verbatim — i18n fallbacks "Buchidee" + "Exposé"
        // surface here (German fallbacks per the i18n shape).
        expect(screen.getByText("Buchidee")).toBeTruthy()
        expect(screen.getByText(/Exposé/)).toBeTruthy()
    })

    it("book_idea input round-trips through form state to onSave payload", async () => {
        const book = makeBook({book_idea: null, expose: null})
        render(<BookMetadataEditor book={book} onSave={onSave} onBack={onBack}/>)
        activateStoryTab()
        // Find the book_idea textarea by its label-associated input.
        const ideaInput = screen.getByRole("textbox", {name: "Buchidee"})
        fireEvent.change(ideaInput, {target: {value: "A boy meets a dragon."}})
        // Click save (the button is outside the Tabs subtree).
        fireEvent.click(screen.getByText(/Speichern|Save/))
        await waitFor(() => expect(onSave).toHaveBeenCalled())
        const payload = onSave.mock.calls[0][0]
        expect(payload.book_idea).toBe("A boy meets a dragon.")
    })

    it("expose input round-trips through form state to onSave payload", async () => {
        const book = makeBook({book_idea: null, expose: null})
        render(<BookMetadataEditor book={book} onSave={onSave} onBack={onBack}/>)
        activateStoryTab()
        const exposeInput = screen.getByRole("textbox", {name: /Exposé/})
        const longText = "PLOT: A long form document.\n\nCHARACTERS: Liam, Sköll."
        fireEvent.change(exposeInput, {target: {value: longText}})
        fireEvent.click(screen.getByText(/Speichern|Save/))
        await waitFor(() => expect(onSave).toHaveBeenCalled())
        const payload = onSave.mock.calls[0][0]
        expect(payload.expose).toBe(longText)
    })

    it("loading a book with pre-existing book_idea + expose prefills both fields", () => {
        const book = makeBook({
            book_idea: "Pre-loaded idea.",
            expose: "Pre-loaded expose.",
        })
        render(<BookMetadataEditor book={book} onSave={onSave} onBack={onBack}/>)
        activateStoryTab()
        const ideaInput = screen.getByRole("textbox", {name: "Buchidee"}) as HTMLTextAreaElement
        const exposeInput = screen.getByRole("textbox", {name: /Exposé/}) as HTMLTextAreaElement
        expect(ideaInput.value).toBe("Pre-loaded idea.")
        expect(exposeInput.value).toBe("Pre-loaded expose.")
    })

    it("Story tab is NOT mounted in the DOM until clicked (Radix lazy-content)", () => {
        // Radix Tabs only mounts the active Tab's Content by default
        // (forceMount opt-in not used here). Verifies that the Story
        // testid is absent on initial render under the General-tab
        // default — same pattern as the Categories/BISAC tab-leak
        // hotfix mentioned at L309-321 of the source.
        render(<BookMetadataEditor book={makeBook()} onSave={onSave} onBack={onBack}/>)
        expect(screen.queryByTestId("metadata-story-content")).toBeNull()
    })

    it("description (existing field) is NOT in the Story tab body — semantic separation", () => {
        // Regression-pin: ``description`` stays in General; only
        // ``book_idea`` + ``expose`` live in Story. Catches an
        // accidental refactor that would surface description twice
        // or move it.
        render(<BookMetadataEditor book={makeBook()} onSave={onSave} onBack={onBack}/>)
        activateStoryTab()
        const storyContent = screen.getByTestId("metadata-story-content")
        // The "Beschreibung" label is in General, not Story.
        expect(within(storyContent).queryByText("Beschreibung")).toBeNull()
    })
})
