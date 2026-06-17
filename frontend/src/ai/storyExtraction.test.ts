import { describe, it, expect, beforeEach, vi } from "vitest";

import { aiChat } from "./llmClient";
import {
  StoryExtractionError,
  applyStoryBible,
  applyStoryboard,
  extractStoryBible,
  extractStoryboard,
} from "./storyExtraction";

// Fully mock the browser-direct LLM client: tests drive the canned model
// response through `aiChat` and never touch a network.
vi.mock("./llmClient", () => ({
  aiChat: vi.fn(),
  getAiConfig: vi.fn(async () => ({
    provider: "openai",
    base_url: "https://example.test/v1",
    model: "gpt",
    api_key: "k",
  })),
  isAiConfigured: vi.fn(() => true),
  AiClientError: class AiClientError extends Error {},
}));

// In-memory storage seam stub in dexie mode (so the offline browser-direct
// path is exercised; the apply step writes through this stub).
const storage = {
  mode: "dexie" as const,
  chapters: { list: vi.fn(), update: vi.fn(async () => ({})) },
  storyBible: {
    listEntities: vi.fn(async () => [] as unknown[]),
    createEntity: vi.fn(async (_bookId: string, data: { name: string }) => ({
      id: `id-${data.name}`,
    })),
    updateEntity: vi.fn(async () => ({})),
  },
  books: { get: vi.fn(async () => ({ language: "de" })) },
};

vi.mock("../storage", () => ({ getStorage: () => storage }));

const mockAiChat = vi.mocked(aiChat);

/** Wrap plain text into a minimal TipTap doc JSON string. */
function tiptap(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

function reply(json: unknown): void {
  mockAiChat.mockResolvedValue({
    content: JSON.stringify(json),
    model: "gpt",
    usage: { total_tokens: 7 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.storyBible.listEntities.mockResolvedValue([]);
  storage.storyBible.createEntity.mockImplementation(
    async (_bookId: string, data: { name: string }) => ({ id: `id-${data.name}` }),
  );
});

describe("extractStoryBible", () => {
  it("maps the five categories onto entities + relationships (happy path)", async () => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "Kapitel 1", content: tiptap("Elias trifft Chen."), version: 1 },
    ]);
    reply({
      characters: [
        { name: "Elias", description: "Hauptfigur" },
        { name: "Chen", description: "Antagonistin" },
      ],
      locations: [{ name: "Zürich", description: "Labor" }],
      timeline: [{ event: "Das Experiment", description: "Beginn" }],
      themes: [{ name: "Identität", description: "Kernmotiv" }],
      relationships: [{ from: "Elias", to: "Chen", type: "mentor", description: "lehrt" }],
    });

    const result = await extractStoryBible("b1");

    expect(result.kind).toBe("story-bible");
    // 2 characters + 1 location + 1 timeline + 1 theme = 5 entities, + 1 relationship.
    expect(result.entities).toHaveLength(5);
    expect(result.relationships).toHaveLength(1);
    expect(result.items).toHaveLength(6);
    expect(result.entities[0]).toMatchObject({ entityType: "character", name: "Elias" });
  });

  it("rejects with no_chapters when the book has no chapters", async () => {
    storage.chapters.list.mockResolvedValue([]);
    await expect(extractStoryBible("b1")).rejects.toBeInstanceOf(StoryExtractionError);
    await expect(extractStoryBible("b1")).rejects.toMatchObject({ code: "no_chapters" });
  });

  it("rejects with no_content when chapters carry no text", async () => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "Leer", content: tiptap(""), version: 1 },
    ]);
    await expect(extractStoryBible("b1")).rejects.toMatchObject({ code: "no_content" });
  });

  it("returns zero items on malformed AI JSON without throwing (graceful fallback)", async () => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "K1", content: tiptap("Some text"), version: 1 },
    ]);
    mockAiChat.mockResolvedValue({
      content: "Sorry, I cannot do that {not valid json",
      model: "gpt",
      usage: { total_tokens: 1 },
    });

    const result = await extractStoryBible("b1");
    expect(result.items).toHaveLength(0);
    expect(result.kind).toBe("story-bible");
  });

  it("marks proposals that already exist (augment, never overwrite)", async () => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "K1", content: tiptap("Elias und Chen"), version: 1 },
    ]);
    storage.storyBible.listEntities.mockResolvedValue([
      { id: "e1", entity_type: "character", name: "Elias", relationships: [] },
    ]);
    reply({
      characters: [
        { name: "Elias", description: "x" },
        { name: "Chen", description: "y" },
      ],
      locations: [],
      timeline: [],
      themes: [],
      relationships: [],
    });

    const result = await extractStoryBible("b1");
    const elias = result.entities.find((e) => e.name === "Elias");
    const chen = result.entities.find((e) => e.name === "Chen");
    expect(elias?.existing).toBe(true);
    expect(chen?.existing).toBe(false);
  });
});

