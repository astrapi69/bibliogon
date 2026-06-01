/**
 * Tests for ProseStoryboard (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3).
 *
 * Structural + behavioral coverage. Per the "@dnd-kit drag simulation
 * is brittle under happy-dom" rule, drag-reorder is covered by the
 * Playwright spec; here we pin: chapter cards render with word count,
 * the four shared annotation editors mount, notes auto-save fires the
 * versioned PATCH on blur, and the loading/empty states.
 */
import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, waitFor, fireEvent} from "@testing-library/react"

import ProseStoryboard, {chapterWordCount} from "./ProseStoryboard"
import {api, type Chapter} from "../api/client"

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as unknown as {ResizeObserver: typeof ResizeObserverStub}).ResizeObserver =
    ResizeObserverStub

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>("../api/client")
    return {
        ...actual,
        api: {
            ...actual.api,
            chapters: {
                list: vi.fn(),
                update: vi.fn(),
                reorder: vi.fn(),
                get: vi.fn(),
            },
        },
    }
})

function makeChapter(id: string, overrides: Partial<Chapter> = {}): Chapter {
    return {
        id,
        book_id: "book1",
        title: `Chapter ${id}`,
        content: "",
        position: 0,
        chapter_type: "chapter",
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
        version: 1,
        notes: null,
        story_beat: null,
        mood_color: null,
        act_group: null,
        ...overrides,
    }
}

const mockedApi = api as unknown as {
    chapters: {
        list: ReturnType<typeof vi.fn>
        update: ReturnType<typeof vi.fn>
        reorder: ReturnType<typeof vi.fn>
        get: ReturnType<typeof vi.fn>
    }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("chapterWordCount", () => {
    it("counts words in plain text", () => {
        expect(chapterWordCount("one two three")).toBe(3)
    })

    it("counts words in TipTap JSON", () => {
        const doc = JSON.stringify({
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: "hello brave new world"}]},
            ],
        })
        expect(chapterWordCount(doc)).toBe(4)
    })

    it("returns 0 for empty / null", () => {
        expect(chapterWordCount("")).toBe(0)
        expect(chapterWordCount(null)).toBe(0)
        expect(chapterWordCount(undefined)).toBe(0)
    })
})

describe("ProseStoryboard", () => {
    it("renders chapter cards with word count", async () => {
        mockedApi.chapters.list.mockResolvedValue([
            makeChapter("c1", {title: "Opening", content: "alpha beta gamma", position: 0}),
            makeChapter("c2", {title: "Middle", position: 1}),
        ])
        render(
            <ProseStoryboard
                bookId="book1"
                bookTitle="My Novel"
                onBack={vi.fn()}
                onSelectChapter={vi.fn()}
            />,
        )
        await waitFor(() => {
            expect(screen.getByTestId("prose-storyboard-card-c1")).toBeTruthy()
        })
        expect(screen.getByTestId("prose-storyboard-card-c2")).toBeTruthy()
        // Word count tag reflects the content.
        expect(screen.getByTestId("prose-storyboard-word-count-c1").textContent).toContain("3")
        expect(screen.getByTestId("prose-storyboard-word-count-c2").textContent).toContain("0")
    })

    it("shows the empty state when there are no chapters", async () => {
        mockedApi.chapters.list.mockResolvedValue([])
        render(
            <ProseStoryboard
                bookId="book1"
                bookTitle="My Novel"
                onBack={vi.fn()}
                onSelectChapter={vi.fn()}
            />,
        )
        await waitFor(() => {
            expect(screen.getByTestId("prose-storyboard-empty")).toBeTruthy()
        })
    })

    it("renders the four annotation editors per card", async () => {
        mockedApi.chapters.list.mockResolvedValue([makeChapter("c1")])
        render(
            <ProseStoryboard
                bookId="book1"
                bookTitle="My Novel"
                onBack={vi.fn()}
                onSelectChapter={vi.fn()}
            />,
        )
        await waitFor(() => {
            // RadixSelect exposes the trigger as `${testId}-trigger`.
            expect(screen.getByTestId("prose-storyboard-beat-select-c1-trigger")).toBeTruthy()
        })
        expect(screen.getByTestId("prose-storyboard-mood-palette-c1")).toBeTruthy()
        expect(screen.getByTestId("prose-storyboard-act-group-c1")).toBeTruthy()
        expect(screen.getByTestId("prose-storyboard-notes-c1")).toBeTruthy()
    })

    it("auto-saves notes on blur with the current version", async () => {
        mockedApi.chapters.list.mockResolvedValue([makeChapter("c1", {version: 4})])
        mockedApi.chapters.update.mockResolvedValue(
            makeChapter("c1", {version: 5, notes: "Tighten the pacing."}),
        )
        render(
            <ProseStoryboard
                bookId="book1"
                bookTitle="My Novel"
                onBack={vi.fn()}
                onSelectChapter={vi.fn()}
            />,
        )
        const notes = await screen.findByTestId("prose-storyboard-notes-c1")
        fireEvent.change(notes, {target: {value: "Tighten the pacing."}})
        fireEvent.blur(notes)
        await waitFor(() => {
            expect(mockedApi.chapters.update).toHaveBeenCalledWith("book1", "c1", {
                version: 4,
                notes: "Tighten the pacing.",
            })
        })
    })

    it("does not save when the notes value is unchanged", async () => {
        mockedApi.chapters.list.mockResolvedValue([
            makeChapter("c1", {notes: "existing"}),
        ])
        render(
            <ProseStoryboard
                bookId="book1"
                bookTitle="My Novel"
                onBack={vi.fn()}
                onSelectChapter={vi.fn()}
            />,
        )
        const notes = await screen.findByTestId("prose-storyboard-notes-c1")
        fireEvent.blur(notes)
        expect(mockedApi.chapters.update).not.toHaveBeenCalled()
    })
})
