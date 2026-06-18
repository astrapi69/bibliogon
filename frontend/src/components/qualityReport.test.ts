import {describe, it, expect} from "vitest"
import {
    buildQualityReportMarkdown,
    buildQualityReportPdfDefinition,
    numberChapters,
    type QualityReportLabels,
} from "./qualityReport"
import type {ChapterMetric, ChapterMetricsResponse} from "../api/client"
import {
    HEADER_FILL,
    RULE_COLOR,
    MUTED_COLOR,
    SEVERITY_FILL,
    FLESCH_BAND_FILL,
} from "./qualityThresholds"

const labels: QualityReportLabels = {
    title: "Qualitaetsbericht",
    chapters: "Kapitel",
    words: "Woerter",
    avgReadability: "Lesbarkeit",
    avgFiller: "Fuellwoerter",
    colChapter: "Kapitel",
    colSentences: "Saetze",
    colFiller: "Fuell %",
    colPassive: "Passiv %",
    colAdverb: "Adv %",
    colLong: "Lange Saetze",
    flesch: "Flesch",
    nestedTitle: "Schachtelsatz-Kandidaten",
    nestedWords: "{count} Woerter",
    nestedClauses: "{count} Nebensaetze",
    wordCountNote: "Gezaehlt werden alle Woerter im Fliesstext.",
    disclaimer: "Dieser Bericht ersetzt kein inhaltliches Lektorat.",
    total: "Gesamt",
    fleschBands: {
        easy: "Einfach",
        readable: "Verstaendlich",
        demanding: "Anspruchsvoll",
        academic: "Akademisch",
    },
    genres: {
        fiction: "Belletristik",
        nonfiction: "Sachbuch",
        scientific: "Wissenschaft",
        children: "Kinderbuch",
    },
    yourBook: "Ihr Buch",
    comparison: "Vergleich",
    nestedColStart: "Satz-Anfang",
    nestedColClauses: "Nebensaetze",
    page: "Seite",
}

/** Recursively flatten every `text` string in a pdfmake node tree. */
function collectText(node: unknown, out: string[] = []): string[] {
    if (node == null) return out
    if (Array.isArray(node)) {
        node.forEach((n) => collectText(n, out))
        return out
    }
    if (typeof node === "object") {
        const rec = node as Record<string, unknown>
        if (typeof rec.text === "string") out.push(rec.text)
        for (const key of ["columns", "stack", "content"]) {
            if (rec[key]) collectText(rec[key], out)
        }
        const table = rec.table as {body?: unknown} | undefined
        if (table?.body) collectText(table.body, out)
    }
    return out
}

/** Find the first table node anywhere in the content tree. */
function findTables(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
    if (node == null) return out
    if (Array.isArray(node)) {
        node.forEach((n) => findTables(n, out))
        return out
    }
    if (typeof node === "object") {
        const rec = node as Record<string, unknown>
        if (rec.table) out.push(rec)
        for (const key of ["columns", "stack", "content"]) {
            if (rec[key]) findTables(rec[key], out)
        }
        const table = rec.table as {body?: unknown} | undefined
        if (table?.body) findTables(table.body, out)
    }
    return out
}

function sample(): ChapterMetricsResponse {
    return {
        book_title: "Mein Buch",
        chapter_count: 2,
        averages: {
            word_count: 500,
            filler_ratio: 0.02,
            passive_ratio: 0.05,
            adverb_ratio: 0.04,
            flesch_reading_ease: 60,
            long_sentence_count: 2,
        },
        chapters: [
            {
                chapter_id: "ch1",
                chapter: "Erstes",
                position: 0,
                chapter_type: "chapter",
                empty: false,
                word_count: 480,
                sentence_count: 30,
                avg_sentence_length: 16,
                flesch_reading_ease: 62.4,
                difficulty: "medium",
                reading_time_minutes: 3,
                filler_ratio: 0.03,
                passive_ratio: 0.12,
                adverb_ratio: 0.05,
                adjective_ratio: 0.03,
                long_sentence_count: 3,
                finding_count: 20,
                long_sentences: [
                    {
                        text: "Dies ist ein wirklich langer Satz, der sich, mit mehreren Kommata, ueber eine ganze Weile hinzieht und kaum enden will.",
                        word_count: 20,
                    },
                    {text: "Ein kurzer Satz.", word_count: 3},
                ],
            },
            {
                chapter_id: "ch2",
                chapter: "Leeres",
                position: 1,
                chapter_type: "chapter",
                empty: true,
                word_count: 0,
                sentence_count: 0,
                avg_sentence_length: 0,
                flesch_reading_ease: 0,
                difficulty: "",
                reading_time_minutes: 0,
                filler_ratio: 0,
                passive_ratio: 0,
                adverb_ratio: 0,
                adjective_ratio: 0,
                long_sentence_count: 0,
                finding_count: 0,
            },
        ],
    }
}

