import { describe, it, expect } from "vitest";
import {
  analyzeSentence,
  rankSentences,
  sentenceAnchor,
  stripHtml,
} from "./sentenceComplexity";

describe("analyzeSentence", () => {
  it("counts words by whitespace and commas as clauses", () => {
    const result = analyzeSentence("Er ging, weil er musste, nach Hause.");
    expect(result.wordCount).toBe(7);
    expect(result.clauseCount).toBe(2);
    expect(result.score).toBe(9);
  });

  it("returns zero for empty input", () => {
    const result = analyzeSentence("   ");
    expect(result.wordCount).toBe(0);
    expect(result.clauseCount).toBe(0);
    expect(result.score).toBe(0);
  });

  it("trims surrounding whitespace from the stored text", () => {
    expect(analyzeSentence("  hello world  ").text).toBe("hello world");
  });
});

describe("rankSentences", () => {
  it("orders by score descending and drops empties", () => {
    const ranked = rankSentences([
      "short one here",
      "",
      "this is a much longer sentence, with commas, that nests deeply indeed",
      "   ",
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].text).toContain("longer sentence");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("respects the limit", () => {
    const ranked = rankSentences(
      ["a b c", "a b c d", "a b c d e", "a b c d e f"],
      2,
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0].wordCount).toBe(6);
    expect(ranked[1].wordCount).toBe(5);
  });

  it("keeps input order for ties", () => {
    const ranked = rankSentences(["one two three", "four five six"]);
    expect(ranked[0].text).toBe("one two three");
    expect(ranked[1].text).toBe("four five six");
  });
});

describe("sentenceAnchor", () => {
  it("returns the whole sentence when short", () => {
    expect(sentenceAnchor("just three words")).toBe("just three words");
  });

  it("truncates with an ellipsis when longer than the word limit", () => {
    expect(sentenceAnchor("one two three four five six seven")).toBe(
      "one two three four five …",
    );
  });

  it("honors a custom word count", () => {
    expect(sentenceAnchor("alpha beta gamma delta", 2)).toBe("alpha beta …");
  });

  it("strips leaked HTML tags before building the anchor", () => {
    expect(
      sentenceAnchor("Dieses Buch stellt sie.</p> <h2>Was kommt jetzt", 5),
    ).toBe("Dieses Buch stellt sie. Was …");
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<h1>Kapitel 9: Das Muster</h1>  Text")).toBe(
      "Kapitel 9: Das Muster Text",
    );
  });

  it("decodes the common named entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;tag&gt;")).toBe("Tom & Jerry <tag>");
  });
});

describe("analyzeSentence with HTML", () => {
  it("counts words on the stripped text, not the markup", () => {
    const result = analyzeSentence("<p>Er ging</p> nach <em>Hause</em>");
    expect(result.text).toBe("Er ging nach Hause");
    expect(result.wordCount).toBe(4);
  });
});
