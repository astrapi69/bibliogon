/** Regression pin for the offline chapter-labels gap.
 *
 * Before the fix, ChapterOutliner short-circuited label loading in
 * Dexie/offline mode (`if (getStorage().mode === "dexie") { setLabels([]) }`),
 * so user-created chapter labels never appeared in the outliner offline -
 * a "Maximal Offline" violation, and inconsistent with ProseStoryboard
 * which loads labels through the seam in both modes. This test forces
 * dexie mode and asserts the outliner now loads labels via the storage
 * seam (which DexieStorage implements). */
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, waitFor} from "@testing-library/react"

import ChapterOutliner from "./ChapterOutliner"

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as unknown as {ResizeObserver: typeof ResizeObserverStub}).ResizeObserver =
    ResizeObserverStub

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fb: string) => fb, lang: "en", setLang: vi.fn()}),
}))

vi.mock("../../utils/platform/notify", () => ({
    notify: {error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), bulkAction: vi.fn()},
}))

const h = vi.hoisted(() => {
    const labels = [{id: "l1", book_id: "b1", name: "Draft", color: "#ffcc00", position: 0}]
    const chapters = [
        {
            id: "alpha",
            book_id: "b1",
            title: "Alpha",
            content: "one two three",
            position: 0,
            chapter_type: "chapter",
            created_at: "",
            updated_at: "",
            version: 1,
        },
    ]
    return {
        labelListSpy: vi.fn().mockResolvedValue(labels),
        chapters,
    }
})

vi.mock("../../storage", () => ({
    getStorage: () => ({
        mode: "dexie",
        chapters: {
            list: vi.fn().mockResolvedValue(h.chapters),
            update: vi.fn(),
            get: vi.fn(),
        },
        chapterLabels: {list: h.labelListSpy},
    }),
}))

beforeEach(() => {
    vi.clearAllMocks()
    h.labelListSpy.mockResolvedValue([
        {id: "l1", book_id: "b1", name: "Draft", color: "#ffcc00", position: 0},
    ])
})

describe("ChapterOutliner offline labels", () => {
    it("loads chapter labels through the seam in dexie mode", async () => {
        render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />,
        )
        // Pre-fix this was never called in dexie mode (labels forced to []).
        await waitFor(() => expect(h.labelListSpy).toHaveBeenCalledWith("b1"))
    })

    it("renders without error when offline labels resolve empty", async () => {
        h.labelListSpy.mockResolvedValue([])
        const {container} = render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />,
        )
        await waitFor(() =>
            expect(container.querySelectorAll('[data-testid^="outliner-row-"]').length).toBe(1),
        )
        expect(h.labelListSpy).toHaveBeenCalledWith("b1")
    })
})
