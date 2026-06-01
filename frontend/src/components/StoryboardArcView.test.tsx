import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import StoryboardArcView from "./StoryboardArcView"
import {api, type Page, type StoryEntityOut} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fb: string) => fb, lang: "en", setLang: vi.fn()}),
}))

vi.mock("../api/client", async () => {
    const actual =
        await vi.importActual<typeof import("../api/client")>("../api/client")
    return {
        ...actual,
        api: {...actual.api, storyBible: {...actual.api.storyBible, appearances: vi.fn()}},
    }
})

function page(id: string, position: number, mood: string | null = null): Page {
    return {
        id,
        book_id: "b1",
        position,
        layout: "image_top_text_bottom",
        text_content: null,
        image_asset_id: null,
        layout_config: null,
        notes: null,
        story_beat: null,
        mood_color: mood,
        act_group: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
    }
}

function entity(id: string, name: string): StoryEntityOut {
    return {
        id,
        book_id: "b1",
        entity_type: "character",
        name,
        description: null,
        entity_metadata: null,
        image_asset_id: null,
        position: 1,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
    }
}

function link(entityId: string, pageId: string, role: string | null = null) {
    return {
        id: `lnk-${entityId}-${pageId}`,
        entity_id: entityId,
        page_id: pageId,
        chapter_id: null,
        role,
        notes: null,
        created_at: "2026-05-30T00:00:00Z",
        entity: entity(entityId, entityId),
    }
}

const pages = [page("p1", 1), page("p2", 2), page("p3", 3)]
const entities = [entity("e1", "Max"), entity("e2", "Lisa")]

beforeEach(() => {
    vi.mocked(api.storyBible.appearances).mockReset()
})

describe("StoryboardArcView (C9)", () => {
    it("renders a lane per entity-with-appearances and a dot per page", async () => {
        vi.mocked(api.storyBible.appearances).mockImplementation((id: string) =>
            Promise.resolve(
                id === "e1"
                    ? [link("e1", "p1", "protagonist"), link("e1", "p3")]
                    : [link("e2", "p3")],
            ) as never,
        )
        const onSelectPage = vi.fn()
        render(
            <StoryboardArcView
                pages={pages}
                entities={entities}
                onSelectPage={onSelectPage}
            />,
        )
        // Both entities have appearances -> two lanes.
        await screen.findByTestId("storyboard-arc-lane-e1")
        expect(screen.getByTestId("storyboard-arc-lane-e2")).toBeTruthy()
        // Max appears on p1 + p3.
        expect(screen.getByTestId("storyboard-arc-dot-e1-p1")).toBeTruthy()
        expect(screen.getByTestId("storyboard-arc-dot-e1-p3")).toBeTruthy()
        // Max does NOT appear on p2.
        expect(screen.queryByTestId("storyboard-arc-dot-e1-p2")).toBeNull()
        // Clicking a dot navigates to that page.
        fireEvent.click(screen.getByTestId("storyboard-arc-dot-e2-p3"))
        expect(onSelectPage).toHaveBeenCalledWith("p3")
    })

    it("omits entities that have no appearances", async () => {
        vi.mocked(api.storyBible.appearances).mockImplementation((id: string) =>
            Promise.resolve(id === "e1" ? [link("e1", "p1")] : []) as never,
        )
        render(
            <StoryboardArcView
                pages={pages}
                entities={entities}
                onSelectPage={vi.fn()}
            />,
        )
        await screen.findByTestId("storyboard-arc-lane-e1")
        expect(screen.queryByTestId("storyboard-arc-lane-e2")).toBeNull()
    })

    it("shows the empty state when no entity has appearances", async () => {
        vi.mocked(api.storyBible.appearances).mockResolvedValue([])
        render(
            <StoryboardArcView
                pages={pages}
                entities={entities}
                onSelectPage={vi.fn()}
            />,
        )
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-arc-empty")).toBeTruthy()
        })
    })

    // --- C10 relationship lines ----------------------------------

    it("draws a relationship line only when the toggle is on and both share a page", async () => {
        vi.mocked(api.storyBible.appearances).mockImplementation((id: string) =>
            Promise.resolve(
                id === "e1" ? [link("e1", "p3")] : [link("e2", "p3")],
            ) as never,
        )
        const e1WithRel: StoryEntityOut = {
            ...entity("e1", "Max"),
            relationships: [
                {target_entity_id: "e2", relationship_type: "rival", description: "Foes."},
            ],
        }
        render(
            <StoryboardArcView
                pages={pages}
                entities={[e1WithRel, entity("e2", "Lisa")]}
                onSelectPage={vi.fn()}
            />,
        )
        const toggle = await screen.findByTestId("storyboard-arc-relationships-toggle")
        // Off by default: no relationship group.
        expect(screen.queryByTestId("storyboard-arc-relationships")).toBeNull()
        fireEvent.click(toggle)
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-arc-relationships")).toBeTruthy()
        })
    })

    it("draws no line when the related entities never share a page", async () => {
        vi.mocked(api.storyBible.appearances).mockImplementation((id: string) =>
            Promise.resolve(
                id === "e1" ? [link("e1", "p1")] : [link("e2", "p3")],
            ) as never,
        )
        const e1WithRel: StoryEntityOut = {
            ...entity("e1", "Max"),
            relationships: [{target_entity_id: "e2", relationship_type: "ally"}],
        }
        render(
            <StoryboardArcView
                pages={pages}
                entities={[e1WithRel, entity("e2", "Lisa")]}
                onSelectPage={vi.fn()}
            />,
        )
        const toggle = await screen.findByTestId("storyboard-arc-relationships-toggle")
        fireEvent.click(toggle)
        // Shared-page set is empty -> the relationships group never renders.
        await waitFor(() => {
            expect(screen.getByTestId("storyboard-arc-lane-e1")).toBeTruthy()
        })
        expect(screen.queryByTestId("storyboard-arc-relationships")).toBeNull()
    })
})