describe("applyStoryBible", () => {
  it("creates only non-existing entities and wires selected relationships", async () => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "K1", content: tiptap("Elias und Chen"), version: 1 },
    ]);
    reply({
      characters: [
        { name: "Elias", description: "Hauptfigur" },
        { name: "Chen", description: "Gegnerin" },
      ],
      locations: [],
      timeline: [],
      themes: [],
      relationships: [{ from: "Elias", to: "Chen", type: "mentor", description: "lehrt" }],
    });
    const extraction = await extractStoryBible("b1");
    const selected = new Set(extraction.items.map((item) => item.key));

    const applied = await applyStoryBible("b1", extraction, selected);

    // 2 created entities + 1 relationship wired = 3.
    expect(applied).toBe(3);
    expect(storage.storyBible.createEntity).toHaveBeenCalledTimes(2);
    expect(storage.storyBible.updateEntity).toHaveBeenCalledTimes(1);
    expect(storage.storyBible.updateEntity).toHaveBeenCalledWith(
      "id-Elias",
      expect.objectContaining({
        relationships: [
          expect.objectContaining({
            target_entity_id: "id-Chen",
            relationship_type: "mentor",
          }),
        ],
      }),
    );
  });

  it("does not create an entity that already exists", async () => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "K1", content: tiptap("Elias und Chen"), version: 1 },
    ]);
    storage.storyBible.listEntities.mockResolvedValue([
      { id: "e1", entity_type: "character", name: "Elias", relationships: [] },
    ]);
    reply({
      characters: [
        { name: "Elias", description: "x" },
        { name: "Chen", description: "y" },
      ],
      locations: [],
      timeline: [],
      themes: [],
      relationships: [{ from: "Elias", to: "Chen", type: "rival" }],
    });
    const extraction = await extractStoryBible("b1");
    const selected = new Set(extraction.items.map((item) => item.key));

    await applyStoryBible("b1", extraction, selected);

    expect(storage.storyBible.createEntity).toHaveBeenCalledTimes(1);
    expect(storage.storyBible.createEntity).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ name: "Chen", entity_type: "character" }),
    );
    // Existing Elias (e1) gets the relationship attached.
    expect(storage.storyBible.updateEntity).toHaveBeenCalledWith("e1", expect.anything());
  });
});

describe("extractStoryboard + applyStoryboard", () => {
  beforeEach(() => {
    storage.chapters.list.mockResolvedValue([
      { id: "c1", title: "Anfang", content: tiptap("Setup-Text"), version: 3 },
      { id: "c2", title: "Ende", content: tiptap("Climax-Text"), version: 4 },
    ]);
  });

  it("summarises chapters, validates beat/mood, collects notes", async () => {
    reply({
      chapters: [
        {
          index: 1,
          summary: "Die Welt wird etabliert.",
          beat: "setup",
          mood_color: "#4ECDC4",
        },
        { index: 2, summary: "Der Höhepunkt.", beat: "not-a-beat", mood_color: "blau" },
      ],
      plot_arc: "Steigende Spannung.",
      continuity_notes: ["Offener Faden A"],
    });

    const result = await extractStoryboard("b1");
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]).toMatchObject({ beat: "setup", moodColor: "#4ECDC4" });
    // Invalid beat + non-hex mood fall back to null.
    expect(result.chapters[1]).toMatchObject({ beat: null, moodColor: null });
    expect(result.notes).toEqual(["Steigende Spannung.", "Offener Faden A"]);
  });

  it("applies selected chapter summaries onto the annotation columns", async () => {
    reply({
      chapters: [
        {
          index: 1,
          summary: "Die Welt wird etabliert.",
          beat: "setup",
          mood_color: "#4ECDC4",
        },
        { index: 2, summary: "Der Höhepunkt.", beat: "climax" },
      ],
      plot_arc: "",
      continuity_notes: [],
    });
    const extraction = await extractStoryboard("b1");
    const selected = new Set(extraction.items.map((item) => item.key));

    const applied = await applyStoryboard("b1", extraction, selected);

    expect(applied).toBe(2);
    expect(storage.chapters.update).toHaveBeenCalledWith(
      "b1",
      "c1",
      expect.objectContaining({
        version: 3,
        notes: "Die Welt wird etabliert.",
        story_beat: "setup",
        mood_color: "#4ECDC4",
      }),
    );
    expect(storage.chapters.update).toHaveBeenCalledWith(
      "b1",
      "c2",
      expect.objectContaining({ version: 4, notes: "Der Höhepunkt.", story_beat: "climax" }),
    );
  });
});