describe("buildQualityReportMarkdown", () => {
    it("renders title, book name and summary", () => {
        const md = buildQualityReportMarkdown(sample(), labels)
        expect(md).toContain("# Qualitaetsbericht")
        expect(md).toContain("_Mein Buch_")
        expect(md).toContain("**Kapitel:** 1")
        expect(md).toContain("**Woerter:** 480")
    })

    it("renders a per-chapter table with a non-empty data row", () => {
        const md = buildQualityReportMarkdown(sample(), labels)
        const lines = md.split("\n")
        expect(lines.some((l) => l.startsWith("| # |"))).toBe(true)
        expect(md).toContain("| 1 | Erstes | 480 | 30 | 62 | 3.0% | 12.0% | 5.0% | 3 |")
    })

    it("renders empty chapters as dashes", () => {
        const md = buildQualityReportMarkdown(sample(), labels)
        expect(md).toContain("| 2 | Leeres | - | - | - | - | - | - | - |")
    })

    it("includes the analysis-scope disclaimer at the end", () => {
        const md = buildQualityReportMarkdown(sample(), labels)
        expect(md).toContain("> Dieser Bericht ersetzt kein inhaltliches Lektorat.")
    })

    it("includes the word-count transparency note", () => {
        const md = buildQualityReportMarkdown(sample(), labels)
        expect(md).toContain("> Gezaehlt werden alle Woerter im Fliesstext.")
    })

    it("renders nested-sentence candidates for chapters that have them", () => {
        const md = buildQualityReportMarkdown(sample(), labels)
        expect(md).toContain("## Schachtelsatz-Kandidaten")
        expect(md).toContain("### Erstes")
        expect(md).toContain("20 Woerter")
        expect(md).toContain("3 Nebensaetze")
    })
})

describe("buildQualityReportPdfDefinition", () => {
    it("produces an A4 definition with header/footer and the report title", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels, {date: "01.01.2026"})
        expect(def.pageSize).toBe("A4")
        expect(typeof def.header).toBe("function")
        expect(typeof def.footer).toBe("function")
        const texts = collectText(def.content)
        expect(texts).toContain("Qualitaetsbericht")
        expect(texts).toContain("„Mein Buch“")
    })

    it("renders a colored Flesch scale with bands and the marker", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const texts = collectText(def.content)
        expect(texts).toContain("Einfach")
        expect(texts).toContain("Akademisch")
        expect(texts.some((s) => s.includes("Ihr Buch") && s.includes("60.0"))).toBe(true)
        expect(texts.some((s) => s.startsWith("Vergleich:"))).toBe(true)
    })

    it("builds a chapter table with the non-empty data row and average row", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const tables = findTables(def.content)
        const chapterTable = tables.find((t) => {
            const body = (t.table as {body: unknown[][]}).body
            return body[0].some(
                (c) => (c as {text?: string}).text === "Lange Saetze",
            )
        })
        expect(chapterTable).toBeDefined()
        const texts = collectText(chapterTable)
        expect(texts).toContain("Erstes")
        expect(texts).toContain("480")
        expect(texts).toContain("Gesamt")
    })

    it("color-codes threshold cells (passive 12% -> bad red fill)", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const tables = findTables(def.content)
        const chapterTable = tables.find((t) => {
            const body = (t.table as {body: unknown[][]}).body
            return body[0].some((c) => (c as {text?: string}).text === "Flesch")
        })!
        const body = (chapterTable.table as {body: Record<string, unknown>[][]}).body
        const dataRow = body[1]
        const passiveCell = dataRow[6]
        expect(passiveCell.text).toBe("12.0")
        expect(passiveCell.fillColor).toBe("#f7dcdc")
    })

    it("renders empty chapters as dashes without threshold fills", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const tables = findTables(def.content)
        const chapterTable = tables.find((t) => {
            const body = (t.table as {body: unknown[][]}).body
            return body[0].some((c) => (c as {text?: string}).text === "Flesch")
        })!
        const body = (chapterTable.table as {body: Record<string, unknown>[][]}).body
        const emptyRow = body[2]
        expect(emptyRow[1].text).toBe("Leeres")
        expect(emptyRow[4].text).toBe("-")
        expect(emptyRow[4].fillColor).toBeUndefined()
    })

    it("includes a per-chapter nested-sentence table with a page break", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const content = def.content as Record<string, unknown>[]
        const nestedHeading = content.find((n) => n.pageBreak === "before")
        expect(nestedHeading).toBeDefined()
        expect((nestedHeading as {text?: string}).text).toBe("Schachtelsatz-Kandidaten")
        const texts = collectText(def.content)
        expect(texts).toContain("Satz-Anfang")
    })

    it("includes the word-count note and the disclaimer", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const texts = collectText(def.content)
        expect(texts).toContain("Gezaehlt werden alle Woerter im Fliesstext.")
        expect(texts).toContain("Dieser Bericht ersetzt kein inhaltliches Lektorat.")
    })
})

