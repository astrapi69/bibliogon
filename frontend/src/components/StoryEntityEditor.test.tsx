import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import StoryEntityEditor from "./StoryEntityEditor";
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

vi.mock("../utils/notify", () => ({
    notify: {error: vi.fn()},
}));

// Stub the heavy TipTap-based editors with simple controllable shims.
vi.mock("./RichTextEditor", () => ({
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

vi.mock("./EditableTitle", () => ({
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

vi.mock("../api/client", async () => {
    const actual =
        await vi.importActual<typeof import("../api/client")>("../api/client");
    return {
        ...actual,
        api: {
            storyBible: {
                getEntity: (...a: unknown[]) => mockGetEntity(...a),
                listEntityTypes: () => mockListTypes(),
                updateEntity: (...a: unknown[]) => mockUpdate(...a),
                deleteEntity: (...a: unknown[]) => mockDelete(...a),
            },
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
});
