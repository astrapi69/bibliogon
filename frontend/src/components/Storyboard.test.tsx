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
            storyBible: {
                ...actual.api.storyBible,
                getInfo: vi.fn(),
                pageEntities: vi.fn(),
                createLink: vi.fn(),
                listEntities: vi.fn(),
                appearances: vi.fn(),
                continuityCheck: vi.fn(),
            },
        },
    }
})

// Stub the sidebar so opening it doesn't fire its own entity fetches;
// these tests cover Storyboard's integration (badge fetch + toggle +
// mount + drop), not StoryBibleSidebar internals. The MIME constant is
// re-exported so the drop test references the real value.
const STORY_ENTITY_DND_MIME = "application/x-bibliogon-entity-id"
vi.mock("./StoryBibleSidebar", () => ({
    STORY_ENTITY_DND_MIME: "application/x-bibliogon-entity-id",
    default: ({selectedEntityId}: {selectedEntityId?: string | null}) => (
        <div
            data-testid="story-bible-sidebar-stub"
            data-selected={selectedEntityId ?? ""}
        />
    ),
}))

function makeLink(entityId: string, name: string, entityType = "character") {
    return {
        id: `lnk-${entityId}`,
        entity_id: entityId,
        page_id: "p1",
        chapter_id: null,
        role: null,
        notes: null,
        created_at: new Date().toISOString(),
        entity: {
            id: entityId,
            book_id: "b1",
            entity_type: entityType,
            name,
            description: null,
            entity_metadata: null,
            image_asset_id: null,
            position: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
    }
}

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
    // Default: plugin-story-bible UNavailable (getInfo rejects) so the
    // existing card/reorder tests render no sidebar/badges. The Story
    // Bible integration tests below override getInfo to resolve.
    vi.mocked(api.storyBible.getInfo).mockReset()
    vi.mocked(api.storyBible.getInfo).mockRejectedValue(new Error("no plugin"))
    vi.mocked(api.storyBible.pageEntities).mockReset()
    vi.mocked(api.storyBible.pageEntities).mockResolvedValue([])
    vi.mocked(api.storyBible.createLink).mockReset()
    vi.mocked(api.storyBible.listEntities).mockReset()
    vi.mocked(api.storyBible.listEntities).mockResolvedValue([])
    vi.mocked(api.storyBible.appearances).mockReset()
    vi.mocked(api.storyBible.appearances).mockResolvedValue([])
    vi.mocked(api.storyBible.continuityCheck).mockReset()
    vi.mocked(api.storyBible.continuityCheck).mockResolvedValue([])
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

    describe("ActGroupInput (Session 2 C4)", () => {
        it("renders the input with the namespaced testid", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: null}),
            ])
            render(<Storyboard {...defaultProps} />)
            const input = await screen.findByTestId("storyboard-act-group-p1")
            expect((input as HTMLInputElement).value).toBe("")
        })

        it("renders the existing act_group value", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: "Act II"}),
            ])
            render(<Storyboard {...defaultProps} />)
            const input = await screen.findByTestId("storyboard-act-group-p1")
            expect((input as HTMLInputElement).value).toBe("Act II")
        })

        it("blur with a new value PATCHes act_group: <trimmed value>", async () => {
            const updated = makePage({id: "p1", act_group: "Act I"})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: null}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const input = (await screen.findByTestId(
                "storyboard-act-group-p1",
            )) as HTMLInputElement
            fireEvent.change(input, {target: {value: "  Act I  "}})
            fireEvent.blur(input)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    act_group: "Act I",
                })
            })
        })

        it("blur with empty value PATCHes act_group: null", async () => {
            const updated = makePage({id: "p1", act_group: null})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: "Act II"}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const input = (await screen.findByTestId(
                "storyboard-act-group-p1",
            )) as HTMLInputElement
            fireEvent.change(input, {target: {value: ""}})
            fireEvent.blur(input)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    act_group: null,
                })
            })
        })

        it("blur with unchanged value does NOT trigger PATCH (no-op)", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: "Act III"}),
            ])
            render(<Storyboard {...defaultProps} />)
            const input = (await screen.findByTestId(
                "storyboard-act-group-p1",
            )) as HTMLInputElement
            fireEvent.focus(input)
            fireEvent.blur(input)
            await new Promise((r) => setTimeout(r, 0))
            expect(api.pages.update).not.toHaveBeenCalled()
        })

        it("Enter keyDown does NOT bubble up to card-level handlers (stopPropagation)", async () => {
            // The Enter-key-blurs-save chain depends on happy-dom's
            // blur() implementation which is unreliable in unit
            // tests; covered by the Playwright E2E spec in S2-C6
            // instead. Pin the stopPropagation discipline here so
            // the card's role="button" Enter handler doesn't fire
            // navigate-to-page while the user is mid-edit.
            const onSelectPage = vi.fn()
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: null}),
            ])
            render(<Storyboard {...defaultProps} onSelectPage={onSelectPage} />)
            const input = await screen.findByTestId("storyboard-act-group-p1")
            fireEvent.keyDown(input, {key: "Enter"})
            expect(onSelectPage).not.toHaveBeenCalled()
        })

        it("clicking the input does NOT trigger onSelectPage", async () => {
            const onSelectPage = vi.fn()
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", act_group: null}),
            ])
            render(<Storyboard {...defaultProps} onSelectPage={onSelectPage} />)
            const input = await screen.findByTestId("storyboard-act-group-p1")
            fireEvent.click(input)
            expect(onSelectPage).not.toHaveBeenCalled()
        })
    })

    describe("MoodColorPicker (Session 2 C3)", () => {
        it("renders 10 preset swatches with the namespaced testid", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: null}),
            ])
            render(<Storyboard {...defaultProps} />)
            await screen.findByTestId("storyboard-mood-palette-p1")
            // 10 preset colors per MOOD_PALETTE.
            const keys = [
                "sunny",
                "passionate",
                "calm",
                "dreamy",
                "peaceful",
                "adventurous",
                "tender",
                "somber",
                "mysterious",
                "gentle",
            ]
            for (const k of keys) {
                expect(
                    screen.getByTestId(`storyboard-mood-swatch-${k}-p1`),
                ).toBeTruthy()
            }
        })

        it("clicking a swatch triggers PATCH with that color (hex)", async () => {
            const updated = makePage({id: "p1", mood_color: "#FF6B6B"})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: null}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const swatch = await screen.findByTestId(
                "storyboard-mood-swatch-passionate-p1",
            )
            fireEvent.click(swatch)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    mood_color: "#FF6B6B",
                })
            })
        })

        it("the currently-selected swatch carries data-selected='true'", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: "#4ECDC4"}),
            ])
            render(<Storyboard {...defaultProps} />)
            const selected = await screen.findByTestId(
                "storyboard-mood-swatch-calm-p1",
            )
            expect(selected.getAttribute("data-selected")).toBe("true")
            // A non-selected one stays false.
            const other = screen.getByTestId("storyboard-mood-swatch-sunny-p1")
            expect(other.getAttribute("data-selected")).toBe("false")
        })

        it("clicking the selected swatch toggles it off (mood_color: null)", async () => {
            const updated = makePage({id: "p1", mood_color: null})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: "#4ECDC4"}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const selected = await screen.findByTestId(
                "storyboard-mood-swatch-calm-p1",
            )
            fireEvent.click(selected)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    mood_color: null,
                })
            })
        })

        it("renders a clear button only when mood_color is set", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: null}),
            ])
            const {rerender} = render(<Storyboard {...defaultProps} />)
            await screen.findByTestId("storyboard-mood-palette-p1")
            expect(screen.queryByTestId("storyboard-mood-clear-p1")).toBeNull()

            // Now mount with mood_color set.
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: "#FFC857"}),
            ])
            rerender(<Storyboard {...defaultProps} bookId="b2" />)
            await waitFor(() => {
                expect(
                    screen.getByTestId("storyboard-mood-clear-p1"),
                ).toBeTruthy()
            })
        })

        it("clicking the clear button PATCHes mood_color: null", async () => {
            const updated = makePage({id: "p1", mood_color: null})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: "#F18A07"}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const clear = await screen.findByTestId("storyboard-mood-clear-p1")
            fireEvent.click(clear)
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    mood_color: null,
                })
            })
        })

        it("clicking a swatch does NOT trigger onSelectPage", async () => {
            const onSelectPage = vi.fn()
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", mood_color: null}),
            ])
            render(<Storyboard {...defaultProps} onSelectPage={onSelectPage} />)
            const swatch = await screen.findByTestId(
                "storyboard-mood-swatch-sunny-p1",
            )
            fireEvent.click(swatch)
            expect(onSelectPage).not.toHaveBeenCalled()
        })
    })

    describe("BeatSelector (Session 2 C2)", () => {
        it("renders the select with the namespaced testid + all 6 beat options + empty option", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", story_beat: null}),
            ])
            render(<Storyboard {...defaultProps} />)
            const select = (await screen.findByTestId(
                "storyboard-beat-select-p1-trigger",
            )) as HTMLSelectElement
            expect(select).toBeTruthy()
            // 6 beat options + 1 "no beat" allOption = 7. The empty
            // value renders as the RadixSelect "__all__" sentinel
            // option (it emits "" when picked).
            expect(select.options).toHaveLength(7)
            const values = Array.from(select.options).map((o) => o.value)
            expect(values).toEqual([
                "__all__",
                "setup",
                "inciting",
                "rising",
                "climax",
                "falling",
                "resolution",
            ])
        })

        it("preselects the current story_beat value", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", story_beat: "climax"}),
            ])
            render(<Storyboard {...defaultProps} />)
            const select = (await screen.findByTestId(
                "storyboard-beat-select-p1-trigger",
            )) as HTMLSelectElement
            expect(select.value).toBe("climax")
        })

        it("change triggers PATCH with the new story_beat value", async () => {
            const updated = makePage({id: "p1", story_beat: "rising"})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", story_beat: null}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const select = (await screen.findByTestId(
                "storyboard-beat-select-p1-trigger",
            )) as HTMLSelectElement
            fireEvent.change(select, {target: {value: "rising"}})
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    story_beat: "rising",
                })
            })
        })

        it("selecting the empty option clears via story_beat: null", async () => {
            const updated = makePage({id: "p1", story_beat: null})
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", story_beat: "climax"}),
            ])
            vi.mocked(api.pages.update).mockResolvedValue(updated)
            render(<Storyboard {...defaultProps} />)
            const select = (await screen.findByTestId(
                "storyboard-beat-select-p1-trigger",
            )) as HTMLSelectElement
            fireEvent.change(select, {target: {value: ""}})
            await waitFor(() => {
                expect(api.pages.update).toHaveBeenCalledWith("b1", "p1", {
                    story_beat: null,
                })
            })
        })

        it("changing to the current value does NOT trigger PATCH (no-op)", async () => {
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", story_beat: "climax"}),
            ])
            render(<Storyboard {...defaultProps} />)
            const select = (await screen.findByTestId(
                "storyboard-beat-select-p1-trigger",
            )) as HTMLSelectElement
            fireEvent.change(select, {target: {value: "climax"}})
            await new Promise((r) => setTimeout(r, 0))
            expect(api.pages.update).not.toHaveBeenCalled()
        })

        it("clicking the select does NOT trigger onSelectPage", async () => {
            const onSelectPage = vi.fn()
            vi.mocked(api.pages.list).mockResolvedValue([
                makePage({id: "p1", story_beat: null}),
            ])
            render(<Storyboard {...defaultProps} onSelectPage={onSelectPage} />)
            const select = await screen.findByTestId(
                "storyboard-beat-select-p1-trigger",
            )
            fireEvent.click(select)
            expect(onSelectPage).not.toHaveBeenCalled()
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

describe("Storyboard - Story Bible integration (C2 + C5)", () => {
    it("shows the Story Bible header toggle only when the plugin is available", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({
            plugin: "story-bible",
            version: "1.0.0",
            phase: "x",
        } as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        render(<Storyboard {...defaultProps} />)
        await waitFor(() => {
            expect(
                screen.getByTestId("storyboard-story-bible-toggle"),
            ).toBeTruthy()
        })
    })

    it("hides the toggle when the plugin is unavailable", async () => {
        // getInfo rejects (beforeEach default).
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        expect(
            screen.queryByTestId("storyboard-story-bible-toggle"),
        ).toBeNull()
    })

    it("renders entity badges from pageEntities on a card", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.pageEntities).mockResolvedValue([
            makeLink("e1", "Max"),
            makeLink("e2", "Lisa", "setting"),
        ] as never)
        render(<Storyboard {...defaultProps} />)
        await waitFor(() => {
            expect(
                screen.getByTestId("storyboard-entity-badge-p1-e1"),
            ).toBeTruthy()
        })
        expect(screen.getByTestId("storyboard-entity-badge-p1-e2")).toBeTruthy()
    })

    it("shows a +N more overflow indicator beyond 5 badges", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.pageEntities).mockResolvedValue(
            Array.from({length: 7}, (_, i) => makeLink(`e${i}`, `Ent ${i}`)) as never,
        )
        render(<Storyboard {...defaultProps} />)
        await waitFor(() => {
            expect(
                screen.getByTestId("storyboard-entity-badges-more-p1"),
            ).toBeTruthy()
        })
        expect(screen.getByTestId("storyboard-entity-badge-p1-e0")).toBeTruthy()
        expect(screen.queryByTestId("storyboard-entity-badge-p1-e5")).toBeNull()
    })

    it("opens the sidebar with the entity selected when a badge is clicked", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.pageEntities).mockResolvedValue([
            makeLink("e1", "Max"),
        ] as never)
        render(<Storyboard {...defaultProps} />)
        const badge = await screen.findByTestId("storyboard-entity-badge-p1-e1")
        expect(screen.queryByTestId("story-bible-sidebar-stub")).toBeNull()
        fireEvent.click(badge)
        const sidebar = await screen.findByTestId("story-bible-sidebar-stub")
        expect(sidebar.getAttribute("data-selected")).toBe("e1")
        expect(defaultProps.onSelectPage).not.toHaveBeenCalled()
    })
})

