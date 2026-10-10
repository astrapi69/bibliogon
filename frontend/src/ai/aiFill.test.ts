import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage", () => ({ getStorage: vi.fn() }));
vi.mock("./llmClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llmClient")>();
  return {
    ...actual,
    aiChat: vi.fn(),
    getAiConfig: vi.fn(),
    isAiConfigured: vi.fn(),
  };
});

import { getStorage } from "../storage";
import { aiChat, getAiConfig, isAiConfigured } from "./llmClient";
import { aiFillArticle, aiFillBook } from "./aiFill";

const mockGetStorage = vi.mocked(getStorage);
const mockAiChat = vi.mocked(aiChat);
const mockGetAiConfig = vi.mocked(getAiConfig);
const mockIsConfigured = vi.mocked(isAiConfigured);

function chat(content: string, tokens = 10) {
  return { content, model: "test", usage: { total_tokens: tokens } };
}

const BODY_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Body text" }] }],
});

interface FakeStorage {
  articleUpdate: ReturnType<typeof vi.fn>;
  bookUpdate: ReturnType<typeof vi.fn>;
}

function setupStorage(opts: {
  article?: Record<string, unknown>;
  book?: Record<string, unknown>;
}): FakeStorage {
  const articleUpdate = vi.fn().mockResolvedValue({});
  const bookUpdate = vi.fn().mockResolvedValue({});
  mockGetStorage.mockReturnValue({
    articles: {
      get: vi.fn().mockResolvedValue(opts.article),
      update: articleUpdate,
    },
    books: {
      get: vi.fn().mockResolvedValue(opts.book),
      update: bookUpdate,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { articleUpdate, bookUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAiConfig.mockResolvedValue({
    provider: "openai",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o",
    api_key: "sk-test",
  });
  mockIsConfigured.mockReturnValue(true);
});

describe("aiFillArticle", () => {
  it("fills an empty field and persists the updated column", async () => {
    const storage = setupStorage({
      article: { id: "a1", title: "T", language: "de", content_json: BODY_DOC, topic: null },
    });
    mockAiChat.mockResolvedValue(chat('{"topic": "Media Literacy"}', 12));

    const res = await aiFillArticle("a1", { field_classes: ["topic"] });

    expect(res.updated_fields).toEqual(["topic"]);
    expect(res.skipped_fields).toEqual([]);
    expect(res.tokens_used).toBe(12);
    expect(res.field_class_errors).toEqual({});
    expect(storage.articleUpdate).toHaveBeenCalledWith("a1", { topic: "Media Literacy" });
  });

  it("skips a populated field when force is false and does not persist", async () => {
    const storage = setupStorage({
      article: { id: "a1", title: "T", language: "de", content_json: BODY_DOC, topic: "Existing" },
    });
    mockAiChat.mockResolvedValue(chat('{"topic": "New"}'));

    const res = await aiFillArticle("a1", { field_classes: ["topic"], force: false });

    expect(res.updated_fields).toEqual([]);
    expect(res.skip_reasons).toEqual({ topic: "field-already-populated" });
    expect(storage.articleUpdate).not.toHaveBeenCalled();
  });

  it("overwrites a populated field when force is true", async () => {
    const storage = setupStorage({
      article: { id: "a1", title: "T", language: "de", content_json: BODY_DOC, topic: "Existing" },
    });
    mockAiChat.mockResolvedValue(chat('{"topic": "New"}'));

    const res = await aiFillArticle("a1", { field_classes: ["topic"], force: true });

    expect(res.updated_fields).toEqual(["topic"]);
    expect(storage.articleUpdate).toHaveBeenCalledWith("a1", { topic: "New" });
  });

  it("isolates a per-class provider error and proceeds with other classes", async () => {
    const storage = setupStorage({
      article: {
        id: "a1",
        title: "T",
        language: "de",
        content_json: BODY_DOC,
        topic: null,
        excerpt: null,
      },
    });
    mockAiChat
      .mockRejectedValueOnce(new Error("provider 429"))
      .mockResolvedValueOnce(chat('{"excerpt": "An excerpt"}', 8));

    const res = await aiFillArticle("a1", { field_classes: ["topic", "excerpt"] });

    expect(res.field_class_errors).toEqual({ topic: "provider 429" });
    expect(res.updated_fields).toEqual(["excerpt"]);
    expect(res.tokens_used).toBe(8);
    expect(storage.articleUpdate).toHaveBeenCalledWith("a1", { excerpt: "An excerpt" });
  });

  it("throws when the article has no body content", async () => {
    setupStorage({ article: { id: "a1", title: "T", language: "de", content_json: null } });
    await expect(aiFillArticle("a1", { field_classes: ["topic"] })).rejects.toThrow(
      "no content",
    );
  });

  it("throws when AI is not configured", async () => {
    setupStorage({ article: { id: "a1" } });
    mockIsConfigured.mockReturnValue(false);
    await expect(aiFillArticle("a1", { field_classes: ["topic"] })).rejects.toThrow(
      "not configured",
    );
  });

  it("throws on an unknown field-class", async () => {
    setupStorage({ article: { id: "a1" } });
    await expect(
      aiFillArticle("a1", { field_classes: ["nonsense"] }),
    ).rejects.toThrow("Unknown field_classes");
  });

  it("fills the image prompts, hero and inline list together (#1077)", async () => {
    const storage = setupStorage({
      article: {
        id: "a1",
        title: "T",
        language: "de",
        content_json: BODY_DOC,
        featured_image_prompt: null,
        inline_image_prompts: [],
      },
    });
    mockAiChat.mockResolvedValue(
      chat(
        '{"featured_image_prompt": "A cat on a roof, no text in image",' +
          ' "inline_image_prompts": [{"section_hint": "Intro", "prompt": "Rooftops"}]}',
      ),
    );

    const res = await aiFillArticle("a1", { field_classes: ["image_prompts"] });

    expect(res.updated_fields).toEqual([
      "featured_image_prompt",
      "inline_image_prompts",
    ]);
    expect(storage.articleUpdate).toHaveBeenCalledWith("a1", {
      featured_image_prompt: "A cat on a roof, no text in image",
      inline_image_prompts: [{ section_hint: "Intro", prompt: "Rooftops" }],
    });
  });
});

describe("aiFillBook", () => {
  it("aggregates chapter body, fills marketing copy, and persists", async () => {
    const storage = setupStorage({
      book: {
        id: "b1",
        title: "Book",
        language: "en",
        backpage_description: null,
        backpage_author_bio: null,
        html_description: null,
        chapters: [{ id: "c1", content: BODY_DOC }],
      },
    });
    mockAiChat.mockResolvedValue(
      chat(
        '{"backpage_description": "Blurb", "backpage_author_bio": "Bio", "html_description": "<p>HTML</p>"}',
        30,
      ),
    );

    const res = await aiFillBook("b1", { field_classes: ["marketing_copy"] });

    expect(res.book_id).toBe("b1");
    expect(res.updated_fields).toEqual([
      "backpage_description",
      "backpage_author_bio",
      "html_description",
    ]);
    expect(res.dropped_chapter_summaries).toEqual([]);
    expect(storage.bookUpdate).toHaveBeenCalledWith("b1", {
      backpage_description: "Blurb",
      backpage_author_bio: "Bio",
      html_description: "<p>HTML</p>",
    });
  });

  it("throws on an unknown book field-class", async () => {
    setupStorage({ book: { id: "b1", chapters: [] } });
    await expect(aiFillBook("b1", { field_classes: ["nonsense"] })).rejects.toThrow(
      "Unknown field_classes",
    );
  });

  it("fills the cover prompt (#1077)", async () => {
    const storage = setupStorage({
      book: {
        id: "b1",
        title: "T",
        language: "de",
        cover_image_prompt: null,
        chapters: [{ id: "c1", title: "Eins", content: BODY_DOC }],
      },
    });
    mockAiChat.mockResolvedValue(chat('{"cover_image_prompt": "A hand-drawn map"}'));

    const res = await aiFillBook("b1", { field_classes: ["cover_prompt"] });

    expect(res.updated_fields).toEqual(["cover_image_prompt"]);
    expect(storage.bookUpdate).toHaveBeenCalledWith("b1", {
      cover_image_prompt: "A hand-drawn map",
    });
  });

  it("matches each chapter summary to a chapter before writing it (#1077)", async () => {
    const storage = setupStorage({
      book: {
        id: "b1",
        title: "T",
        language: "de",
        chapter_summaries: [],
        chapters: [
          { id: "c1", title: "Erstes Kapitel", content: BODY_DOC },
          { id: "c2", title: "Zweites Kapitel", content: BODY_DOC },
        ],
      },
    });
    mockAiChat.mockResolvedValue(
      chat(
        '{"chapter_summaries": [' +
          '{"chapter_id": "c1", "title": "egal", "summary": "Eins."},' +
          '{"title": "  zweites   KAPITEL ", "summary": "Zwei."},' +
          '{"chapter_id": "erfunden", "title": "Gibt es nicht", "summary": "Drei."}' +
          "]}",
      ),
    );

    const res = await aiFillBook("b1", { field_classes: ["chapter_summaries"] });

    // Matched by id, matched by a loosely-spelled title, and matched by
    // nothing - the third is reported rather than written, so a summary
    // can never name a chapter that does not exist.
    expect(storage.bookUpdate).toHaveBeenCalledWith("b1", {
      chapter_summaries: [
        { chapter_id: "c1", title: "Erstes Kapitel", summary: "Eins." },
        { chapter_id: "c2", title: "Zweites Kapitel", summary: "Zwei." },
      ],
    });
    expect(res.dropped_chapter_summaries).toEqual([
      { reason: "no-matching-chapter", chapter_id: "erfunden", title: "Gibt es nicht" },
    ]);
  });

  it("skips chapter_summaries when every entry matched nothing", async () => {
    const storage = setupStorage({
      book: {
        id: "b1",
        title: "T",
        language: "de",
        chapter_summaries: [],
        chapters: [{ id: "c1", title: "Eins", content: BODY_DOC }],
      },
    });
    mockAiChat.mockResolvedValue(
      chat('{"chapter_summaries": [{"chapter_id": "x", "summary": "Nope."}]}'),
    );

    const res = await aiFillBook("b1", { field_classes: ["chapter_summaries"] });

    expect(res.updated_fields).toEqual([]);
    // Nothing survived the match, so nothing is written - an empty list
    // would otherwise overwrite whatever the book already had.
    expect(storage.bookUpdate).not.toHaveBeenCalled();
    expect(res.dropped_chapter_summaries).toHaveLength(1);
  });
});
