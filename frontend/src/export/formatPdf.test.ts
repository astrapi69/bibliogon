/**
 * Real-render regression for the client-side PDF engine (#292).
 *
 * `binaryFormats.test.ts` covers the pure `docToPdfContent` walker but
 * deliberately stops short of the actual pdfmake render. That gap let the
 * pdfmake 0.2 -> 0.3 API break ship undetected: `pdfMake.vfs = vfs` is
 * ignored by 0.3.x (fonts live in `virtualfs`, set via
 * `addVirtualFileSystem`) and `getBlob(cb)` no longer fires its callback
 * (it returns a Promise). Both faults make `toPdfBlob` reject or hang.
 *
 * This test exercises the REAL render end-to-end (vfs registration +
 * Promise-form getBlob) and asserts a valid PDF blob. On the pre-fix code
 * it fails (reject / timeout); after the fix it produces a `%PDF-` blob.
 */

import { describe, it, expect } from "vitest";

import { renderPdfDefinition, toPdfBlob } from "./formatPdf";
import type { ExportDocument } from "./documentModel";
import {
  buildQualityReportPdfDefinition,
  type QualityReportLabels,
} from "../components/quality/qualityReport";
import type { ChapterMetricsResponse } from "../api/client";

const REPORT: ExportDocument = {
  title: "Qualitaetsbericht",
  subtitle: "Mein Buch",
  sections: [
    {
      heading: "",
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Woerter gesamt: 1234" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "1. Kapitel", marks: [{ type: "bold" }] },
              { type: "text", text: " - Flesch: 60" },
            ],
          },
        ],
      },
    },
  ],
};

describe("toPdfBlob (real pdfmake 0.3 render)", () => {
  it("registers the vfs and resolves a non-empty PDF blob", async () => {
    const blob = await toPdfBlob(REPORT);
    expect(blob).toBeInstanceOf(Blob);
    // A real rendered PDF is several KB; a broken vfs/getBlob path would
    // reject or hang rather than reach here.
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("emits a valid %PDF- header", async () => {
    const blob = await toPdfBlob(REPORT);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = String.fromCharCode(...bytes.subarray(0, 5));
    expect(header).toBe("%PDF-");
  });
});

const QUALITY_LABELS: QualityReportLabels = {
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
  wordCountNote: "Gezaehlt werden alle Woerter.",
  disclaimer: "Ersetzt kein Lektorat.",
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
};

const QUALITY_METRICS: ChapterMetricsResponse = {
  book_title: "Mein Buch",
  chapter_count: 1,
  averages: {
    word_count: 480,
    filler_ratio: 0.03,
    passive_ratio: 0.12,
    adverb_ratio: 0.05,
    flesch_reading_ease: 62.4,
    sentence_count: 30,
    long_sentence_count: 3,
  },
  chapters: [
    {
      chapter_id: "ch1",
      chapter: "Erstes Kapitel",
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
          text: "<p>Dies ist ein wirklich langer Satz, der sich, mit mehreren Kommata, ueber eine ganze Weile hinzieht.</p>",
          word_count: 17,
        },
      ],
    },
  ],
};

describe("buildQualityReportPdfDefinition (real pdfmake render)", () => {
  it("renders the colored quality report to a valid PDF blob", async () => {
    const definition = buildQualityReportPdfDefinition(
      QUALITY_METRICS,
      QUALITY_LABELS,
      { date: "01.01.2026" },
    );
    const blob = await renderPdfDefinition(definition);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe("%PDF-");
  });
});
