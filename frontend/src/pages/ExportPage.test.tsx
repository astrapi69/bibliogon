/**
 * Tests for ExportPage (Dialog->Pages migration C3).
 *
 * Page-shell concerns the form (ExportForm.test.tsx) doesn't own:
 *   - fetches the book by route param and shows a loader meanwhile
 *   - renders the "Export: <title>" heading once loaded
 *   - passes bookId + hasManualToc (derived from chapters) to the form
 *   - shows an error state when the fetch fails
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, waitFor} from "@testing-library/react"
import {MemoryRouter, Routes, Route} from "react-router-dom"

import ExportPage from "./ExportPage"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const mockBooksGet = vi.fn()

vi.mock("../api/client", () => ({
  api: {
    books: {
      get: (...args: unknown[]) => mockBooksGet(...args),
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

vi.mock("../utils/platform/notify", () => ({
  notify: {error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn()},
}))

// Stub the form so the page test focuses on the shell (fetch + title +
// loading); ExportForm has its own test.
vi.mock("../components/ExportForm", () => ({
  default: (props: {bookId: string; hasManualToc: boolean}) => (
    <div
      data-testid="export-form-stub"
      data-book-id={props.bookId}
      data-has-manual-toc={String(props.hasManualToc)}
    />
  ),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/books/b-1/export"]}>
      <Routes>
        <Route path="/books/:bookId/export" element={<ExportPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("ExportPage", () => {
  beforeEach(() => {
    mockBooksGet.mockReset()
  })

  it("shows a loader, then the Export heading + form once the book loads", async () => {
    mockBooksGet.mockResolvedValue({
      id: "b-1",
      title: "Test Book",
      chapters: [{chapter_type: "chapter"}],
    })
    renderPage()
    // Loader visible before the fetch resolves.
    expect(screen.getByTestId("export-page-loading")).toBeTruthy()

    await waitFor(() =>
      expect(screen.getByTestId("export-form-stub")).toBeTruthy(),
    )
    expect(screen.getByText(/Export: Test Book/)).toBeTruthy()
    expect(mockBooksGet).toHaveBeenCalledWith("b-1")
  })

  it("derives hasManualToc=true when a toc chapter exists", async () => {
    mockBooksGet.mockResolvedValue({
      id: "b-1",
      title: "Has TOC",
      chapters: [{chapter_type: "chapter"}, {chapter_type: "toc"}],
    })
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId("export-form-stub")).toBeTruthy(),
    )
    expect(
      screen.getByTestId("export-form-stub").getAttribute("data-has-manual-toc"),
    ).toBe("true")
  })

  it("shows an error state when the book fetch fails", async () => {
    mockBooksGet.mockRejectedValue(new Error("boom"))
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId("export-page-error")).toBeTruthy(),
    )
    expect(screen.queryByTestId("export-form-stub")).toBeNull()
  })
})
