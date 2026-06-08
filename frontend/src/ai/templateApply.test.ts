import { describe, it, expect } from "vitest";
import {
  APPLY_SKIP_EMPTY,
  APPLY_SKIP_POPULATED,
  APPLY_UPDATED,
  applyField,
  extractBodyText,
  isColumnPopulated,
  isTemplateValueEmpty,
  parseAiObject,
  type EntityRecord,
} from "./templateApply";

describe("extractBodyText", () => {
  it("returns empty string for null/empty/invalid JSON", () => {
    expect(extractBodyText(null)).toBe("");
    expect(extractBodyText(undefined)).toBe("");
    expect(extractBodyText("")).toBe("");
    expect(extractBodyText("not json")).toBe("");
  });

  it("concatenates nested text nodes joined by newlines", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      ],
    });
    expect(extractBodyText(doc)).toBe("Title\nHello \nworld");
  });

  it("ignores nodes without a string text and trims", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "x.png" } },
        { type: "paragraph", content: [{ type: "text", text: "  body  " }] },
      ],
    });
    expect(extractBodyText(doc)).toBe("body");
  });
});

describe("isTemplateValueEmpty", () => {
  it("treats null, undefined, blank string, empty array as empty", () => {
    expect(isTemplateValueEmpty(null)).toBe(true);
    expect(isTemplateValueEmpty(undefined)).toBe(true);
    expect(isTemplateValueEmpty("")).toBe(true);
    expect(isTemplateValueEmpty("   ")).toBe(true);
    expect(isTemplateValueEmpty([])).toBe(true);
  });

  it("treats non-blank string, non-empty array, numbers as non-empty", () => {
    expect(isTemplateValueEmpty("x")).toBe(false);
    expect(isTemplateValueEmpty(["a"])).toBe(false);
    expect(isTemplateValueEmpty(0)).toBe(false);
    expect(isTemplateValueEmpty(false)).toBe(false);
  });
});

describe("isColumnPopulated", () => {
  it("list columns: populated only when a non-empty array", () => {
    expect(isColumnPopulated(["a"], true)).toBe(true);
    expect(isColumnPopulated([], true)).toBe(false);
    expect(isColumnPopulated(null, true)).toBe(false);
    expect(isColumnPopulated("nope", true)).toBe(false);
  });

  it("scalar columns: populated when a non-blank string or truthy value", () => {
    expect(isColumnPopulated("hello", false)).toBe(true);
    expect(isColumnPopulated("  ", false)).toBe(false);
    expect(isColumnPopulated(null, false)).toBe(false);
    expect(isColumnPopulated(undefined, false)).toBe(false);
  });
});

describe("applyField", () => {
  it("skips empty new values regardless of force", () => {
    const record: EntityRecord = { topic: "old" };
    expect(applyField(record, "topic", null, { force: true, isList: false })).toBe(
      APPLY_SKIP_EMPTY,
    );
    expect(applyField(record, "topic", "  ", { force: true, isList: false })).toBe(
      APPLY_SKIP_EMPTY,
    );
    expect(applyField(record, "tags", [], { force: true, isList: true })).toBe(
      APPLY_SKIP_EMPTY,
    );
    expect(record.topic).toBe("old");
  });

  it("skips populated columns when force is false", () => {
    const record: EntityRecord = { topic: "existing", tags: ["a"] };
    expect(applyField(record, "topic", "new", { force: false, isList: false })).toBe(
      APPLY_SKIP_POPULATED,
    );
    expect(applyField(record, "tags", ["b"], { force: false, isList: true })).toBe(
      APPLY_SKIP_POPULATED,
    );
    expect(record.topic).toBe("existing");
    expect(record.tags).toEqual(["a"]);
  });

  it("writes into empty columns even when force is false", () => {
    const record: EntityRecord = { topic: null, tags: [] };
    expect(applyField(record, "topic", "new", { force: false, isList: false })).toBe(
      APPLY_UPDATED,
    );
    expect(applyField(record, "tags", ["b"], { force: false, isList: true })).toBe(
      APPLY_UPDATED,
    );
    expect(record.topic).toBe("new");
    expect(record.tags).toEqual(["b"]);
  });

  it("overwrites populated columns when force is true and writes arrays directly", () => {
    const record: EntityRecord = { topic: "old", tags: ["a"] };
    expect(applyField(record, "topic", "new", { force: true, isList: false })).toBe(
      APPLY_UPDATED,
    );
    expect(applyField(record, "tags", ["b", "c"], { force: true, isList: true })).toBe(
      APPLY_UPDATED,
    );
    expect(record.topic).toBe("new");
    expect(record.tags).toEqual(["b", "c"]);
  });
});

describe("parseAiObject", () => {
  it("returns empty object for empty/garbage input", () => {
    expect(parseAiObject("")).toEqual({});
    expect(parseAiObject("not json at all")).toEqual({});
  });

  it("parses a bare JSON object", () => {
    expect(parseAiObject('{"seo_title": "T", "seo_description": "D"}')).toEqual({
      seo_title: "T",
      seo_description: "D",
    });
  });

  it("strips a ```json code fence", () => {
    const fenced = '```json\n{"topic": "Media"}\n```';
    expect(parseAiObject(fenced)).toEqual({ topic: "Media" });
  });

  it("strips a bare ``` code fence", () => {
    const fenced = '```\n{"excerpt": "E"}\n```';
    expect(parseAiObject(fenced)).toEqual({ excerpt: "E" });
  });

  it("slices the object out of surrounding prose", () => {
    const wrapped = 'Here is your YAML:\n{"tags": ["a", "b"]}\nHope that helps!';
    expect(parseAiObject(wrapped)).toEqual({ tags: ["a", "b"] });
  });

  it("returns empty object when the JSON is a non-object (array/scalar)", () => {
    expect(parseAiObject('["a", "b"]')).toEqual({});
    expect(parseAiObject('"just a string"')).toEqual({});
    expect(parseAiObject("42")).toEqual({});
  });
});
