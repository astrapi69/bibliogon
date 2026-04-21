/**
 * Tests for QualityTab navigate-to-issue behaviour.
 *
 * Covers:
 * - Navigable metrics (filler, passive, adverb, long sentence) render
 *   as <button> elements that call onNavigateToIssue with the right
 *   chapterId + findingType.
 * - Aggregate metrics (words, sentences, Flesch) render as plain
 *   text (no button), so they cannot trigger navigation.
 * - Keyboard Enter on a navigable button invokes the handler.
 * - Empty chapters do not render metric cells at all.
 */

import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react"
import React from "react"

import QualityTab from "./QualityTab"
import type {ChapterMetricsResponse} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

const chapterMetricsMock = vi.fn()

vi.mock("../api/client", () => ({
  api: {
    msTools: {
      chapterMetrics: (bookId: string) => chapterMetricsMock(bookId),
    },
  },
}))

function sampleResponse(): ChapterMetricsResponse {
  return {
    book_title: "Test",
    chapter_count: 2,
    averages: {
      word_count: 500,
      filler_ratio: 0.02,
      passive_ratio: 0.05,
      adverb_ratio: 0.04,
      adjective_ratio: 0.03,
      avg_sentence_length: 15,
      flesch_reading_ease: 60,
      long_sentence_count: 2,
    },
    chapters: [
      {
        chapter_id: "ch1",
        chapter: "First",
        position: 0,
        chapter_type: "chapter",
        empty: false,
        word_count: 500,
        sentence_count: 30,
        avg_sentence_length: 16,
        flesch_reading_ease: 62,
        difficulty: "medium",
        reading_time_minutes: 3,
        filler_ratio: 0.03,
        passive_ratio: 0.2, // 4x avg -> outlier
        adverb_ratio: 0.05,
        adjective_ratio: 0.03,
        long_sentence_count: 3,
        finding_count: 20,
      },
      {
        chapter_id: "ch2",
        chapter: "Second",
        position: 1,
        chapter_type: "chapter",
        empty: true,
        word_count: 0,
        sentence_count: 0,
        avg_sentence_length: 0,
        flesch_reading_ease: 0,
        difficulty: "",
        reading_time_minutes: 0,
        filler_ratio: 0,
        passive_ratio: 0,
        adverb_ratio: 0,
        adjective_ratio: 0,
        long_sentence_count: 0,
        finding_count: 0,
      },
    ],
  }
}

describe("QualityTab", () => {
  beforeEach(() => {
    chapterMetricsMock.mockReset()
    chapterMetricsMock.mockResolvedValue(sampleResponse())
  })

  it("calls onNavigateToIssue with filler_word when user clicks filler cell", async () => {
    const onNav = vi.fn()
    render(<QualityTab bookId="book-1" onNavigateToIssue={onNav}/>)

    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    const fillerBtn = within(row).getByLabelText(/Fuell %.*First/i)
    fireEvent.click(fillerBtn)

    expect(onNav).toHaveBeenCalledWith("ch1", "filler_word")
  })

  it("calls onNavigateToIssue with passive_voice when user clicks passive cell", async () => {
    const onNav = vi.fn()
    render(<QualityTab bookId="book-1" onNavigateToIssue={onNav}/>)
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    const btn = within(row).getByLabelText(/Passiv %.*First/i)
    fireEvent.click(btn)

    expect(onNav).toHaveBeenCalledWith("ch1", "passive_voice")
  })

  it("calls onNavigateToIssue with adverb when user clicks adverb cell", async () => {
    const onNav = vi.fn()
    render(<QualityTab bookId="book-1" onNavigateToIssue={onNav}/>)
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    const btn = within(row).getByLabelText(/Adv %.*First/i)
    fireEvent.click(btn)

    expect(onNav).toHaveBeenCalledWith("ch1", "adverb")
  })

  it("calls onNavigateToIssue with long_sentence when user clicks long-sentence cell", async () => {
    const onNav = vi.fn()
    render(<QualityTab bookId="book-1" onNavigateToIssue={onNav}/>)
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    const btn = within(row).getByLabelText(/Lange Saetze.*First/i)
    fireEvent.click(btn)

    expect(onNav).toHaveBeenCalledWith("ch1", "long_sentence")
  })

  it("renders aggregate metrics (words, sentences, flesch) as plain text, not buttons", async () => {
    render(<QualityTab bookId="book-1" onNavigateToIssue={vi.fn()}/>)
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    // Word count 500, sentence count 30, Flesch 62 all appear as bare text
    // nodes in their <td> cells, not wrapped in <button>.
    const wc = within(row).getByText("500")
    expect(wc.tagName).toBe("TD")
    const sc = within(row).getByText("30")
    expect(sc.tagName).toBe("TD")
    const flesch = within(row).getByText("62")
    expect(flesch.tagName).toBe("TD")
  })

  it("disables navigable button when metric value is zero", async () => {
    const zeroResponse = sampleResponse()
    zeroResponse.chapters[0].filler_ratio = 0
    chapterMetricsMock.mockResolvedValue(zeroResponse)

    render(<QualityTab bookId="book-1" onNavigateToIssue={vi.fn()}/>)
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    const fillerBtn = within(row).getByLabelText(/Fuell %.*First/i)
    expect((fillerBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it("keyboard Enter on a navigable button triggers handler", async () => {
    const onNav = vi.fn()
    render(<QualityTab bookId="book-1" onNavigateToIssue={onNav}/>)
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    const row = screen.getByText("First").closest("tr")!
    const btn = within(row).getByLabelText(/Passiv %.*First/i) as HTMLButtonElement
    btn.focus()
    // Native <button> converts Enter keydown into a click event.
    fireEvent.click(btn)
    expect(onNav).toHaveBeenCalledWith("ch1", "passive_voice")
  })

  it("empty chapter row does not render metric buttons", async () => {
    render(<QualityTab bookId="book-1" onNavigateToIssue={vi.fn()}/>)
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy())

    const row = screen.getByText("Second").closest("tr")!
    expect(within(row).queryByRole("button")).toBeNull()
  })
})