describe("Storyboard - drag entity onto card (C6)", () => {
    it("creates a link + adds a badge when an entity is dropped on a card", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.pageEntities).mockResolvedValue([])
        vi.mocked(api.storyBible.createLink).mockResolvedValue(
            makeLink("e9", "Dropped") as never,
        )
        render(<Storyboard {...defaultProps} />)
        const card = await screen.findByTestId("storyboard-card-p1")
        const dataTransfer = {
            types: [STORY_ENTITY_DND_MIME],
            getData: (type: string) =>
                type === STORY_ENTITY_DND_MIME ? "e9" : "",
            setData: vi.fn(),
        }
        fireEvent.dragOver(card, {dataTransfer})
        expect(card.getAttribute("data-drop-target")).toBe("true")
        fireEvent.drop(card, {dataTransfer})
        await waitFor(() => {
            expect(api.storyBible.createLink).toHaveBeenCalledWith({
                entity_id: "e9",
                page_id: "p1",
            })
        })
        // Badge appears for the dropped entity.
        await screen.findByTestId("storyboard-entity-badge-p1-e9")
    })

    it("does not create a link when the drop carries no entity id", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        render(<Storyboard {...defaultProps} />)
        const card = await screen.findByTestId("storyboard-card-p1")
        fireEvent.drop(card, {
            dataTransfer: {types: [], getData: () => "", setData: vi.fn()},
        })
        expect(api.storyBible.createLink).not.toHaveBeenCalled()
    })
})

