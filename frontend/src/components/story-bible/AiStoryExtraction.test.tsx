import {describe, it, expect, beforeEach, vi} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import AiStoryExtraction from "./AiStoryExtraction";
import {FeatureTestProvider} from "../../features/FeatureTestProvider";
import {applyStoryBible, extractStoryBible, type StoryBibleExtraction} from "../../ai/storyExtraction";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));

vi.mock("../../utils/notify", () => ({
    notify: {error: vi.fn(), success: vi.fn(), info: vi.fn()},
}));

// The orchestrator is unit-tested separately; here it is stubbed so the
// component's gate + dialog + apply wiring is the subject under test.
vi.mock("../../ai/storyExtraction", () => ({
    extractStoryBible: vi.fn(),
    extractStoryboard: vi.fn(),
    applyStoryBible: vi.fn(),
    applyStoryboard: vi.fn(),
    StoryExtractionError: class StoryExtractionError extends Error {
        code: string;
        constructor(code: string) {
            super(code);
            this.code = code;
        }
    },
    AiClientError: class AiClientError extends Error {},
}));

const mockExtract = vi.mocked(extractStoryBible);
const mockApply = vi.mocked(applyStoryBible);

const sampleExtraction: StoryBibleExtraction = {
    kind: "story-bible",
    entities: [],
    relationships: [],
    existingByName: {},
    existingRelations: {},
    items: [
        {
            key: "e0",
            badgeKey: "ui.ai_extraction.badge.character",
            title: "Elias",
            detail: "Hauptfigur",
        },
    ],
    notes: [],
    tokens: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("AiStoryExtraction gate", () => {
    it("disables the trigger in dexie mode without an AI key (Reproduktion)", () => {
        render(
            <FeatureTestProvider mode="dexie" hasAiKey={false}>
                <AiStoryExtraction bookId="b1" target="story-bible" onApplied={vi.fn()} />
            </FeatureTestProvider>,
        );
        expect(screen.getByTestId("ai-story-extraction-trigger")).toBeDisabled();
    });

    it("enables the trigger when an AI key is configured", () => {
        render(
            <FeatureTestProvider mode="dexie" hasAiKey={true}>
                <AiStoryExtraction bookId="b1" target="story-bible" onApplied={vi.fn()} />
            </FeatureTestProvider>,
        );
        expect(screen.getByTestId("ai-story-extraction-trigger")).not.toBeDisabled();
    });
});

describe("AiStoryExtraction happy path", () => {
    it("runs extraction, shows the preview, applies the selection (Happy-Path)", async () => {
        mockExtract.mockResolvedValue(sampleExtraction);
        mockApply.mockResolvedValue(1);
        const onApplied = vi.fn();

        render(
            <FeatureTestProvider mode="api" hasAiKey={true}>
                <AiStoryExtraction bookId="b1" target="story-bible" onApplied={onApplied} />
            </FeatureTestProvider>,
        );

        fireEvent.click(screen.getByTestId("ai-story-extraction-trigger"));

        // Preview dialog + the proposed item appear.
        await screen.findByTestId("ai-story-extraction-dialog");
        await screen.findByTestId("ai-story-extraction-item-e0");
        expect(mockExtract).toHaveBeenCalledWith("b1", expect.anything());

        // The non-existing item is pre-selected, so "Apply selected" is enabled.
        fireEvent.click(screen.getByTestId("ai-story-extraction-apply"));

        await waitFor(() => {
            expect(mockApply).toHaveBeenCalledTimes(1);
            expect(onApplied).toHaveBeenCalledTimes(1);
        });
        // The selected set carried the pre-checked item.
        const passedSelection = mockApply.mock.calls[0][2] as ReadonlySet<string>;
        expect(passedSelection.has("e0")).toBe(true);
    });
});
