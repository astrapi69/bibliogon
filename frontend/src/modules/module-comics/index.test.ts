/**
 * module-comics seam tests (Maximal Offline, #34).
 *
 * Comic bubble/tail geometry is pure browser code; this pins it through the
 * plugin-parity barrel (`modules/module-comics`) so the offline comic-book
 * surface keeps rendering without the backend. Panel/bubble CRUD goes through
 * the storage seam (covered elsewhere); here we cover the pure path/geometry
 * helpers the barrel re-exports.
 */

import { describe, it, expect } from "vitest";

import {
  buildBubblePath,
  bubbleTypeClassName,
  computeVisibleTipPosition,
  deriveTailFromTip,
} from "./index";

describe("module-comics barrel — bubble path", () => {
  it("builds a non-empty path + viewBox for a speech bubble", () => {
    const out = buildBubblePath({
      shape: "speech",
      width: 120,
      height: 80,
      tailDirection: "S",
      tailPositionPct: 50,
      tailLengthPx: 20,
    });
    expect(out.d.length).toBeGreaterThan(0);
    expect(out.viewBox.split(/\s+/)).toHaveLength(4);
    expect(out.bubbleWidth).toBe(120);
    expect(out.bubbleHeight).toBe(80);
  });

  it("emits an empty path for a borderless sound_effect bubble", () => {
    const out = buildBubblePath({
      shape: "sound_effect",
      width: 100,
      height: 60,
      tailDirection: "none",
      tailPositionPct: 50,
      tailLengthPx: 0,
    });
    expect(out.d).toBe("");
  });

  it("ignores the tail direction for a narration box", () => {
    const withTail = buildBubblePath({
      shape: "narration",
      width: 100,
      height: 60,
      tailDirection: "S",
      tailPositionPct: 50,
      tailLengthPx: 20,
    });
    const noTail = buildBubblePath({
      shape: "narration",
      width: 100,
      height: 60,
      tailDirection: "none",
      tailPositionPct: 50,
      tailLengthPx: 0,
    });
    expect(withTail.d).toBe(noTail.d);
  });
});

describe("module-comics barrel — type styling + tail geometry", () => {
  it("returns a string class for any bubble type", () => {
    expect(typeof bubbleTypeClassName("speech")).toBe("string");
    expect(typeof bubbleTypeClassName("sound_effect")).toBe("string");
  });

  it("round-trips a tail tip back to a compass direction", () => {
    const tip = computeVisibleTipPosition("S", 50, 20, 120, 80);
    expect(tip).not.toBeNull();
    const derived = deriveTailFromTip(tip!.x, tip!.y, 120, 80);
    expect(typeof derived.direction).toBe("string");
    expect(derived.positionPct).toBeGreaterThanOrEqual(0);
    expect(derived.positionPct).toBeLessThanOrEqual(100);
  });
});
