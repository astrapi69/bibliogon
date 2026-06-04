/**
 * Tests for CreateArticlePage (Dialog->Pages migration C2).
 *
 * Covers the page-shell + create behavior:
 *   - resolving ?type= against the content-type registry (falls back to
 *     the registry default)
 *   - the per-type title testid (PageLayout)
 *   - create calling api.articles.create with the resolved content_type
 *     and navigating to the new article's editor
 *   - error handling surfaces a toast and stays on the page
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"
import {MemoryRouter, Routes, Route, useLocation} from "react-router-dom"

import CreateArticlePage from "./CreateArticlePage"
import {ContentTypesProvider} from "../hooks/useContentTypes"
import type {ContentTypeDef} from "../api/client"

const TEST_TYPES: Record<string, ContentTypeDef> = {
  blogpost: {
    id: "blogpost",
    label_key: "ui.content_types.blogpost",
    description_key: "ui.content_types.blogpost_desc",
    default_title_key: "ui.content_types.blogpost_default_title",
    icon: "FileText",
    default: true,
    extra_fields: [],
  },
  tutorial: {
    id: "tutorial",
    label_key: "ui.content_types.tutorial",
    description_key: "ui.content_types.tutorial_desc",
    default_title_key: "ui.content_types.tutorial_default_title",
    icon: "GraduationCap",
    default: false,
    extra_fields: [],
  },
}

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const mockArticlesCreate = vi.fn()
const mockNotifyError = vi.fn()

vi.mock("../api/client", () => ({
  api: {
    settings: {
      getApp: vi.fn().mockResolvedValue({author: {name: "", pen_names: []}}),
    },
    articles: {
      create: (...args: unknown[]) => mockArticlesCreate(...args),
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

vi.mock("../utils/notify", () => ({
  notify: {
    success: vi.fn(),
    error: (...args: unknown[]) => mockNotifyError(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location-probe" data-path={loc.pathname} />
}

function renderPage(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <ContentTypesProvider initialTypes={TEST_TYPES}>
        <Routes>
          <Route path="/articles/new" element={<CreateArticlePage />} />
          <Route
            path="/articles/:id"
            element={<div data-testid="article-editor-route">editor</div>}
          />
          <Route
            path="/articles"
            element={<div data-testid="article-list-route">list</div>}
          />
        </Routes>
        <LocationProbe />
      </ContentTypesProvider>
    </MemoryRouter>,
  )
}

describe("CreateArticlePage", () => {
  beforeEach(() => {
    mockArticlesCreate.mockReset()
    mockNotifyError.mockReset()
    mockArticlesCreate.mockResolvedValue({id: "new-article-id"})
  })

  it("defaults to the registry default type when no ?type= is given", async () => {
    renderPage("/articles/new")
    await waitFor(() =>
      expect(screen.getByTestId("create-article-title-blogpost")).toBeTruthy(),
    )
  })

  it("resolves ?type=tutorial against the registry", async () => {
    renderPage("/articles/new?type=tutorial")
    await waitFor(() =>
      expect(screen.getByTestId("create-article-title-tutorial")).toBeTruthy(),
    )
  })

  it("falls back to the default type for an unknown ?type=", async () => {
    renderPage("/articles/new?type=bogus")
    await waitFor(() =>
      expect(screen.getByTestId("create-article-title-blogpost")).toBeTruthy(),
    )
  })

  it("creates the article with the resolved content_type and opens the editor", async () => {
    renderPage("/articles/new?type=tutorial")
    await waitFor(() =>
      expect(screen.getByTestId("create-article-title")).toBeTruthy(),
    )
    fireEvent.change(screen.getByTestId("create-article-title"), {
      target: {value: "My Tutorial"},
    })
    fireEvent.click(screen.getByTestId("create-article-submit"))

    await waitFor(() => expect(mockArticlesCreate).toHaveBeenCalledTimes(1))
    const payload = mockArticlesCreate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.title).toBe("My Tutorial")
    expect(payload.content_type).toBe("tutorial")

    await waitFor(() =>
      expect(screen.getByTestId("article-editor-route")).toBeTruthy(),
    )
    expect(screen.getByTestId("location-probe").getAttribute("data-path")).toBe(
      "/articles/new-article-id",
    )
  })

  it("disables submit when the title is emptied", async () => {
    renderPage("/articles/new")
    await waitFor(() =>
      expect(screen.getByTestId("create-article-title")).toBeTruthy(),
    )
    fireEvent.change(screen.getByTestId("create-article-title"), {
      target: {value: "   "},
    })
    expect(screen.getByTestId("create-article-submit")).toBeDisabled()
  })

  it("surfaces a toast and stays on the page when creation fails", async () => {
    mockArticlesCreate.mockRejectedValue(new Error("boom"))
    renderPage("/articles/new")
    await waitFor(() =>
      expect(screen.getByTestId("create-article-title")).toBeTruthy(),
    )
    fireEvent.change(screen.getByTestId("create-article-title"), {
      target: {value: "Doomed"},
    })
    fireEvent.click(screen.getByTestId("create-article-submit"))

    await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId("location-probe").getAttribute("data-path")).toBe(
      "/articles/new",
    )
  })
})
