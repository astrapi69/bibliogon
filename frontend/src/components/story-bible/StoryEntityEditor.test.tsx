import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import StoryEntityEditor from "./StoryEntityEditor";
import type {StoryEntityOut, StoryEntityTypeDef} from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockConfirm = vi.fn();
vi.mock("../shared/AppDialog", () => ({
    useDialog: () => ({confirm: mockConfirm}),
}));

vi.mock("../../utils/platform/notify", () => ({
    notify: {error: vi.fn()},
}));

// Stub the heavy TipTap-based editors with simple controllable shims.
vi.mock("../RichTextEditor", () => ({
    default: ({
        onChange,
        testidNamespace,
    }: {
        onChange?: (json: unknown) => void;
        testidNamespace: string;
    }) => (
        <button
            data-testid={`${testidNamespace}-content`}
            onClick={() => onChange?.({type: "doc", content: []})}
        >
            description
        </button>
    ),
}));

vi.mock("../shared/EditableTitle", () => ({
    default: ({
        value,
        onSave,
        testIdPrefix,
    }: {
        value: string;
        onSave: (v: string) => void;
        testIdPrefix: string;
    }) => (
        <input
            data-testid={`${testIdPrefix}-input`}
            defaultValue={value}
            onBlur={(e) => onSave(e.target.value)}
        />
    ),
}));

const mockGetEntity = vi.fn();
const mockListTypes = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockAppearances = vi.fn();
const mockDeleteLink = vi.fn();
const mockListEntities = vi.fn();
const mockPagesList = vi.fn();
const mockBooksGet = vi.fn();

vi.mock("../../api/client", async () => {
    const actual =
        await vi.importActual<typeof import("../../api/client")>("../../api/client");
    return {
        ...actual,
        api: {
            storyBible: {
                getEntity: (...a: unknown[]) => mockGetEntity(...a),
                listEntityTypes: () => mockListTypes(),
                updateEntity: (...a: unknown[]) => mockUpdate(...a),
                deleteEntity: (...a: unknown[]) => mockDelete(...a),
                appearances: (...a: unknown[]) => mockAppearances(...a),
                deleteLink: (...a: unknown[]) => mockDeleteLink(...a),
                listEntities: (...a: unknown[]) => mockListEntities(...a),
            },
            pages: {list: (...a: unknown[]) => mockPagesList(...a)},
            books: {get: (...a: unknown[]) => mockBooksGet(...a)},
        },
    };
});

const CHARACTER: StoryEntityTypeDef = {
    id: "character",
    label_key: "ui.story_bible.character",
    description_key: "ui.story_bible.character_description",
    icon: "User",
    default: true,
    extra_fields: [
        {name: "role", type: "text", label_key: "ui.story_bible.role"},
        {
            name: "beat",
            type: "enum",
            label_key: "ui.story_bible.beat",
            values: ["setup", "climax"],
        },
    ],
};

function entity(): StoryEntityOut {
    return {
        id: "c1",
        book_id: "b1",
        entity_type: "character",
        name: "Alice",
        description: null,
        entity_metadata: {role: "hero"},
        image_asset_id: null,
        position: 1,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
    };
}

beforeEach(() => {
    mockGetEntity.mockReset();
    mockGetEntity.mockResolvedValue(entity());
    mockListTypes.mockReset();
    mockListTypes.mockResolvedValue({character: CHARACTER});
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue(entity());
    mockDelete.mockReset();
    mockDelete.mockResolvedValue(undefined);
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
    mockAppearances.mockReset();
    mockAppearances.mockResolvedValue([]);
    mockDeleteLink.mockReset();
    mockDeleteLink.mockResolvedValue(undefined);
    mockListEntities.mockReset();
    mockListEntities.mockResolvedValue([]);
    mockPagesList.mockReset();
    mockPagesList.mockResolvedValue([]);
    mockBooksGet.mockReset();
    mockBooksGet.mockResolvedValue({chapters: []});
});

