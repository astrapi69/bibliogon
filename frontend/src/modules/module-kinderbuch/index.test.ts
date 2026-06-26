/**
 * module-kinderbuch seam tests (Maximal Offline, #34).
 *
 * Picture-book layout/text helpers are pure browser code; this pins them
 * through the plugin-parity barrel (`modules/module-kinderbuch`) so the
 * offline picture-book surface keeps working without the backend. CRUD goes
 * through the storage seam (covered elsewhere); here we cover the pure
 * layout-style + text-content helpers the barrel re-exports.
 */

import { describe, it, expect } from "vitest";

import {
  isMultiImageLayout,
  isTipTapLayout,
  hexToRgb,
  computeTierTextStyles,
  serializeJsonToText,
  parseTextContentToJson,
  extractPlainText,
} from "./index";

describe("module-kinderbuch barrel — layout helpers", () => {
  it("distinguishes multi-image from single-image layouts", () => {
    expect(isMultiImageLayout("split_vertical")).toBe(true);
    expect(isMultiImageLayout("two_images_text_center")).toBe(true);
    expect(isMultiImageLayout("image_top_text_bottom")).toBe(false);
  });

  it("classifies TipTap-text layouts as a boolean", () => {
    expect(typeof isTipTapLayout("text_only")).toBe("boolean");
    expect(typeof isTipTapLayout("image_full_text_overlay")).toBe("boolean");
  });

  it("parses 6-digit hex and rejects garbage", () => {
    expect(hexToRgb("#112233")).toEqual({ r: 0x11, g: 0x22, b: 0x33 });
    expect(hexToRgb("not-a-color")).toBeNull();
    expect(hexToRgb(42)).toBeNull();
  });

  it("derives a border only for a positive width + non-none style", () => {
    const styled = computeTierTextStyles({
      border_width: 2,
      border_style: "solid",
      border_color: "#ff0000",
    });
    expect(styled.border).toBe("2px solid rgb(255, 0, 0)");
    expect(computeTierTextStyles(null)).toEqual({});
    expect(computeTierTextStyles({ border_width: 0, border_style: "solid" }).border).toBeUndefined();
  });
});

describe("module-kinderbuch barrel — text-content helpers", () => {
  it("round-trips a TipTap doc through serialize → parse", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo" }] }] };
    const serialized = serializeJsonToText(doc);
    expect(typeof serialized).toBe("string");
    const parsed = parseTextContentToJson(serialized);
    expect(parsed?.type).toBe("doc");
  });

  it("wraps legacy plain text and extracts it back", () => {
    const parsed = parseTextContentToJson("legacy plain line");
    expect(parsed?.type).toBe("doc");
    expect(extractPlainText("legacy plain line")).toContain("legacy plain line");
    expect(parseTextContentToJson("")).toBeNull();
  });
});
