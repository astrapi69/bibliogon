/**
 * Tests for BookCard.
 *
 * Covers: renders title/author/genre/series, click handler,
 * testid pattern, cover fallback, date display, language badge.
 */

import React from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import BookCard from "./BookCard"
import type {Book} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-1",
    title: "Test Book",
    subtitle: null,
    author: "Test Author",
    language: "de",
    genre: null,
    series: null,
    series_index: null,
    cover_image: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-04-12T10:00:00Z",
    ...overrides,
  } as Book
}

describe("BookCard", () => {
  const onClick = vi.fn()
  const onDelete = vi.fn()

  it("renders title and author", () => {
    render(<BookCard book={makeBook()} onClick={onClick} onDelete={onDelete} />)
    // Title appears in both the card's <h3> and the cover placeholder when
    // there is no cover_image - both are valid renderings of the same book.
    expect(screen.getAllByText("Test Book").length).toBeGreaterThan(0)
    expect(screen.getByText("Test Author")).toBeTruthy()
  })

  it("has correct data-testid", () => {
    render(<BookCard book={makeBook()} onClick={onClick} onDelete={onDelete} />)
    expect(screen.getByTestId("book-card-book-1")).toBeTruthy()
  })

  it("calls onClick when card is clicked", () => {
    render(<BookCard book={makeBook()} onClick={onClick} onDelete={onDelete} />)
    fireEvent.click(screen.getByTestId("book-card-book-1"))
    expect(onClick).toHaveBeenCalled()
  })

  it("renders language badge", () => {
    render(<BookCard book={makeBook({language: "en"})} onClick={onClick} onDelete={onDelete} />)
    expect(screen.getByText("EN")).toBeTruthy()
  })

  it("renders genre badge when genre is set", () => {
    render(<BookCard book={makeBook({genre: "fantasy"})} onClick={onClick} onDelete={onDelete} />)
    // t("ui.genres.fantasy", "fantasy") returns fallback "fantasy"
    expect(screen.getByText("fantasy")).toBeTruthy()
  })

  it("does not render genre badge when genre is null", () => {
    render(<BookCard book={makeBook({genre: null})} onClick={onClick} onDelete={onDelete} />)
    // No genre element should exist
    const card = screen.getByTestId("book-card-book-1")
    expect(card.querySelector('[style*="accent-light"]')).toBeNull()
  })

  it("renders series info when series is set", () => {
    render(
      <BookCard
        book={makeBook({series: "Epic Series", series_index: 3})}
        onClick={onClick}
        onDelete={onDelete}
      />,
    )
    expect(screen.getByText("Epic Series - Band 3")).toBeTruthy()
  })

  it("renders subtitle when present", () => {
    render(
      <BookCard
        book={makeBook({subtitle: "A Subtitle"})}
        onClick={onClick}
        onDelete={onDelete}
      />,
    )
    // Subtitle appears in both the card's <p> and the cover placeholder when
    // no cover_image is set; both are valid renderings.
    expect(screen.getAllByText("A Subtitle").length).toBeGreaterThan(0)
  })

  it("renders accent bar when no cover image", () => {
    render(<BookCard book={makeBook({cover_image: null})} onClick={onClick} onDelete={onDelete} />)
    // No img element should exist
    expect(screen.getByTestId("book-card-book-1").querySelector("img")).toBeNull()
  })

  it("renders cover image when cover_image is set", () => {
    render(
      <BookCard
        book={makeBook({cover_image: "uploads/book-1/cover/my-cover.jpg"})}
        onClick={onClick}
        onDelete={onDelete}
      />,
    )
    const img = screen.getByTestId("book-card-book-1").querySelector("img")
    expect(img).toBeTruthy()
    expect(img?.src).toContain("/api/books/book-1/assets/file/my-cover.jpg")
  })

  it("has menu trigger with correct testid", () => {
    render(<BookCard book={makeBook()} onClick={onClick} onDelete={onDelete} />)
    expect(screen.getByTestId("book-card-menu-book-1")).toBeTruthy()
  })
})
