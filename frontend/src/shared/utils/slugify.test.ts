import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Mein Erstes Buch")).toBe("mein-erstes-buch");
  });

  it("keeps German umlauts and eszett", () => {
    expect(slugify("Über uns")).toBe("über-uns");
    expect(slugify("Straße")).toBe("straße");
    expect(slugify("Ähnlich Öde Übung")).toBe("ähnlich-öde-übung");
  });

  it("strips characters outside [a-z0-9-] and the kept umlauts", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("a@b#c")).toBe("abc");
  });

  it("keeps digits and existing hyphens", () => {
    expect(slugify("Band 2 - Teil 3")).toBe("band-2-teil-3");
  });

  it("collapses repeated spaces and hyphens", () => {
    expect(slugify("a    b")).toBe("a-b");
    expect(slugify("a---b")).toBe("a-b");
    expect(slugify("  Straße   2  ")).toBe("straße-2");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
    expect(slugify("-x-")).toBe("x");
  });

  it("returns empty string for degenerate input so the caller can fall back", () => {
    expect(slugify("")).toBe("");
    expect(slugify("***")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});
