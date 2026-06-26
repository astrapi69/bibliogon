/** Tests for ChapterOutliner (CHAPTER-OUTLINER-VIEW-01).
 *
 * Pins the table render, sort-by-column reordering, title-click ->
 * open, and the inline target PATCH. The status/label/beat cells are
 * RadixSelects (brittle open/select in happy-dom -> covered by the
 * Playwright spec); here they just need to render without error. */
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ChapterOutliner from "./ChapterOutliner"
import {api, type Chapter} from "../../api/client"

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

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client")
    return {
        ...actual,
        api: {
            ...actual.api,
            chapters: {list: vi.fn(), update: vi.fn(), get: vi.fn()},
            chapterLabels: {list: vi.fn().mockResolvedValue([])},
            books: {get: vi.fn(), update: vi.fn()},
        },
    }
})

function ch(id: string, o: Partial<Chapter> = {}): Chapter {
    return {
        id,
        book_id: "b1",
        title: id,
        content: "",
        position: 0,
        chapter_type: "chapter",
        created_at: "",
        updated_at: "",
        version: 1,
        ...o,
    } as Chapter
}

const CHAPTERS = [
    ch("alpha", {position: 0, title: "Alpha", content: "one two three four five"}),
    ch("beta", {position: 1, title: "Beta", content: "one two"}),
    ch("gamma", {position: 2, title: "Gamma", content: "one two three"}),
]

function rowOrder(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('[data-testid^="outliner-row-"]')).map((el) =>
        (el.getAttribute("data-testid") || "").replace("outliner-row-", ""),
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.chapters.list as ReturnType<typeof vi.fn>).mockResolvedValue(CHAPTERS)
    ;(api.chapterLabels.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(api.chapters.update as ReturnType<typeof vi.fn>).mockImplementation(
        async (_b: string, id: string, patch: Record<string, unknown>) => ({
            ...CHAPTERS.find((c) => c.id === id),
            ...patch,
            version: 2,
        }),
    )
    ;(api.books.get as ReturnType<typeof vi.fn>).mockResolvedValue({collections: []})
    ;(api.books.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
})

