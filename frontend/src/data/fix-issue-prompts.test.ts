/**
 * Tests for the fix-issue AI prompt templates and the sentence
 * expansion helper that feeds them.
 *
 * The prompt mapping is a static table; the test just pins that
 * every finding type the quality tab navigates to has a template.
 * The expansion helper is the interesting half - it turns a raw
 * offset+length finding into the enclosing sentence, so the AI
 * has enough context to rewrite meaningfully.
 */

import {describe, it, expect} from "vitest"
import {FIX_ISSUE_PROMPTS, findEnclosingSentence, FixIssueType} from "./fix-issue-prompts"

describe("FIX_ISSUE_PROMPTS", () => {
  it.each<FixIssueType>(["passive_voice", "adverb", "filler_word", "long_sentence"])(
    "defines a non-empty template for %s",
    (type) => {
      const template = FIX_ISSUE_PROMPTS[type]
      expect(template).toBeTypeOf("string")
      expect(template.length).toBeGreaterThan(40)
      expect(template.toLowerCase()).toContain("return only")
    },
  )

  it("passive_voice template mentions active voice", () => {
    expect(FIX_ISSUE_PROMPTS.passive_voice.toLowerCase()).toContain("active voice")
  })

  it("long_sentence template mentions split", () => {
    expect(FIX_ISSUE_PROMPTS.long_sentence.toLowerCase()).toContain("split")
  })
})

describe("findEnclosingSentence", () => {
  it("returns the sentence containing a mid-text finding", () => {
    const text = "First sentence. The quick brown fox jumps. Third sentence."
    const foxOffset = text.indexOf("fox")
    const {start, end} = findEnclosingSentence(text, foxOffset, 3)
    expect(text.slice(start, end)).toBe("The quick brown fox jumps.")
  })

  it("handles a finding at the very start of the text", () => {
    const text = "Passive was written here. Next sentence."
    const {start, end} = findEnclosingSentence(text, 0, 7) // "Passive"
    expect(text.slice(start, end)).toBe("Passive was written here.")
  })

  it("handles a finding spanning across whitespace after a period", () => {
    const text = "One. Two three four. Five."
    const twoOffset = text.indexOf("Two")
    const {start, end} = findEnclosingSentence(text, twoOffset, 3)
    expect(text.slice(start, end)).toBe("Two three four.")
  })

  it("returns the whole chapter when there are no terminators", () => {
    const text = "no terminator at all anywhere"
    const {start, end} = findEnclosingSentence(text, 5, 10)
    expect(start).toBe(0)
    expect(end).toBe(text.length)
  })

  it("handles ! and ? as sentence terminators", () => {
    const text = "Wait! Really? That is wild."
    const reallyOffset = text.indexOf("Really")
    const {start, end} = findEnclosingSentence(text, reallyOffset, 6)
    expect(text.slice(start, end)).toBe("Really?")
  })

  it("returns empty range for empty text", () => {
    expect(findEnclosingSentence("", 0, 0)).toEqual({start: 0, end: 0})
  })

  it("clamps offsets past the end of the text", () => {
    const text = "Short."
    const {start, end} = findEnclosingSentence(text, 999, 5)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeLessThanOrEqual(text.length)
  })

  it("treats newline as a sentence boundary", () => {
    const text = "Heading\nA passive was written here.\nAnother line."
    const passiveOffset = text.indexOf("passive")
    const {start, end} = findEnclosingSentence(text, passiveOffset, 7)
    expect(text.slice(start, end)).toBe("A passive was written here.")
  })
})
