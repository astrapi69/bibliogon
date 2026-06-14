import { describe, expect, it } from "vitest";
import type { Chapter } from "../../api/client";
import {
  BACK_MATTER_TYPES,
  FRONT_MATTER_TYPES,
  groupChapters,
} from "./chapterGroups";

function ch(id: string, chapter_type: Chapter["chapter_type"]): Chapter {
  return {
    id,
    chapter_type,
    title: id,
    content: "{}",
    position: 0,
  } as Chapter;
}

describe("groupChapters", () => {
  it("partitions chapters into front / main / back matter preserving order", () => {
    const chapters = [
      ch("toc", "toc"),
      ch("c1", "chapter"),
      ch("part1", "part"),
      ch("c2", "chapter"),
      ch("epi", "epilogue"),
      ch("pref", "preface"),
    ];
    const { frontMatter, mainChapters, backMatter } = groupChapters(chapters);
    expect(frontMatter.map((c) => c.id)).toEqual(["toc", "pref"]);
    expect(mainChapters.map((c) => c.id)).toEqual(["c1", "part1", "c2"]);
    expect(backMatter.map((c) => c.id)).toEqual(["epi"]);
  });

  it("returns empty groups for an empty input", () => {
    expect(groupChapters([])).toEqual({
      frontMatter: [],
      mainChapters: [],
      backMatter: [],
    });
  });

  it("keeps the matter-type sets disjoint", () => {
    for (const t of FRONT_MATTER_TYPES) {
      expect(BACK_MATTER_TYPES).not.toContain(t);
    }
  });
});
