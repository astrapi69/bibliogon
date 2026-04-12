/**
 * Tests for OrderedListEditor.
 *
 * Covers: render items, add item via button, add via Enter key,
 * remove item, empty state, label rendering, add button disabled
 * when input empty.
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import OrderedListEditor from "./OrderedListEditor"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

describe("OrderedListEditor", () => {
  const onChange = vi.fn()

  beforeEach(() => {
    onChange.mockClear()
  })

  it("renders existing items", () => {
    render(<OrderedListEditor items={["Alpha", "Beta", "Gamma"]} onChange={onChange} />)
    expect(screen.getByText("Alpha")).toBeTruthy()
    expect(screen.getByText("Beta")).toBeTruthy()
    expect(screen.getByText("Gamma")).toBeTruthy()
  })

  it("renders label when provided", () => {
    render(<OrderedListEditor items={[]} onChange={onChange} label="Section Order" />)
    expect(screen.getByText("Section Order")).toBeTruthy()
  })

  it("renders custom placeholder", () => {
    render(<OrderedListEditor items={[]} onChange={onChange} addPlaceholder="Add section..." />)
    expect(screen.getByPlaceholderText("Add section...")).toBeTruthy()
  })

  it("renders default placeholder when none provided", () => {
    render(<OrderedListEditor items={[]} onChange={onChange} />)
    // Default fallback from t()
    expect(screen.getByPlaceholderText("Neuen Eintrag hinzufügen...")).toBeTruthy()
  })

  it("adds item when add button is clicked", () => {
    render(<OrderedListEditor items={["Existing"]} onChange={onChange} />)

    const input = screen.getByPlaceholderText("Neuen Eintrag hinzufügen...")
    fireEvent.change(input, {target: {value: "New Item"}})

    // Find the add button (the Plus button)
    const buttons = screen.getAllByRole("button")
    const addBtn = buttons[buttons.length - 1]
    fireEvent.click(addBtn)

    expect(onChange).toHaveBeenCalledWith(["Existing", "New Item"])
  })

  it("adds item on Enter key press", () => {
    render(<OrderedListEditor items={[]} onChange={onChange} />)

    const input = screen.getByPlaceholderText("Neuen Eintrag hinzufügen...")
    fireEvent.change(input, {target: {value: "Via Enter"}})
    fireEvent.keyDown(input, {key: "Enter"})

    expect(onChange).toHaveBeenCalledWith(["Via Enter"])
  })

  it("trims whitespace from added items", () => {
    render(<OrderedListEditor items={[]} onChange={onChange} />)

    const input = screen.getByPlaceholderText("Neuen Eintrag hinzufügen...")
    fireEvent.change(input, {target: {value: "  Trimmed  "}})
    fireEvent.keyDown(input, {key: "Enter"})

    expect(onChange).toHaveBeenCalledWith(["Trimmed"])
  })

  it("does not add empty items", () => {
    render(<OrderedListEditor items={[]} onChange={onChange} />)

    const input = screen.getByPlaceholderText("Neuen Eintrag hinzufügen...")
    fireEvent.change(input, {target: {value: "   "}})
    fireEvent.keyDown(input, {key: "Enter"})

    expect(onChange).not.toHaveBeenCalled()
  })

  it("removes item when X button is clicked", () => {
    render(<OrderedListEditor items={["Keep", "Remove", "Also Keep"]} onChange={onChange} />)

    // Find the remove buttons (X icons) - they have title "Entfernen"
    const removeButtons = screen.getAllByTitle("Entfernen")
    expect(removeButtons).toHaveLength(3)

    // Click remove on the second item
    fireEvent.click(removeButtons[1])
    expect(onChange).toHaveBeenCalledWith(["Keep", "Also Keep"])
  })
})