/**
 * Regression coverage for the duplicate-numbering bug (#384): the "#" column
 * must follow logical book order (sorted by `position`) and be sequential
 * 1..N, with no gaps or duplicates, consistently across the UI source helper,
 * the Markdown export and the PDF export. The pre-fix code rendered
 * `position + 1`, which duplicated when chapters shared a position (e.g. ones
 * inserted after Impressum/Epilog) and left gaps when positions were sparse.
 */
function chapter(id: string, name: string, position: number, empty = false): ChapterMetric {
    return {
        chapter_id: id,
        chapter: name,
        position,
        chapter_type: "chapter",
        empty,
        word_count: empty ? 0 : 100,
        sentence_count: empty ? 0 : 10,
        avg_sentence_length: empty ? 0 : 10,
        flesch_reading_ease: empty ? 0 : 60,
        difficulty: empty ? "" : "medium",
        reading_time_minutes: empty ? 0 : 1,
        filler_ratio: 0,
        passive_ratio: 0,
        adverb_ratio: 0,
        adjective_ratio: 0,
        long_sentence_count: 0,
        finding_count: 0,
    }
}

function response(chapters: ChapterMetric[]): ChapterMetricsResponse {
    return {
        book_title: "Buch",
        chapter_count: chapters.length,
        averages: sample().averages,
        chapters,
    }
}

/** The "#" (first) column of each data row of the PDF chapter table. */
function pdfChapterNumbers(def: ReturnType<typeof buildQualityReportPdfDefinition>): string[] {
    for (const node of findTables(def.content)) {
        const body = (node.table as {body?: unknown[][]}).body
        if (!body) continue
        const headerCell = body[0]?.[0] as {text?: string} | undefined
        if (headerCell?.text !== "#") continue
        return body
            .slice(1)
            .map((row) => String((row[0] as {text?: string})?.text ?? ""))
            .filter((text) => text !== "")
    }
    return []
}

/** The "#" (first) column of each Markdown data row. */
function mdChapterNumbers(md: string): string[] {
    return md
        .split("\n")
        .map((line) => line.match(/^\| (\d+) \|/))
        .filter((m): m is RegExpMatchArray => m != null)
        .map((m) => m[1])
}

