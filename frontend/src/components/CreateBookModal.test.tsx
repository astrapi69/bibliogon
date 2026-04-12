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

vi.mock("../api/client", () => ({
  api: {
    settings: {
      getApp: vi.fn().mockResolvedValue({author: {name: "", pen_names: []}}),
    },
  },
}))

describe("CreateBookModal", () => {
  const onClose = vi.fn()
  const onCreate = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onCreate.mockClear()
  })

  function renderModal(open = true) {
    return render(
      <CreateBookModal open={open} onClose={onClose} onCreate={onCreate} />,
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
})
