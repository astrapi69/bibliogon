import { describe, expect, it } from "vitest";
import {
  isTipTapLayout,
  parseTextContentToJson,
  serializeJsonToText,
} from "./pageTextContent";

describe("isTipTapLayout", () => {
  it("returns true for rich-text layouts", () => {
    expect(isTipTapLayout("image_top_text_bottom")).toBe(true);
    expect(isTipTapLayout("text_only")).toBe(true);
    expect(isTipTapLayout("image_right_text_left")).toBe(true);
  });

  it("returns false for non-rich-text layouts", () => {
    expect(isTipTapLayout("speech_bubble")).toBe(false);
    expect(isTipTapLayout("image_full_text_overlay")).toBe(false);
    expect(isTipTapLayout("image_full_no_text")).toBe(false);
  });
});

describe("parseTextContentToJson", () => {
  it("returns null for empty input", () => {
    expect(parseTextContentToJson(null)).toBeNull();
    expect(parseTextContentToJson(undefined)).toBeNull();
    expect(parseTextContentToJson("")).toBeNull();
  });

  it("wraps legacy plain text into a minimal doc", () => {
    expect(parseTextContentToJson("hello")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      ],
    });
  });

  it("returns a valid TipTap doc unchanged", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "rich" }] },
      ],
    };
    expect(parseTextContentToJson(JSON.stringify(doc))).toEqual(doc);
  });

  it("wraps non-doc JSON as plain text", () => {
    const raw = '{"foo": "bar"}';
    expect(parseTextContentToJson(raw)).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: raw }] }],
    });
  });
});

describe("serializeJsonToText", () => {
  it("returns null for null input", () => {
    expect(serializeJsonToText(null)).toBeNull();
  });

  it("round-trips through parseTextContentToJson", () => {
    const doc = parseTextContentToJson("round trip");
    const serialized = serializeJsonToText(doc);
    expect(serialized).not.toBeNull();
    expect(parseTextContentToJson(serialized)).toEqual(doc);
  });
});
