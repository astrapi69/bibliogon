import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import StoryBibleSidebar from "./StoryBibleSidebar";
import type {StoryEntityOut, StoryEntityTypeDef} from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockConfirm = vi.fn();
vi.mock("./AppDialog", () => ({
    useDialog: () => ({confirm: mockConfirm}),
}));

const mockNotifyError = vi.fn();
vi.mock("../utils/notify", () => ({
    notify: {error: (...a: unknown[]) => mockNotifyError(...a)},
}));

const mockListTypes = vi.fn();
const mockListEntities = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockExportBible = vi.fn();

vi.mock("../api/client", async () => {
    const actual =
        await vi.importActual<typeof import("../api/client")>("../api/client");
    return {
        ...actual,
        api: {
            storyBible: {
                listEntityTypes: () => mockListTypes(),
                listEntities: (...a: unknown[]) => mockListEntities(...a),
                createEntity: (...a: unknown[]) => mockCreate(...a),
                deleteEntity: (...a: unknown[]) => mockDelete(...a),
                exportBible: (...a: unknown[]) => mockExportBible(...a),
            },
        },
    };
});

function typeDef(
    id: string,
    icon: string,
    isDefault = false,
): StoryEntityTypeDef {
    return {
        id,
        label_key: `ui.story_bible.${id}`,
        description_key: `ui.story_bible.${id}_description`,
        icon,
        default: isDefault,
        extra_fields: [],
    };
}

const TYPES: Record<string, StoryEntityTypeDef> = {
    character: typeDef("character", "User", true),
    setting: typeDef("setting", "MapPin"),
    plot_point: typeDef("plot_point", "Milestone"),
    item: typeDef("item", "Package"),
    lore: typeDef("lore", "BookMarked"),
};

function entity(
    id: string,
    entity_type: string,
    name: string,
    description: string | null = null,
): StoryEntityOut {
    return {
        id,
        book_id: "b1",
        entity_type,
        name,
        description,
        entity_metadata: null,
        image_asset_id: null,
        position: 1,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
    };
}

beforeEach(() => {
    mockListTypes.mockReset();
    mockListTypes.mockResolvedValue(TYPES);
    mockListEntities.mockReset();
    mockListEntities.mockResolvedValue([]);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue(entity("new", "character", "New"));
    mockDelete.mockReset();
    mockDelete.mockResolvedValue(undefined);
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
    mockNotifyError.mockReset();
    mockExportBible.mockReset();
    mockExportBible.mockResolvedValue({
        filename: "story-bible-b.md",
        content: "# Story Bible: B",
        format: "markdown",
    });
});

describe("StoryBibleSidebar", () => {
    it("renders the panel and a group per entity type", async () => {
        render(<StoryBibleSidebar bookId="b1" onClose={vi.fn()} onSelectEntity={vi.fn()} />);
        expect(await screen.findByTestId("story-bible-sidebar")).toBeTruthy();
        for (const id of Object.keys(TYPES)) {
            expect(
                await screen.findByTestId(`story-bible-group-${id}`),
            ).toBeTruthy();
            // Add button visible per group.
            expect(screen.getByTestId(`story-bible-add-${id}`)).toBeTruthy();
        }
    });

    it("shows the all-empty state when the book has no entities", async () => {
        render(<StoryBibleSidebar bookId="b1" onClose={vi.fn()} onSelectEntity={vi.fn()} />);
        expect(await screen.findByTestId("story-bible-empty")).toBeTruthy();
    });

    it("lists entities under their type group", async () => {
        mockListEntities.mockResolvedValue([
            entity("c1", "character", "Alice"),
            entity("c2", "character", "Bob"),
            entity("l1", "lore", "Magic System"),
        ]);
        render(<StoryBibleSidebar bookId="b1" onClose={vi.fn()} onSelectEntity={vi.fn()} />);
        expect(await screen.findByTestId("story-bible-entry-c1")).toBeTruthy();
        expect(screen.getByTestId("story-bible-entry-c2")).toBeTruthy();
        expect(screen.getByTestId("story-bible-entry-l1")).toBeTruthy();
        expect(screen.getByText("Alice")).toBeTruthy();
    });

    it("creates an entity from the inline add form", async () => {
        render(<StoryBibleSidebar bookId="b1" onClose={vi.fn()} onSelectEntity={vi.fn()} />);
        await screen.findByTestId("story-bible-group-character");
        fireEvent.click(screen.getByTestId("story-bible-add-character"));
        const input = await screen.findByTestId(
            "story-bible-add-input-character",
        );
        fireEvent.change(input, {target: {value: "Carol"}});
        fireEvent.click(screen.getByTestId("story-bible-add-save-character"));
        await waitFor(() =>
            expect(mockCreate).toHaveBeenCalledWith("b1", {
                entity_type: "character",
                name: "Carol",
            }),
        );
    });

    it("deletes an entity after confirmation", async () => {
        mockListEntities.mockResolvedValue([
            entity("c1", "character", "Alice"),
        ]);
        render(<StoryBibleSidebar bookId="b1" onClose={vi.fn()} onSelectEntity={vi.fn()} />);
        await screen.findByTestId("story-bible-entry-c1");
        fireEvent.click(screen.getByTestId("story-bible-delete-c1"));
        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("c1"));
    });

    it("clicking an entry opens its detail view via onSelectEntity", async () => {
        const alice = entity("c1", "character", "Alice");
        mockListEntities.mockResolvedValue([alice]);
        const onSelectEntity = vi.fn();
        render(
            <StoryBibleSidebar
                bookId="b1"
                onClose={vi.fn()}
                onSelectEntity={onSelectEntity}
            />,
        );
        fireEvent.click(await screen.findByTestId("story-bible-entry-name-c1"));
        expect(onSelectEntity).toHaveBeenCalledWith(
            expect.objectContaining({id: "c1", name: "Alice"}),
        );
    });

    it("exports the Story Bible as a Markdown download", async () => {
        // Assign only the static methods so URL stays a constructor
        // (spreading the class into a plain object breaks `new URL`,
        // and stubGlobal can leak across files). Restore afterwards.
        const origCreate = (URL as unknown as {createObjectURL?: unknown})
            .createObjectURL;
        const origRevoke = (URL as unknown as {revokeObjectURL?: unknown})
            .revokeObjectURL;
        const createObjectURL = vi.fn(() => "blob:x");
        URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
        URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
        try {
            render(
                <StoryBibleSidebar
                    bookId="b1"
                    onClose={vi.fn()}
                    onSelectEntity={vi.fn()}
                />,
            );
            const exportBtn = await screen.findByTestId("story-bible-export");
            fireEvent.click(exportBtn);
            await waitFor(() => {
                expect(mockExportBible).toHaveBeenCalledWith("b1");
            });
            expect(createObjectURL).toHaveBeenCalled();
        } finally {
            URL.createObjectURL = origCreate as typeof URL.createObjectURL;
            URL.revokeObjectURL = origRevoke as typeof URL.revokeObjectURL;
        }
    });
});