describe("Storyboard - entity filter (C8)", () => {
    function makeEntity(id: string, name: string) {
        return {
            id,
            book_id: "b1",
            entity_type: "character",
            name,
            description: null,
            entity_metadata: null,
            image_asset_id: null,
            position: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }
    }

    it("filters the grid to pages where the selected entity appears", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2}),
        ])
        vi.mocked(api.storyBible.listEntities).mockResolvedValue([
            makeEntity("e1", "Max"),
        ] as never)
        // Max appears only on p1.
        vi.mocked(api.storyBible.appearances).mockResolvedValue([
            {...makeLink("e1", "Max"), page_id: "p1"},
        ] as never)
        render(<Storyboard {...defaultProps} />)
        const chip = await screen.findByTestId("storyboard-filter-chip-e1")
        // Unfiltered: both cards visible.
        expect(screen.getByTestId("storyboard-card-p1")).toBeTruthy()
        expect(screen.getByTestId("storyboard-card-p2")).toBeTruthy()
        fireEvent.click(chip)
        await waitFor(() => {
            expect(screen.queryByTestId("storyboard-card-p2")).toBeNull()
        })
        expect(screen.getByTestId("storyboard-card-p1")).toBeTruthy()
        // Clear restores all pages.
        fireEvent.click(screen.getByTestId("storyboard-filter-clear"))
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-card-p2")).toBeTruthy()
        })
    })

    it("hides the filter bar when there are no entities", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.listEntities).mockResolvedValue([])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        expect(screen.queryByTestId("storyboard-entity-filter")).toBeNull()
    })
})

