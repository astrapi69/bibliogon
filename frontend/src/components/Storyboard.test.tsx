/**
 * Tests for Storyboard (PICTURE-BOOK-STORYBOARD-VIEW-01 Session 1 C8).
 *
 * Structural-only coverage per the "Radix DropdownMenu + happy-dom
 * is brittle for Vitest" lessons-learned rule (the same brittleness
 * applies to @dnd-kit drag simulation under happy-dom). Actual
 * drag-reorder is covered by Session 2's Playwright spec; here we
 * pin the presence + namespace of the testids the spec will drive
 * and the render-shape decisions (act-group grouping,
 * derivePreviewTitle TipTap/plain handling, mood-color border,
 * story-beat tag).
 */

import React from "react"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, waitFor, fireEvent} from "@testing-library/react"

import Storyboard from "./Storyboard"
import {api, type Page} from "../api/client"

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
    const actual =
        await vi.importActual<typeof import("../api/client")>("../api/client")
    return {
        ...actual,
        api: {
            ...actual.api,
            pages: {
                list: vi.fn(),
                reorder: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
        },
    }
})

function makePage(overrides: Partial<Page> = {}): Page {
    return {
        id: "p1",
        book_id: "b1",
        position: 1,
        layout: "image_top_text_bottom",
        text_content: null,
        image_asset_id: null,
        layout_config: null,
        notes: null,
        story_beat: null,
        mood_color: null,
        act_group: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    }
}

const defaultProps = {
    bookId: "b1",
    bookTitle: "My Picture Book",
    onSelectPage: vi.fn(),
    onBack: vi.fn(),
}

beforeEach(() => {
    // mockClear (not mockReset) per the "Module-level caches survive
    // test boundaries" lessons-learned rule — preserves any factory
    // defaults set in the vi.mock factory while resetting call
    // history between tests.
    vi.mocked(api.pages.list).mockClear()
    vi.mocked(api.pages.update).mockClear()
    vi.mocked(api.pages.reorder).mockClear()
    vi.mocked(api.pages.list).mockResolvedValue([])
    vi.mocked(api.pages.reorder).mockResolvedValue([])
    defaultProps.onSelectPage = vi.fn()
    defaultProps.onBack = vi.fn()
})

