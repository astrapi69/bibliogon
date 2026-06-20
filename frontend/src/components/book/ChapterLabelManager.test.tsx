/**
 * Tests for ChapterLabelManager (CHAPTER-STATUS-LABELS-01).
 *
 * Pins the inline label CRUD: existing labels render with a delete
 * control, the add row creates a label and refetches, and delete
 * removes + refetches. Plain inputs/buttons -> reliable in happy-dom.
 */
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import ChapterLabelManager from "./ChapterLabelManager"
import {api, type ChapterLabel} from "../../api/client"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fb: string) => fb, lang: "en", setLang: vi.fn()}),
}))

const notifyError = vi.fn()
vi.mock("../../utils/notify", () => ({
    notify: {error: (...a: unknown[]) => notifyError(...a), success: vi.fn(), info: vi.fn(), warning: vi.fn(), bulkAction: vi.fn()},
}))

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client")
    return {
        ...actual,
        api: {
            ...actual.api,
            chapterLabels: {
                list: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                remove: vi.fn(),
            },
        },
    }
})

const LABELS: ChapterLabel[] = [
    {id: "l1", book_id: "b1", name: "Draft", color: "#FFC857", position: 0},
    {id: "l2", book_id: "b1", name: "Final", color: "#7FB069", position: 1},
]

beforeEach(() => {
    vi.clearAllMocks()
    ;(api.chapterLabels.create as ReturnType<typeof vi.fn>).mockResolvedValue(LABELS[0])
    ;(api.chapterLabels.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe("ChapterLabelManager", () => {
    it("renders existing labels + the add row", () => {
        render(
            <ChapterLabelManager bookId="b1" labels={LABELS} onChanged={vi.fn()} namespace="cl" />,
        )
        expect(screen.getByTestId("cl-row-l1")).toBeTruthy()
        expect(screen.getByTestId("cl-row-l2")).toBeTruthy()
        expect(screen.getByTestId("cl-add-row")).toBeTruthy()
    })

    it("creates a label and refetches on Add", async () => {
        const onChanged = vi.fn()
        render(
            <ChapterLabelManager bookId="b1" labels={LABELS} onChanged={onChanged} namespace="cl" />,
        )
        fireEvent.change(screen.getByTestId("cl-new-name"), {target: {value: "Needs work"}})
        fireEvent.click(screen.getByTestId("cl-add"))
        await waitFor(() => {
            expect(api.chapterLabels.create).toHaveBeenCalledTimes(1)
        })
        const [, payload] = (api.chapterLabels.create as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(payload.name).toBe("Needs work")
        expect(payload.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
        expect(onChanged).toHaveBeenCalled()
    })

    it("does not create when the name is blank", () => {
        render(
            <ChapterLabelManager bookId="b1" labels={LABELS} onChanged={vi.fn()} namespace="cl" />,
        )
        // Add button is disabled with an empty name.
        const addBtn = screen.getByTestId("cl-add") as HTMLButtonElement
        expect(addBtn.disabled).toBe(true)
    })

    it("deletes a label and refetches", async () => {
        const onChanged = vi.fn()
        render(
            <ChapterLabelManager bookId="b1" labels={LABELS} onChanged={onChanged} namespace="cl" />,
        )
        fireEvent.click(screen.getByTestId("cl-delete-l1"))
        await waitFor(() => {
            expect(api.chapterLabels.remove).toHaveBeenCalledWith("b1", "l1")
        })
        expect(onChanged).toHaveBeenCalled()
    })
})
