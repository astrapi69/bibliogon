import { describe, it, expect } from "vitest";

import { getTextStats } from "./textStats";

describe("getTextStats", () => {
  it("counts words, characters and characters without spaces", () => {
    const s = getTextStats("Hello world");
    expect(s.words).toBe(2);
    expect(s.characters).toBe(11);
    expect(s.charactersNoSpaces).toBe(10);
  });

  it("returns all zeros for empty / whitespace-only text", () => {
    const s = getTextStats("   \n\t ");
    expect(s.words).toBe(0);
    expect(s.readingTimeMinutes).toBe(0);
    expect(s.charactersNoSpaces).toBe(0);
  });

  it("collapses irregular whitespace when counting words", () => {
    expect(getTextStats("  a   b\n\nc  ").words).toBe(3);
  });

  it("estimates reading time at 250 wpm, rounded up", () => {
    expect(getTextStats(Array(250).fill("w").join(" ")).readingTimeMinutes).toBe(1);
    expect(getTextStats(Array(251).fill("w").join(" ")).readingTimeMinutes).toBe(2);
    expect(getTextStats(Array(500).fill("w").join(" ")).readingTimeMinutes).toBe(2);
  });
});
