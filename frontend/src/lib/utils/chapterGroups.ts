import type { Chapter, ChapterType } from "../../api/client";

/**
 * Chapter front/back-matter grouping for the chapter sidebar.
 *
 * Extracted from `ChapterSidebar.tsx` (Batch 4 god-file burn-down). Pure,
 * framework-free: the type-membership arrays plus a `groupChapters` splitter.
 * App-bound (the `ChapterType` union), so this lives under `lib/utils/`.
 */

/** Chapter types rendered in the "Front Matter" section, in display order. */
export const FRONT_MATTER_TYPES: ChapterType[] = [
  "toc",
  "dedication",
  "epigraph",
  "preface",
  "foreword",
  "prologue",
  "introduction",
];

/** Chapter types rendered in the "Back Matter" section, in display order. */
export const BACK_MATTER_TYPES: ChapterType[] = [
  "epilogue",
  "afterword",
  "final_thoughts",
  "about_author",
  "acknowledgments",
  "appendix",
  "bibliography",
  "endnotes",
  "glossary",
  "index",
  "imprint",
  "also_by_author",
  "next_in_series",
  "excerpt",
  "call_to_action",
];

/** Structural chapter types that group with the main body. */
export const STRUCTURE_TYPES: ChapterType[] = [
  "part",
  "part_intro",
  "interlude",
];

export interface GroupedChapters {
  frontMatter: Chapter[];
  mainChapters: Chapter[];
  backMatter: Chapter[];
}

/**
 * Partition chapters into front-matter, main body, and back-matter groups
 * (preserving input order within each group).
 *
 * @example
 * ```ts
 * const { frontMatter, mainChapters, backMatter } = groupChapters(book.chapters);
 * ```
 */
export function groupChapters(chapters: Chapter[]): GroupedChapters {
  return {
    frontMatter: chapters.filter((ch) =>
      FRONT_MATTER_TYPES.includes(ch.chapter_type),
    ),
    mainChapters: chapters.filter(
      (ch) =>
        ch.chapter_type === "chapter" ||
        STRUCTURE_TYPES.includes(ch.chapter_type),
    ),
    backMatter: chapters.filter((ch) =>
      BACK_MATTER_TYPES.includes(ch.chapter_type),
    ),
  };
}