describe("chapter numbering follows logical book order (#384)", () => {
    it("reproduction: chapters sharing a position get distinct sequential numbers", () => {
        // Two chapters inserted after the Impressum end up at the same DB position.
        const chapters = [
            chapter("a", "Kap A", 0),
            chapter("b", "Kap B", 5),
            chapter("c", "Kap C", 5),
            chapter("d", "Kap D", 12),
        ]
        // Pre-fix (position+1) would render 1, 6, 6, 13 -> duplicate 6 + gaps.
        expect(numberChapters(chapters).map((c) => c.number)).toEqual([1, 2, 3, 4])

        const nums = mdChapterNumbers(buildQualityReportMarkdown(response(chapters), labels))
        expect(nums).toEqual(["1", "2", "3", "4"])
        expect(new Set(nums).size).toBe(nums.length)
    })

    it("happy path: 15 chapters are numbered 1..15", () => {
        const chapters = Array.from({length: 15}, (_, i) => chapter(`c${i}`, `Kap ${i}`, i))
        expect(numberChapters(chapters).map((c) => c.number)).toEqual(
            Array.from({length: 15}, (_, i) => i + 1),
        )
        const md = buildQualityReportMarkdown(response(chapters), labels)
        expect(md).toContain("| 1 | Kap 0 |")
        expect(md).toContain("| 15 | Kap 14 |")
    })

    it("edge: chapters with equal position keep incoming order, numbered stably", () => {
        const chapters = [chapter("x", "X", 3), chapter("y", "Y", 3), chapter("z", "Z", 3)]
        expect(numberChapters(chapters).map((c) => [c.chapter, c.number])).toEqual([
            ["X", 1],
            ["Y", 2],
            ["Z", 3],
        ])
    })

    it("edge: empty chapters (Toc/Epilog/Glossar) still get a sequential number, metrics as -", () => {
        const chapters = [
            chapter("a", "Kapitel 1", 0),
            chapter("toc", "Inhalt", 1, true),
            chapter("b", "Kapitel 2", 2),
        ]
        expect(numberChapters(chapters).map((c) => c.number)).toEqual([1, 2, 3])
        const md = buildQualityReportMarkdown(response(chapters), labels)
        expect(md).toContain("| 2 | Inhalt | - | - | - | - | - | - | - |")
        expect(md).toContain("| 3 | Kapitel 2 |")
    })

    it("PDF export mirrors the same sequential numbering", () => {
        const chapters = [chapter("a", "A", 0), chapter("b", "B", 5), chapter("c", "C", 5)]
        const def = buildQualityReportPdfDefinition(response(chapters), labels)
        expect(pdfChapterNumbers(def)).toEqual(["1", "2", "3"])
    })
})

/** A chapter metric with an explicit chapter_type (for matter-group order). */
function typedChapter(
    id: string,
    name: string,
    position: number,
    chapterType: string,
    empty = false,
): ChapterMetric {
    return {...chapter(id, name, position, empty), chapter_type: chapterType}
}

/** Chapter names, in row order, from a Markdown report (`| n | name | ...`). */
function mdChapterNames(md: string): string[] {
    return md
        .split("\n")
        .map((line) => line.match(/^\| \d+ \| ([^|]+?) \|/))
        .filter((m): m is RegExpMatchArray => m != null)
        .map((m) => m[1].trim())
}

