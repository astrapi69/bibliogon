/**
 * Prompt builders for AI-driven Story Bible + Storyboard extraction from a
 * book's existing chapter text (#374).
 *
 * Both builders return an {@link AiChatMessage} pair (a system message that
 * fixes the rules + a user message that carries the corpus + the exact JSON
 * shape the model must answer with). The same messages drive the online
 * backend path (`POST /api/ai/generate`) and the offline browser-direct path
 * (`aiChat`), so the prompt lives in one place regardless of mode — the same
 * "instructions travel with the request" portability the `.biblio.yaml`
 * template-fill feature established.
 */

import type { AiChatMessage } from "./llmClient";
import { STORY_BEATS } from "../components/story-bible/StoryboardAnnotations";

/** Map a Bibliogon language code to an English language name for the prompt.
 *  Mirrors `backend/app/ai/prompts.py::LANG_MAP`. Unknown codes pass through. */
const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  el: "Greek",
  pt: "Portuguese",
  tr: "Turkish",
  ja: "Japanese",
};

/** Resolve a language code to its English name for prompt instructions. */
export function languageName(code: string | null | undefined): string {
  if (!code) return "the book's language";
  return LANGUAGE_NAMES[code] ?? code;
}

/** A single chapter's plain-text payload handed to a prompt builder. */
export interface ChapterCorpusEntry {
  index: number;
  title: string;
  text: string;
}

function renderCorpus(chapters: ChapterCorpusEntry[]): string {
  return chapters
    .map(
      (chapter) =>
        `### Chapter ${chapter.index}: ${chapter.title || "(untitled)"}\n${chapter.text}`,
    )
    .join("\n\n");
}

/**
 * Build the Story Bible extraction messages. The model returns five arrays:
 * characters, locations, timeline, themes and relationships. Empty arrays are
 * valid (nothing found), so a thin book never forces a hallucinated entity.
 */
export function buildStoryBibleMessages(
  chapters: ChapterCorpusEntry[],
  language: string | null | undefined,
): AiChatMessage[] {
  const lang = languageName(language);
  const system =
    "You are a literary analysis assistant that extracts a Story Bible from a " +
    "manuscript. Respond with a SINGLE valid JSON object and nothing else — no " +
    "prose, no Markdown code fences, no comments. Use real UTF-8 characters. " +
    `Write every human-readable value (name, description) in ${lang}. Only ` +
    "report elements that genuinely appear in the text; never invent. When a " +
    "category has no entries, return an empty array for it.";
  const user = [
    "Analyse the following manuscript and extract its Story Bible.",
    "",
    "Return exactly this JSON shape:",
    "{",
    '  "characters": [{ "name": "", "description": "" }],',
    '  "locations": [{ "name": "", "description": "" }],',
    '  "timeline": [{ "event": "", "description": "" }],',
    '  "themes": [{ "name": "", "description": "" }],',
    '  "relationships": [{ "from": "", "to": "", "type": "", "description": "" }]',
    "}",
    "",
    "Rules:",
    "- characters: every named figure, with a 1-2 sentence description (role, traits).",
    "- locations: every distinct setting/place, with a short description.",
    "- timeline: the key events in chronological order; 'event' is a short label.",
    "- themes: recurring motifs/themes, with a short explanation.",
    "- relationships: how two named characters relate; 'from' and 'to' MUST be names",
    "  that also appear in 'characters'; 'type' MUST be one of:",
    "  ally, rival, family, mentor, romantic, neutral.",
    "",
    "Manuscript:",
    renderCorpus(chapters),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Build the Storyboard extraction messages. The model summarises each chapter
 * it is given and returns a per-chapter entry plus a global plot arc and
 * continuity notes. `beat` is constrained to the six Storyboard beats and
 * `mood_color` to a hex value so the result maps onto the Chapter annotation
 * columns without post-processing surprises.
 */
export function buildStoryboardMessages(
  chapters: ChapterCorpusEntry[],
  language: string | null | undefined,
): AiChatMessage[] {
  const lang = languageName(language);
  const beats = STORY_BEATS.join(", ");
  const system =
    "You are a story-structure assistant that builds a Storyboard from a " +
    "manuscript. Respond with a SINGLE valid JSON object and nothing else — no " +
    "prose, no Markdown code fences, no comments. Use real UTF-8 characters. " +
    `Write every human-readable value in ${lang}. Base every summary strictly ` +
    "on the supplied text; never invent plot.";
  const user = [
    "Analyse the following chapters and build a Storyboard.",
    "",
    "Return exactly this JSON shape:",
    "{",
    '  "chapters": [{ "index": 1, "summary": "", "beat": "", "mood_color": "" }],',
    '  "plot_arc": "",',
    '  "continuity_notes": [""]',
    "}",
    "",
    "Rules:",
    "- One 'chapters' entry per supplied chapter; 'index' MUST match the chapter number below.",
    "- summary: 2-3 sentences capturing what happens in that chapter.",
    `- beat: one of [${beats}], or omit it if none clearly fits.`,
    '- mood_color: a hex colour like "#4ECDC4" matching the chapter mood, or omit it.',
    "- plot_arc: 2-3 sentences on how the overall plot develops.",
    "- continuity_notes: open threads or contradictions; empty array if none.",
    "",
    "Chapters:",
    renderCorpus(chapters),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
