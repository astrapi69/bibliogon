import {describe, it, expect} from "vitest"
import {reviewString, NON_PROSE_CHAPTER_TYPES} from "./ai-review-strings"

describe("reviewString", () => {
  it("returns German text for 'de'", () => {
    expect(reviewString("de", "status_preparing")).toMatch(/Review/)
  })

  it("returns English text for 'en'", () => {
    expect(reviewString("en", "status_preparing")).toBe("Preparing review...")
  })

  it("covers all 8 supported Bibliogon UI languages", () => {
    for (const lang of ["de", "en", "es", "fr", "el", "pt", "tr", "ja"]) {
      expect(reviewString(lang, "non_prose_warning").length).toBeGreaterThan(0)
      expect(reviewString(lang, "status_preparing").length).toBeGreaterThan(0)
      expect(reviewString(lang, "status_analyzing").length).toBeGreaterThan(0)
      expect(reviewString(lang, "status_generating").length).toBeGreaterThan(0)
    }
  })

  it("falls back to English for unknown language codes", () => {
    expect(reviewString("xx", "status_preparing")).toBe("Preparing review...")
  })
})

describe("NON_PROSE_CHAPTER_TYPES", () => {
  it("includes the KDP front-matter non-prose types", () => {
    for (const expected of ["title_page", "copyright", "toc", "imprint", "index"]) {
      expect(NON_PROSE_CHAPTER_TYPES.has(expected)).toBe(true)
    }
  })

  it("includes the KDP back-matter non-prose types", () => {
    for (const expected of [
      "half_title",
      "also_by_author",
      "next_in_series",
      "call_to_action",
      "endnotes",
      "bibliography",
      "glossary",
    ]) {
      expect(NON_PROSE_CHAPTER_TYPES.has(expected)).toBe(true)
    }
  })

  it("excludes prose chapter types", () => {
    for (const prose of ["chapter", "preface", "epilogue", "prologue", "introduction"]) {
      expect(NON_PROSE_CHAPTER_TYPES.has(prose)).toBe(false)
    }
  })

  it("matches backend count (12 non-prose types)", () => {
    expect(NON_PROSE_CHAPTER_TYPES.size).toBe(12)
  })
})