describe("ChapterOutliner", () => {
    it("renders a row per chapter in position order by default", async () => {
        const {container} = render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />,
        )
        await waitFor(() => expect(rowOrder(container)).toHaveLength(3))
        expect(rowOrder(container)).toEqual(["alpha", "beta", "gamma"])
    })

    it("sorts by word count when the Words header is clicked", async () => {
        const {container} = render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />,
        )
        await waitFor(() => expect(rowOrder(container)).toHaveLength(3))
        // alpha=5, beta=2, gamma=3 -> asc: beta, gamma, alpha
        fireEvent.click(screen.getByTestId("outliner-sort-words"))
        expect(rowOrder(container)).toEqual(["beta", "gamma", "alpha"])
        // toggle to desc
        fireEvent.click(screen.getByTestId("outliner-sort-words"))
        expect(rowOrder(container)).toEqual(["alpha", "gamma", "beta"])
    })

    it("opens a chapter when its title is clicked", async () => {
        const onSelect = vi.fn()
        render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={onSelect} />,
        )
        await waitFor(() => screen.getByTestId("outliner-title-beta"))
        fireEvent.click(screen.getByTestId("outliner-title-beta"))
        expect(onSelect).toHaveBeenCalledWith("beta")
    })

    it("PATCHes target_words on target-input blur", async () => {
        const {container} = render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />,
        )
        await waitFor(() => expect(rowOrder(container)).toHaveLength(3))
        const input = screen.getByTestId("outliner-target-alpha")
        fireEvent.change(input, {target: {value: "3000"}})
        fireEvent.blur(input)
        await waitFor(() => expect(api.chapters.update).toHaveBeenCalled())
        const [, id, patch] = (api.chapters.update as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(id).toBe("alpha")
        expect(patch.target_words).toBe(3000)
    })

    it("renders a synopsis cell per chapter row", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("outliner-synopsis-alpha")).toBeInTheDocument())
        expect(screen.getByTestId("outliner-synopsis-beta")).toBeInTheDocument()
        expect(screen.getByTestId("outliner-synopsis-auto-alpha")).toBeInTheDocument()
    })

    it("PATCHes synopsis on synopsis-input blur", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        const input = await screen.findByTestId("outliner-synopsis-alpha")
        fireEvent.change(input, {target: {value: "The hero departs."}})
        fireEvent.blur(input)
        await waitFor(() => expect(api.chapters.update).toHaveBeenCalled())
        const [, id, patch] = (api.chapters.update as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(id).toBe("alpha")
        expect(patch.synopsis).toBe("The hero departs.")
    })

    it("auto-generates the synopsis from the first paragraph", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        const btn = await screen.findByTestId("outliner-synopsis-auto-alpha")
        fireEvent.click(btn)
        await waitFor(() => expect(api.chapters.update).toHaveBeenCalled())
        const [, id, patch] = (api.chapters.update as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(id).toBe("alpha")
        // alpha's content is "one two three four five" (plain text fixture).
        expect(patch.synopsis).toBe("one two three four five")
    })

    it("renders an inspector-notes cell per chapter row", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        await waitFor(() => expect(screen.getByTestId("outliner-notes-alpha")).toBeInTheDocument())
        expect(screen.getByTestId("outliner-notes-beta")).toBeInTheDocument()
    })

    it("PATCHes inspector_notes on notes-input blur", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        const input = await screen.findByTestId("outliner-notes-alpha")
        fireEvent.change(input, {target: {value: "Add a flashback here."}})
        fireEvent.blur(input)
        await waitFor(() => expect(api.chapters.update).toHaveBeenCalled())
        const call = (api.chapters.update as ReturnType<typeof vi.fn>).mock.calls.find(
            (c) => (c[2] as Record<string, unknown>).inspector_notes !== undefined,
        )
        expect(call?.[1]).toBe("alpha")
        expect((call?.[2] as Record<string, unknown>).inspector_notes).toBe("Add a flashback here.")
    })

    const lastCollections = () => {
        const calls = (api.books.update as ReturnType<typeof vi.fn>).mock.calls
        return calls.at(-1)?.[1].collections as Array<{
            name: string
            chapter_ids: string[]
            color?: string | null
        }>
    }

    it("creates a collection and persists it via books.update", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        fireEvent.click(await screen.findByTestId("outliner-collection-new"))
        await waitFor(() => expect(api.books.update).toHaveBeenCalled())
        expect(lastCollections()).toHaveLength(1)
        expect(lastCollections()[0].name).toBeTruthy()
    })

    it("adds a chapter to the active collection", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        fireEvent.click(await screen.findByTestId("outliner-collection-new"))
        fireEvent.click(await screen.findByTestId("outliner-member-alpha"))
        await waitFor(() => expect(lastCollections()[0].chapter_ids).toContain("alpha"))
    })

    it("filters rows to the active collection", async () => {
        const {container} = render(
            <ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />,
        )
        fireEvent.click(await screen.findByTestId("outliner-collection-new"))
        fireEvent.click(await screen.findByTestId("outliner-member-alpha"))
        fireEvent.click(screen.getByTestId("outliner-collection-filter"))
        await waitFor(() => expect(rowOrder(container)).toEqual(["alpha"]))
    })

    it("deletes the active collection", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        fireEvent.click(await screen.findByTestId("outliner-collection-new"))
        fireEvent.click(await screen.findByTestId("outliner-collection-delete"))
        await waitFor(() => expect(lastCollections()).toHaveLength(0))
    })

    it("sets a collection color and persists it", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        fireEvent.click(await screen.findByTestId("outliner-collection-new"))
        fireEvent.click(await screen.findByTestId("outliner-collection-color-#3b82f6"))
        await waitFor(() => expect(lastCollections()[0].color).toBe("#3b82f6"))
        expect(screen.getByTestId("outliner-collection-color-dot")).toBeInTheDocument()
    })

    it("toggles a collection color off when the active swatch is clicked again", async () => {
        render(<ChapterOutliner bookId="b1" bookTitle="Book" onBack={vi.fn()} onSelectChapter={vi.fn()} />)
        fireEvent.click(await screen.findByTestId("outliner-collection-new"))
        fireEvent.click(await screen.findByTestId("outliner-collection-color-#3b82f6"))
        await waitFor(() => expect(lastCollections()[0].color).toBe("#3b82f6"))
        fireEvent.click(screen.getByTestId("outliner-collection-color-#3b82f6"))
        await waitFor(() => expect(lastCollections()[0].color).toBeNull())
    })
})
