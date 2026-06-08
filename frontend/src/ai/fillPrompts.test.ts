import { describe, it, expect } from "vitest";
import {
  ARTICLE_FILL_CLASSES,
  ARTICLE_OFFLINE_FILL_CLASSES,
  type ArticlePromptInput,
} from "./articleFillPrompts";
import {
  BOOK_FILL_CLASSES,
  BOOK_OFFLINE_FILL_CLASSES,
  type BookPromptInput,
} from "./bookFillPrompts";

const ARTICLE: ArticlePromptInput = {
  title: "Fake News",
  subtitle: "A subtitle",
  topic: "Media",
  author: "Jane Doe",
  language: "de",
};

const BOOK: BookPromptInput = {
  title: "The Last Cartographer",
  subtitle: "A Guide",
  author: "Marta Rivers",
  genre: "Non-Fiction",
  series: "Maps",
  language: "en",
};

describe("article fill registry", () => {
  it("exposes exactly the offline-supported classes", () => {
    expect(ARTICLE_OFFLINE_FILL_CLASSES).toEqual(["seo", "tags", "topic", "excerpt"]);
    expect(ARTICLE_FILL_CLASSES).not.toHaveProperty("image_prompts");
  });

  it("maps seo to two scalar targets and tags to one list target", () => {
    expect(ARTICLE_FILL_CLASSES.seo.targets).toEqual([
      { aiKey: "seo_title", column: "seo_title", isList: false },
      { aiKey: "seo_description", column: "seo_description", isList: false },
    ]);
    expect(ARTICLE_FILL_CLASSES.tags.targets).toEqual([
      { aiKey: "tags", column: "tags", isList: true },
    ]);
  });

  it("builds a system+user message pair with the language and JSON rule", () => {
    const msgs = ARTICLE_FILL_CLASSES.seo.buildMessages(ARTICLE, "Body text here");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("JSON object ONLY");
    expect(msgs[0].content).toContain("article's language: de");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("Article title: Fake News");
    expect(msgs[1].content).toContain("Subtitle: A subtitle");
    expect(msgs[1].content).toContain("Body text here");
    expect(msgs[1].content).toContain('"seo_title"');
  });

  it("omits empty optional header fields", () => {
    const minimal: ArticlePromptInput = { title: "T", language: "en" };
    const user = ARTICLE_FILL_CLASSES.topic.buildMessages(minimal, "x")[1].content;
    expect(user).toContain("Article title: T");
    expect(user).not.toContain("Subtitle:");
    expect(user).not.toContain("Topic:");
    expect(user).not.toContain("Author:");
  });

  it("clamps the body excerpt to 1500 chars", () => {
    const longBody = "x".repeat(3000);
    const user = ARTICLE_FILL_CLASSES.excerpt.buildMessages(ARTICLE, longBody)[1].content;
    expect(user).toContain("x".repeat(1500));
    expect(user).not.toContain("x".repeat(1501));
  });
});

describe("book fill registry", () => {
  it("exposes exactly the offline-supported classes", () => {
    expect(BOOK_OFFLINE_FILL_CLASSES).toEqual([
      "marketing_copy",
      "tags",
      "description_genre",
    ]);
    expect(BOOK_FILL_CLASSES).not.toHaveProperty("cover_prompt");
    expect(BOOK_FILL_CLASSES).not.toHaveProperty("chapter_summaries");
  });

  it("maps marketing_copy to three scalar targets and tags to the keywords list", () => {
    expect(BOOK_FILL_CLASSES.marketing_copy.targets.map((t) => t.column)).toEqual([
      "backpage_description",
      "backpage_author_bio",
      "html_description",
    ]);
    expect(BOOK_FILL_CLASSES.tags.targets).toEqual([
      { aiKey: "keywords", column: "keywords", isList: true },
    ]);
  });

  it("builds a system+user pair with the book language and header", () => {
    const msgs = BOOK_FILL_CLASSES.description_genre.buildMessages(BOOK, "Chapter body");
    expect(msgs[0].content).toContain("book's language: en");
    expect(msgs[1].content).toContain("Book title: The Last Cartographer");
    expect(msgs[1].content).toContain("Genre: Non-Fiction");
    expect(msgs[1].content).toContain("Chapter body");
    expect(msgs[1].content).toContain('"description"');
    expect(msgs[1].content).toContain('"genre"');
  });
});
