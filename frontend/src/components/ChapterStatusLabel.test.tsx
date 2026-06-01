/**
 * Tests for ChapterStatusLabel (CHAPTER-STATUS-LABELS-01).
 *
 * Pins the pure readable-text contrast helper + the two chips (plain
 * spans, reliable in happy-dom). The RadixSelect-based StatusSelect /
 * LabelSelect dropdowns are exercised by the Playwright spec — Radix
 * Select open/select is brittle under happy-dom (documented rule).
 */
import {describe, it, expect, vi} from "vitest"
import {render, screen} from "@testing-library/react"

import {StatusChip, LabelChip, readableTextColor, CHAPTER_STATUSES} from "./ChapterStatusLabel"
import type {ChapterLabel} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fb: string) => fb, lang: "en", setLang: vi.fn()}),
}))

describe("readableTextColor", () => {
    it("picks dark text on a light background", () => {
        expect(readableTextColor("#FFFFFF")).toBe("#1a1a1a")
        expect(readableTextColor("#F4ECD8")).toBe("#1a1a1a") // gentle/cream
    })

    it("picks white text on a dark background", () => {
        expect(readableTextColor("#2E4057")).toBe("#ffffff") // mysterious/navy
        expect(readableTextColor("#000000")).toBe("#ffffff")
    })

    it("falls back to black on a malformed color", () => {
        expect(readableTextColor("nope")).toBe("#000000")
    })
})

describe("CHAPTER_STATUSES", () => {
    it("lists the four drafting statuses in arc order", () => {
        expect([...CHAPTER_STATUSES]).toEqual(["todo", "first_draft", "revised", "final"])
    })
})

describe("StatusChip", () => {
    it("renders the localized status with a status data-attr", () => {
        render(<StatusChip status="revised" namespace="ns" idSuffix="c1" />)
        const chip = screen.getByTestId("ns-status-chip-c1")
        expect(chip.getAttribute("data-status")).toBe("revised")
    })
})

describe("LabelChip", () => {
    it("renders the label name with its color as background", () => {
        const label: ChapterLabel = {
            id: "l1",
            book_id: "b1",
            name: "Needs work",
            color: "#FF6B6B",
            position: 0,
        }
        render(<LabelChip label={label} namespace="ns" idSuffix="c1" />)
        const chip = screen.getByTestId("ns-label-chip-c1")
        expect(chip.textContent).toBe("Needs work")
        // color applied inline (data-driven); rgb form is fine.
        expect(chip.style.background).toBeTruthy()
    })
})
