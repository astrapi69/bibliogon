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
  it("exposes every class the backend has, image_prompts included (#1077)", () => {
    // `image_prompts` was absent while its two columns were missing from
    // the frontend shape and no PATCH accepted them; #1076 fixed both.
    expect(ARTICLE_OFFLINE_FILL_CLASSES).toEqual([
      "seo",
      "tags",
      "topic",
      "excerpt",
      "image_prompts",
    ]);
  });

  it("maps image_prompts to the hero column and the inline list", () => {
    expect(ARTICLE_FILL_CLASSES.image_prompts.targets).toEqual([
      {
        aiKey: "featured_image_prompt",
        column: "featured_image_prompt",
        isList: false,
      },
      {
        aiKey: "inline_image_prompts",
        column: "inline_image_prompts",
        isList: true,
      },
    ]);
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
  it("exposes every class the backend has, including the two deferred ones (#1077)", () => {
    // `cover_prompt` waited on its column being writable (#1076) and
    // `chapter_summaries` on a browser chapter-reconcile, which the
    // `.biblio.yaml` round-trip ported (#745).
    expect(BOOK_OFFLINE_FILL_CLASSES).toEqual([
      "marketing_copy",
      "tags",
      "cover_prompt",
      "chapter_summaries",
      "description_genre",
    ]);
  });

  it("flags chapter_summaries as the class that reconciles before writing", () => {
    expect(BOOK_FILL_CLASSES.chapter_summaries.isChapterSummaries).toBe(true);
    expect(BOOK_FILL_CLASSES.chapter_summaries.targets).toEqual([
      { aiKey: "chapter_summaries", column: "chapter_summaries", isList: true },
    ]);
    // The other classes must NOT carry the flag: it routes the value
    // through a chapter match, which would drop anything else.
    expect(BOOK_FILL_CLASSES.cover_prompt.isChapterSummaries).toBeUndefined();
    expect(BOOK_FILL_CLASSES.marketing_copy.isChapterSummaries).toBeUndefined();
  });

  it("maps cover_prompt to the cover column", () => {
    expect(BOOK_FILL_CLASSES.cover_prompt.targets).toEqual([
      { aiKey: "cover_image_prompt", column: "cover_image_prompt", isList: false },
    ]);
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
