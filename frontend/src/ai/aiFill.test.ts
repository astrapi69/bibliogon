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
      aiFillArticle("a1", { field_classes: ["image_prompts"] }),
    ).rejects.toThrow("Unknown field_classes");
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

  it("throws on an unknown book field-class (chapter_summaries deferred offline)", async () => {
    setupStorage({ book: { id: "b1", chapters: [] } });
    await expect(
      aiFillBook("b1", { field_classes: ["chapter_summaries"] }),
    ).rejects.toThrow("Unknown field_classes");
  });
});
