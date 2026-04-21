/**
 * Prompt templates and selection helpers for the "fix issue" AI mode.
 *
 * Each template tells the LLM to rewrite a sentence so it no longer
 * triggers the matching style check. The model returns ONLY the
 * rewrite, which the editor drops back in at the expanded sentence
 * range.
 *
 * Kept in its own module so the mapping + sentence expansion are
 * unit-testable without mounting the editor.
 */

export type FixIssueType = "filler_word" | "passive_voice" | "adverb" | "long_sentence"

export const FIX_ISSUE_PROMPTS: Record<FixIssueType, string> = {
  passive_voice:
    "You are a professional editor. Rewrite the following sentence in active voice. " +
    "Preserve the original meaning, keep the sentence roughly the same length, and do not " +
    "add new information. Return only the rewritten sentence, no explanations, no quotes.",
  adverb:
    "You are a professional editor. Rewrite the following sentence and replace weak " +
    "adverb+verb pairs with a single stronger verb where possible. Do not add new " +
    "information. Return only the rewritten sentence, no explanations, no quotes.",
  filler_word:
    "You are a professional editor. Rewrite the following sentence and remove filler " +
    "words (e.g. actually, basically, really, just, eigentlich, sozusagen) without " +
    "changing the meaning. Return only the rewritten sentence, no explanations, no quotes.",
  long_sentence:
    "You are a professional editor. Split the following overly long sentence into two or " +
    "three shorter sentences. Preserve meaning, order, and tone. Return only the rewritten " +
    "sentences, no explanations, no quotes.",
}

/**
 * Given the plain text of a chapter and an issue offset+length, return
 * the [start, end) offsets of the enclosing sentence. A sentence ends
 * at `.!?` followed by whitespace or end-of-text; a sentence starts
 * right after the previous terminator (or text start).
 *
 * Pure function of strings; callers convert the plain-text range to
 * ProseMirror positions via the same walk StyleCheckExtension uses.
 */
export function findEnclosingSentence(
  plainText: string,
  issueOffset: number,
  issueLength: number,
): {start: number; end: number} {
  if (plainText.length === 0) return {start: 0, end: 0}
  const clampedOffset = Math.max(0, Math.min(issueOffset, plainText.length))
  const issueEnd = Math.max(clampedOffset, Math.min(issueOffset + issueLength, plainText.length))

  // Walk backwards for the sentence start
  let start = 0
  for (let i = clampedOffset - 1; i >= 0; i--) {
    const ch = plainText[i]
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      // Skip past the terminator and any following whitespace
      let j = i + 1
      while (j < plainText.length && /\s/.test(plainText[j])) j++
      start = j
      break
    }
  }

  // Walk forwards for the sentence end (exclusive)
  let end = plainText.length
  for (let i = issueEnd; i < plainText.length; i++) {
    const ch = plainText[i]
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      end = i + 1 // include the terminator
      break
    }
  }

  if (end <= start) return {start: clampedOffset, end: issueEnd}
  return {start, end}
}
