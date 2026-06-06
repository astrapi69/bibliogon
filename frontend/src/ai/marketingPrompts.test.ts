/**
 * Marketing-prompt builder tests (#34 P4 AI-via-user-key C1).
 */

import { describe, it, expect } from "vitest";

import type { AiGenerateMarketingRequest } from "../api/client";
import { buildMarketingMessages, MARKETING_FIELDS } from "./marketingPrompts";

const req = (over: Partial<AiGenerateMarketingRequest>): AiGenerateMarketingRequest => ({
  field: "backpage_description",
  book_title: "The Book",
  author: "Jane",
  genre: "Fantasy",
  language: "de",
  description: "A quest.",
  chapter_titles: ["One", "Two"],
  existing_text: "",
  book_id: "b1",
  ...over,
});

describe("buildMarketingMessages", () => {
  it("substitutes the language name into the system prompt", () => {
    const [system] = buildMarketingMessages(req({ language: "de" }));
    expect(system.role).toBe("system");
    expect(system.content).toContain("Write in German.");
  });

  it("packs the book context into the user message", () => {
    const [, user] = buildMarketingMessages(req({}));
    expect(user.role).toBe("user");
    expect(user.content).toContain("Title: The Book");
    expect(user.content).toContain("Author: Jane");
    expect(user.content).toContain("Genre: Fantasy");
    expect(user.content).toContain("Description: A quest.");
    expect(user.content).toContain("Chapter titles: One, Two");
  });

  it("includes existing text to improve when present", () => {
    const [, user] = buildMarketingMessages(req({ existing_text: "old blurb" }));
    expect(user.content).toContain("Current text to improve:\nold blurb");
  });

  it("covers all four fields with distinct system prompts", () => {
    expect(MARKETING_FIELDS).toEqual([
      "html_description",
      "backpage_description",
      "backpage_author_bio",
      "keywords",
    ]);
    const systems = MARKETING_FIELDS.map(
      (field) => buildMarketingMessages(req({ field }))[0].content,
    );
    expect(new Set(systems).size).toBe(4);
  });

  it("throws on an unknown field", () => {
    expect(() => buildMarketingMessages(req({ field: "nope" }))).toThrow(/Unknown/);
  });
});
