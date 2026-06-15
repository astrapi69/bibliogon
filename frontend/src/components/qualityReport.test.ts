import {describe, it, expect} from "vitest"
import {
    buildQualityReportMarkdown,
    buildQualityReportDocument,
    type QualityReportLabels,
} from "./qualityReport"
import type {ChapterMetricsResponse} from "../api/client"

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

describe("buildQualityReportDocument", () => {
    it("maps onto an ExportDocument with one section of paragraphs", () => {
        const doc = buildQualityReportDocument(sample(), labels)
        expect(doc.title).toBe("Qualitaetsbericht")
        expect(doc.subtitle).toBe("Mein Buch")
        expect(doc.sections).toHaveLength(1)
        const nodes = doc.sections[0].doc.content as Array<Record<string, unknown>>
        expect(nodes.length).toBeGreaterThan(0)
        expect(nodes.every((n) => n.type === "paragraph")).toBe(true)
    })

    it("includes the non-empty chapter metrics in a paragraph", () => {
        const doc = buildQualityReportDocument(sample(), labels)
        const nodes = doc.sections[0].doc.content as Array<{
            content?: Array<{text?: string}>
        }>
        const texts = nodes.map((n) => n.content?.[0]?.text ?? "")
        expect(texts.some((s) => s.includes("Erstes") && s.includes("Woerter: 480"))).toBe(true)
    })
})
