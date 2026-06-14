import { describe, expect, it } from "vitest";
import {
  computeTierTextStyles,
  hexToRgb,
  isMultiImageLayout,
  readBubbleConfig,
  speechBubbleInlineStyle,
} from "./pageLayoutStyles";

describe("hexToRgb", () => {
  it("parses #rrggbb and bare rrggbb", () => {
    expect(hexToRgb("#ff8040")).toEqual({ r: 255, g: 128, b: 64 });
    expect(hexToRgb("ff8040")).toEqual({ r: 255, g: 128, b: 64 });
  });

  it("returns null for unrecognised shapes", () => {
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("nope")).toBeNull();
    expect(hexToRgb(42)).toBeNull();
    expect(hexToRgb(null)).toBeNull();
  });
});

describe("readBubbleConfig", () => {
  it("returns {} for nullish config", () => {
    expect(readBubbleConfig(null)).toEqual({});
    expect(readBubbleConfig(undefined)).toEqual({});
  });

  it("prefers bubbles[0] over flat keys", () => {
    const merged = readBubbleConfig({
      anchor_position: "top-left",
      bubbles: [{ anchor_position: "center", opacity: 0.5 }],
    });
    expect(merged.anchor_position).toBe("center");
    expect(merged.opacity).toBe(0.5);
  });
});

describe("computeTierTextStyles", () => {
  it("returns {} for nullish namespace", () => {
    expect(computeTierTextStyles(null)).toEqual({});
    expect(computeTierTextStyles(undefined)).toEqual({});
  });

  it("gates border on width > 0 and a real style", () => {
    expect(computeTierTextStyles({ border_width: 0, border_style: "solid" }))
      .not.toHaveProperty("border");
    const styled = computeTierTextStyles({
      border_width: 3,
      border_style: "dashed",
      border_color: "#000000",
    });
    expect(styled.border).toBe("3px dashed rgb(0, 0, 0)");
  });

  it("maps typography fields", () => {
    const styled = computeTierTextStyles({
      font_size: 18,
      font_weight: "bold",
      text_align: "center",
    });
    expect(styled.fontSize).toBe("18pt");
    expect(styled.fontWeight).toBe("bold");
    expect(styled.textAlign).toBe("center");
  });
});

describe("speechBubbleInlineStyle", () => {
  it("defaults to bottom-center with full opacity", () => {
    const style = speechBubbleInlineStyle(null);
    expect(style.bottom).toBe(16);
    expect(style.left).toBe("50%");
    expect(style.transform).toBe("translateX(-50%)");
    expect(style.background).toBe("rgba(255, 255, 255, 1)");
  });

  it("clamps opacity into [0.3, 1]", () => {
    expect(speechBubbleInlineStyle({ opacity: 5 }).background).toContain(", 1)");
    expect(speechBubbleInlineStyle({ opacity: 0 }).background).toContain(
      ", 0.3)",
    );
  });

  it("honours an explicit anchor preset", () => {
    const style = speechBubbleInlineStyle({ anchor_position: "top-left" });
    expect(style.top).toBe(16);
    expect(style.left).toBe(16);
    expect(style.transform).toBe("none");
  });
});

describe("isMultiImageLayout", () => {
  it("recognises the multi-image layouts", () => {
    expect(isMultiImageLayout("two_images_text_center")).toBe(true);
    expect(isMultiImageLayout("split_horizontal")).toBe(true);
    expect(isMultiImageLayout("split_vertical")).toBe(true);
  });

  it("returns false for single-image layouts", () => {
    expect(isMultiImageLayout("speech_bubble")).toBe(false);
    expect(isMultiImageLayout("image_top_text_bottom")).toBe(false);
  });
});