describe("Storyboard", () => {
    it("renders the empty-state when the book has no pages", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([])
        render(<Storyboard {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-empty")).toBeTruthy()
        })
    })

    it("renders one card per page with the namespaced testid", async () => {
        const pages = [
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2, layout: "speech_bubble"}),
            makePage({id: "p3", position: 3, layout: "text_only"}),
        ]
        vi.mocked(api.pages.list).mockResolvedValue(pages)
        render(<Storyboard {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-card-p1")).toBeTruthy()
        })
        expect(screen.getByTestId("storyboard-card-p2")).toBeTruthy()
        expect(screen.getByTestId("storyboard-card-p3")).toBeTruthy()
    })

    it("exposes position + layout + story_beat + mood_color as data attrs", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({
                id: "p1",
                position: 3,
                layout: "speech_bubble",
                story_beat: "climax",
                mood_color: "#FF6B35",
            }),
        ])
        render(<Storyboard {...defaultProps} />)
        const card = await screen.findByTestId("storyboard-card-p1")
        expect(card.getAttribute("data-position")).toBe("3")
        expect(card.getAttribute("data-layout")).toBe("speech_bubble")
        expect(card.getAttribute("data-story-beat")).toBe("climax")
        expect(card.getAttribute("data-mood-color")).toBe("#FF6B35")
    })

    it("invokes onSelectPage with the page id when a card is clicked", async () => {
        const onSelectPage = vi.fn()
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        render(<Storyboard {...defaultProps} onSelectPage={onSelectPage} />)
        const card = await screen.findByTestId("storyboard-card-p2")
        fireEvent.click(card)
        expect(onSelectPage).toHaveBeenCalledWith("p2")
    })

    it("invokes onBack when the back button is clicked", async () => {
        const onBack = vi.fn()
        vi.mocked(api.pages.list).mockResolvedValue([])
        render(<Storyboard {...defaultProps} onBack={onBack} />)
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-back")).toBeTruthy()
        })
        fireEvent.click(screen.getByTestId("storyboard-back"))
        expect(onBack).toHaveBeenCalledTimes(1)
    })

    it("renders the page count in the header", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
            makePage({id: "p3", position: 3}),
        ])
        render(<Storyboard {...defaultProps} />)
        const count = await screen.findByTestId("storyboard-page-count")
        expect(count.textContent).toContain("3")
    })

    it("renders the layout-tag per card with the namespaced testid", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", layout: "image_left_text_right"}),
        ])
        render(<Storyboard {...defaultProps} />)
        const tag = await screen.findByTestId("storyboard-layout-tag-p1")
        expect(tag).toBeTruthy()
    })

    it("renders the story-beat tag only when story_beat is set", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", story_beat: "rising"}),
            makePage({id: "p2", story_beat: null}),
        ])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        expect(screen.getByTestId("storyboard-beat-tag-p1")).toBeTruthy()
        expect(screen.queryByTestId("storyboard-beat-tag-p2")).toBeNull()
    })

    it("renders a single ungrouped act-group when no pages have act_group", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", act_group: null}),
            makePage({id: "p2", act_group: null}),
        ])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        const groups = screen.getAllByTestId("storyboard-act-group")
        expect(groups).toHaveLength(1)
    })

    it("renders one act-group per distinct act_group value, preserving first-seen order", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", position: 1, act_group: "Act I"}),
            makePage({id: "p2", position: 2, act_group: "Act I"}),
            makePage({id: "p3", position: 3, act_group: "Act II"}),
            makePage({id: "p4", position: 4, act_group: "Act II"}),
            makePage({id: "p5", position: 5, act_group: null}),
        ])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        const groups = screen.getAllByTestId("storyboard-act-group")
        expect(groups).toHaveLength(3)
        // Order preserved: Act I first, Act II second, ungrouped trailing.
        expect(groups[0].getAttribute("data-act-group")).toBe("Act I")
        expect(groups[1].getAttribute("data-act-group")).toBe("Act II")
        expect(groups[2].getAttribute("data-act-group")).toBe("")
    })

    it("renders a drag handle per card with the namespaced testid", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1"}),
            makePage({id: "p2"}),
        ])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        expect(screen.getByTestId("storyboard-drag-handle-p1")).toBeTruthy()
        expect(screen.getByTestId("storyboard-drag-handle-p2")).toBeTruthy()
    })

    it("uses the testidNamespace prefix when provided", async () => {
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        render(<Storyboard {...defaultProps} testidNamespace="custom-sb" />)
        const card = await screen.findByTestId("custom-sb-card-p1")
        expect(card).toBeTruthy()
        expect(screen.queryByTestId("storyboard-card-p1")).toBeNull()
    })

    it("shows the loading state before the pages-list promise resolves", () => {
        // Never-resolving promise pins the pre-resolution render shape.
        let resolveFn: (v: Page[]) => void = () => {}
        vi.mocked(api.pages.list).mockReturnValue(
            new Promise<Page[]>((res) => {
                resolveFn = res
            }),
        )
        render(<Storyboard {...defaultProps} />)
        expect(screen.getByTestId("storyboard-loading")).toBeTruthy()
        resolveFn([])
    })

    it("shows the error state when the pages-list call rejects", async () => {
        vi.mocked(api.pages.list).mockRejectedValue(new Error("boom"))
        render(<Storyboard {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-error")).toBeTruthy()
        })
    })

    describe("derivePreviewTitle render (TipTap + plain shapes)", () => {
        it("renders the first line of plain text_content as the title", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({
                    id: "p1",
                    text_content: "First line of the page\nSecond line",
                }),
            ])
            render(<Storyboard {...defaultProps} />)
            const card = await screen.findByTestId("storyboard-card-p1")
            expect(card.textContent).toContain("First line of the page")
            // Second line is in body but the title-row preview only takes
            // first-non-empty-line; pin via not-equals so a future
            // refactor that joined lines fails this case.
            expect(card.textContent).not.toContain("Second line")
        })

        it("flattens TipTap JSON text_content to extract the first paragraph", async () => {
            const tiptap = JSON.stringify({
                type: "doc",
                content: [
                    {
                        type: "paragraph",
                        content: [{type: "text", text: "Once upon a time"}],
                    },
                    {
                        type: "paragraph",
                        content: [{type: "text", text: "there was a princess"}],
                    },
                ],
            })
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", text_content: tiptap}),
            ])
            render(<Storyboard {...defaultProps} />)
            const card = await screen.findByTestId("storyboard-card-p1")
            expect(card.textContent).toContain("Once upon a time")
            expect(card.textContent).not.toContain("there was a princess")
        })

        it("renders the no-text placeholder when text_content is null", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", text_content: null}),
            ])
            render(<Storyboard {...defaultProps} />)
            const card = await screen.findByTestId("storyboard-card-p1")
            // Localised fallback returned by the mock t() is the
            // hardcoded "(no text)" string.
            expect(card.textContent).toContain("(no text)")
        })
    })

    describe("NotesEditor (Session 2 C1)", () => {
        it("renders the textarea with the namespaced testid", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: null}),
            ])
            render(<Storyboard {...defaultProps} />)
            const textarea = await screen.findByTestId("storyboard-notes-p1")
            expect(textarea).toBeTruthy()
            expect((textarea as HTMLTextAreaElement).value).toBe("")
        })

        it("renders existing notes value when page.notes is set", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: "Pacing feels slow here."}),
            ])
            render(<Storyboard {...defaultProps} />)
            const textarea = await screen.findByTestId("storyboard-notes-p1")
            expect((textarea as HTMLTextAreaElement).value).toBe(
                "Pacing feels slow here.",
            )
        })

        it("blur triggers PATCH with the new notes value", async () => {
            const updated = makePage({id: "p1", notes: "Edited note"})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: null}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const textarea = (await screen.findByTestId(
                "storyboard-notes-p1",
            )) as HTMLTextAreaElement
            fireEvent.change(textarea, {target: {value: "Edited note"}})
            fireEvent.blur(textarea)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    notes: "Edited note",
                })
            })
        })

        it("blur with unchanged value does NOT trigger PATCH (no-op)", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: "Initial"}),
            ])
            render(<Storyboard {...defaultProps} />)
            const textarea = (await screen.findByTestId(
                "storyboard-notes-p1",
            )) as HTMLTextAreaElement
            // Focus + blur without editing.
            fireEvent.focus(textarea)
            fireEvent.blur(textarea)
            // Tiny defer to let any async microtask flush.
            await new Promise((r) => setTimeout(r, 0))
            expect(api.pages.update).not.toHaveBeenCalled()
        })

        it("clearing the textarea blurs with notes: null (empty → null)", async () => {
            const updated = makePage({id: "p1", notes: null})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: "Initial"}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const textarea = (await screen.findByTestId(
                "storyboard-notes-p1",
            )) as HTMLTextAreaElement
            fireEvent.change(textarea, {target: {value: ""}})
            fireEvent.blur(textarea)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    notes: null,
                })
            })
        })

        it("whitespace-only value blurs with notes: null (trimmed → null)", async () => {
            const updated = makePage({id: "p1", notes: null})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: "Initial"}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const textarea = (await screen.findByTestId(
                "storyboard-notes-p1",
            )) as HTMLTextAreaElement
            fireEvent.change(textarea, {target: {value: "   \n  "}})
            fireEvent.blur(textarea)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    notes: null,
                })
            })
        })

        it("clicking inside the textarea does NOT trigger onSelectPage", async () => {
            const onSelectPage = vi.fn()
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", notes: null}),
            ])
            render(<Storyboard {...defaultProps} onSelectPage={onSelectPage} />)
            const textarea = await screen.findByTestId("storyboard-notes-p1")
            fireEvent.click(textarea)
            // Card-level onClick should NOT fire when clicking the
            // textarea (stopPropagation).
            expect(onSelectPage).not.toHaveBeenCalled()
        })
    })

    describe("act-group ordering within group preserves page.position", () => {
        it("pages within the same act_group render in the order returned by api.pages.list", async () => {
            // Backend returns position-ordered; the helper preserves
            // that order within each group. Pin both the group
            // existence + the card order within it.
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", position: 1, act_group: "Act I"}),
                makePage({id: "p2", position: 2, act_group: "Act I"}),
                makePage({id: "p3", position: 3, act_group: "Act I"}),
            ])
            render(<Storyboard {...defaultProps} />)
            await screen.findByTestId("storyboard-card-p1")
            const cards = screen.getAllByTestId(/^storyboard-card-/)
            const positions = cards.map((c) => c.getAttribute("data-position"))
            expect(positions).toEqual(["1", "2", "3"])
        })
    })
})