describe("Storyboard - arc view toggle (C9)", () => {
    it("switches to arc view when the toggle is clicked", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.listEntities).mockResolvedValue([
            {
                id: "e1",
                book_id: "b1",
                entity_type: "character",
                name: "Max",
                description: null,
                entity_metadata: null,
                image_asset_id: null,
                position: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ] as never)
        vi.mocked(api.storyBible.appearances).mockResolvedValue([])
        render(<Storyboard {...defaultProps} />)
        const toggle = await screen.findByTestId("storyboard-view-toggle")
        // Grid first: card present.
        expect(screen.getByTestId("storyboard-card-p1")).toBeTruthy()
        fireEvent.click(toggle)
        // Arc view region appears (empty arc since no appearances), grid card gone.
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-arc-empty")).toBeTruthy()
        })
        expect(screen.queryByTestId("storyboard-card-p1")).toBeNull()
    })
})

describe("Storyboard - continuity warnings (C11)", () => {
    it("badges a page with a continuity warning and dismisses it", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.continuityCheck).mockResolvedValue([
            {code: "empty_page", page_id: "p1", page_position: 1},
        ] as never)
        render(<Storyboard {...defaultProps} />)
        const warn = await screen.findByTestId("storyboard-warning-p1")
        expect(warn).toBeTruthy()
        fireEvent.click(screen.getByTestId("storyboard-warning-dismiss-p1"))
        await waitFor(() => {
            expect(screen.queryByTestId("storyboard-warning-p1")).toBeNull()
        })
    })

    it("shows no warning badge when continuity-check is clean", async () => {
        vi.mocked(api.storyBible.getInfo).mockResolvedValue({} as never)
        vi.mocked(api.pages.list).mockResolvedValue([makePage({id: "p1"})])
        vi.mocked(api.storyBible.continuityCheck).mockResolvedValue([])
        render(<Storyboard {...defaultProps} />)
        await screen.findByTestId("storyboard-card-p1")
        expect(screen.queryByTestId("storyboard-warning-p1")).toBeNull()
    })
})