describe("StoryEntityEditor", () => {
    it("renders name, type badge, description editor and metadata fields", async () => {
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        expect(await screen.findByTestId("story-entity-name-input")).toBeTruthy();
        expect(screen.getByTestId("story-entity-type")).toBeTruthy();
        expect(
            screen.getByTestId("story-entity-description-content"),
        ).toBeTruthy();
        // SSoT extra_fields render as inputs.
        expect(screen.getByTestId("story-entity-field-role")).toBeTruthy();
        expect(screen.getByTestId("story-entity-field-beat")).toBeTruthy();
    });

    it("saves the name on blur", async () => {
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        const nameInput = await screen.findByTestId("story-entity-name-input");
        fireEvent.blur(nameInput, {target: {value: "Alice the Brave"}});
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("c1", {
                name: "Alice the Brave",
            }),
        );
    });

    it("persists a metadata field change (debounced)", async () => {
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        const beat = await screen.findByTestId("story-entity-field-beat");
        fireEvent.change(beat, {target: {value: "climax"}});
        await waitFor(
            () =>
                expect(mockUpdate).toHaveBeenCalledWith("c1", {
                    entity_metadata: {role: "hero", beat: "climax"},
                }),
            {timeout: 2000},
        );
    });

    it("deletes after confirmation and calls onDeleted", async () => {
        const onDeleted = vi.fn();
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={onDeleted}
            />,
        );
        fireEvent.click(await screen.findByTestId("story-entity-delete"));
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("c1"));
        await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    });

    it("calls onBack from the back button", async () => {
        const onBack = vi.fn();
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={onBack}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        fireEvent.click(await screen.findByTestId("story-entity-back"));
        expect(onBack).toHaveBeenCalled();
    });

    it("renders the appearances section with a page link and removes it", async () => {
        mockAppearances.mockResolvedValue([
            {
                id: "lnk1",
                entity_id: "c1",
                page_id: "p1",
                chapter_id: null,
                role: "protagonist",
                notes: null,
                created_at: "2026-05-30T00:00:00Z",
                entity: entity(),
            },
        ]);
        mockPagesList.mockResolvedValue([
            {id: "p1", position: 3, book_id: "b1", layout: "image_top_text_bottom"},
        ]);
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        const item = await screen.findByTestId("story-entity-appearance-lnk1");
        // Role shows immediately; the page position resolves after the
        // pages.list fetch completes (separate async effect).
        expect(item.textContent).toContain("protagonist");
        await waitFor(() => {
            expect(
                screen.getByTestId("story-entity-appearance-lnk1").textContent,
            ).toContain("3");
        });
        fireEvent.click(
            screen.getByTestId("story-entity-appearance-remove-lnk1"),
        );
        await waitFor(() => {
            expect(mockDeleteLink).toHaveBeenCalledWith("lnk1");
        });
    });

    it("shows the empty appearances state when there are none", async () => {
        mockAppearances.mockResolvedValue([]);
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        expect(
            await screen.findByTestId("story-entity-appearances-empty"),
        ).toBeTruthy();
    });

    // --- C10 relationships ---------------------------------------

    it("shows the empty relationships state with an add row when other entities exist", async () => {
        mockListEntities.mockResolvedValue([
            entity(),
            {...entity(), id: "c2", name: "Bob"},
        ]);
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        expect(
            await screen.findByTestId("story-entity-relationships-empty"),
        ).toBeTruthy();
        // Add row visible because there is another entity to target.
        expect(
            await screen.findByTestId("story-entity-relationship-add"),
        ).toBeTruthy();
    });

    it("renders an existing relationship with the target name + type", async () => {
        mockGetEntity.mockResolvedValue({
            ...entity(),
            relationships: [
                {target_entity_id: "c2", relationship_type: "rival", description: "Old foes."},
            ],
        });
        mockListEntities.mockResolvedValue([{...entity(), id: "c2", name: "Bob"}]);
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        // The relationship row appears as soon as getEntity resolves, but the
        // target *name* is filled from a separate listEntities fetch. Wait for
        // that second fetch to resolve before asserting the name, otherwise the
        // row briefly shows the "(unknown)" fallback and the assertion races it
        // (flaky under CI coverage-mode test ordering).
        await screen.findByTestId("story-entity-relationship-c2");
        await waitFor(() =>
            expect(
                screen.getByTestId("story-entity-relationship-c2").textContent,
            ).toContain("Bob"),
        );
        expect(
            screen.getByTestId("story-entity-relationship-type-c2").textContent,
        ).toContain("rival");
    });

    it("removing a relationship persists the shortened list", async () => {
        mockGetEntity.mockResolvedValue({
            ...entity(),
            relationships: [
                {target_entity_id: "c2", relationship_type: "ally", description: null},
            ],
        });
        mockListEntities.mockResolvedValue([{...entity(), id: "c2", name: "Bob"}]);
        render(
            <StoryEntityEditor
                entityId="c1"
                onBack={vi.fn()}
                onChanged={vi.fn()}
                onDeleted={vi.fn()}
            />,
        );
        const removeBtn = await screen.findByTestId(
            "story-entity-relationship-remove-c2",
        );
        fireEvent.click(removeBtn);
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith("c1", {relationships: []}),
        );
    });
});