describe("chapter order follows the sidebar's matter grouping (#412)", () => {
    it("reproduction: low-position back-matter is NOT interleaved before later main chapters", () => {
        // Back-matter placeholders were created early (low positions 1-2),
        // the real main chapters later (positions 10-12). Raw-position order
        // put Epilog/Glossar BEFORE Kapitel 16-18; the sidebar shows all
        // back-matter last. numberChapters must match the sidebar.
        const chapters = [
            typedChapter("k15", "Kapitel 15", 0, "chapter"),
            typedChapter("epi", "Epilog", 1, "epilogue"),
            typedChapter("glo", "Glossar", 2, "glossary"),
            typedChapter("k16", "Kapitel 16", 10, "chapter"),
            typedChapter("k17", "Kapitel 17", 11, "chapter"),
            typedChapter("k18", "Kapitel 18", 12, "chapter"),
        ]
        expect(numberChapters(chapters).map((c) => c.chapter)).toEqual([
            "Kapitel 15",
            "Kapitel 16",
            "Kapitel 17",
            "Kapitel 18",
            "Epilog",
            "Glossar",
        ])
    })

    it("happy path: 5 plain chapters keep position order 1..5", () => {
        const chapters = Array.from({length: 5}, (_, i) =>
            typedChapter(`c${i}`, `Kapitel ${i + 1}`, i, "chapter"),
        )
        expect(numberChapters(chapters).map((c) => c.number)).toEqual([1, 2, 3, 4, 5])
        expect(numberChapters(chapters).map((c) => c.chapter)).toEqual([
            "Kapitel 1",
            "Kapitel 2",
            "Kapitel 3",
            "Kapitel 4",
            "Kapitel 5",
        ])
    })

    it("front matter sorts first, back matter last, regardless of position", () => {
        const chapters = [
            typedChapter("epi", "Epilog", 0, "epilogue"),
            typedChapter("k1", "Kapitel 1", 1, "chapter"),
            typedChapter("toc", "Inhalt", 2, "toc"),
            typedChapter("k2", "Kapitel 2", 3, "chapter"),
            typedChapter("imp", "Impressum", 4, "imprint"),
        ]
        expect(numberChapters(chapters).map((c) => c.chapter)).toEqual([
            "Inhalt", // front matter (toc)
            "Kapitel 1",
            "Kapitel 2", // main
            "Epilog",
            "Impressum", // back matter
        ])
    })

    it("edge: empty back-matter placeholders keep correct (last) position with - metrics", () => {
        const chapters = [
            typedChapter("k1", "Kapitel 1", 0, "chapter"),
            typedChapter("epi", "Epilog", 1, "epilogue", true),
            typedChapter("k2", "Kapitel 2", 2, "chapter"),
        ]
        const ordered = numberChapters(chapters)
        expect(ordered.map((c) => c.chapter)).toEqual(["Kapitel 1", "Kapitel 2", "Epilog"])
        const md = buildQualityReportMarkdown(response(chapters), labels)
        // Epilog is row 3 (last) and renders dashes for all metrics.
        expect(md).toContain("| 3 | Epilog | - | - | - | - | - | - | - |")
    })

    it("consistency: UI order == MD order == PDF order", () => {
        const chapters = [
            typedChapter("epi", "Epilog", 0, "epilogue"),
            typedChapter("k1", "Kapitel 1", 5, "chapter"),
            typedChapter("toc", "Inhalt", 1, "toc"),
            typedChapter("k2", "Kapitel 2", 6, "chapter"),
        ]
        const uiOrder = numberChapters(chapters).map((c) => c.chapter)
        expect(uiOrder).toEqual(["Inhalt", "Kapitel 1", "Kapitel 2", "Epilog"])

        const md = buildQualityReportMarkdown(response(chapters), labels)
        expect(mdChapterNames(md)).toEqual(uiOrder)

        // PDF numbers are sequential in the same order (1..4).
        const def = buildQualityReportPdfDefinition(response(chapters), labels)
        expect(pdfChapterNumbers(def)).toEqual(["1", "2", "3", "4"])
    })
})

// --- PDF palette extracted to qualityThresholds.ts (#427) ---
//
// The fixed theme-independent PDF tints moved out of qualityReport.ts into the
// shared constants module so the renderer stays free of inline hex and
// `make verify-theme` passes. These pins lock the palette values (a stray edit
// is a visible PDF-color regression) and prove the renderer consumes the shared
// constants rather than a divergent inline copy.
describe("quality-report PDF palette (#427)", () => {
    it("exports the severity fills (good/warn/bad) with their fixed tints", () => {
        expect(SEVERITY_FILL).toEqual({
            good: "#d6efdc",
            warn: "#fdeccb",
            bad: "#f7dcdc",
        })
    })

    it("exports all four Flesch band fills (easiest -> hardest)", () => {
        expect(FLESCH_BAND_FILL).toEqual({
            easy: "#bfe6cb",
            readable: "#dff1e5",
            demanding: "#fce3bf",
            academic: "#f4cfcf",
        })
        expect(Object.keys(FLESCH_BAND_FILL)).toHaveLength(4)
    })

    it("exports the header/rule/muted greys", () => {
        expect(HEADER_FILL).toBe("#e5e5e5")
        expect(RULE_COLOR).toBe("#cccccc")
        expect(MUTED_COLOR).toBe("#666666")
    })

    it("the rendered PDF consumes the shared constants (no inline divergence)", () => {
        const def = buildQualityReportPdfDefinition(sample(), labels)
        const tables = findTables(def.content)
        const chapterTable = tables.find((t) => {
            const body = (t.table as {body: unknown[][]}).body
            return body[0].some((c) => (c as {text?: string}).text === "Flesch")
        })!
        const body = (chapterTable.table as {body: Record<string, unknown>[][]}).body
        // Header cells are filled with the shared HEADER_FILL constant.
        expect(body[0][0].fillColor).toBe(HEADER_FILL)
        // The passive 12% cell is a "bad" severity -> shared SEVERITY_FILL.bad.
        expect(body[1][6].fillColor).toBe(SEVERITY_FILL.bad)
    })
})
