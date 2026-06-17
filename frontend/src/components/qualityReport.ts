/**
 * Pure builders for the downloadable readability/quality report.
 *
 * `buildQualityReportMarkdown` renders a {@link ChapterMetricsResponse} as a
 * Markdown document (summary metrics + a per-chapter table) matching what the
 * Quality tab shows on screen. `buildQualityReportPdfDefinition` maps the same
 * data onto a `pdfmake` document definition so the PDF visually mirrors the UI
 * (summary header, colored Flesch scale, traffic-light chapter table, nested
 * sentence tables) without a backend round-trip.
 *
 * Both functions are framework-free and synchronous so they can be unit-tested
 * in isolation; the pdfmake render itself happens in {@link renderPdfDefinition}.
 */

import type { ChapterMetricsResponse } from "../api/client";
import type { PdfDocDefinition } from "../export/formatPdf";
import { rankSentences, sentenceAnchor } from "../lib/utils/sentenceComplexity";
import { classify, type CellSeverity } from "../lib/components/MetricsTable";
import {
  fleschBand,
  GENRE_BENCHMARKS,
  type FleschBand,
  type FleschGenre,
} from "../lib/components/FleschScale";
import {
  FLESCH_THRESHOLD,
  FILLER_PCT_THRESHOLD,
  PASSIVE_PCT_THRESHOLD,
  LONG_SENTENCE_THRESHOLD,
} from "./qualityThresholds";

/** Localized labels the report builders need (caller supplies via i18n `t`). */
export interface QualityReportLabels {
  title: string;
  chapters: string;
  words: string;
  avgReadability: string;
  avgFiller: string;
  colChapter: string;
  colSentences: string;
  colFiller: string;
  colPassive: string;
  colAdverb: string;
  colLong: string;
  flesch: string;
  /** Section heading for the nested-sentence candidates (#283). */
  nestedTitle: string;
  /** Template "{count} words" for a candidate's word count. */
  nestedWords: string;
  /** Template "{count} clauses" for a candidate's comma-based clause count. */
  nestedClauses: string;
  /** Footnote describing what the word count includes (#286). */
  wordCountNote: string;
  /** Analysis-scope disclaimer: style, not content (#287). */
  disclaimer: string;
  /** Totals/average row label for the comparison table. */
  total: string;
  /** Flesch readability band labels (easiest first). */
  fleschBands: Record<FleschBand, string>;
  /** Genre labels for the Flesch comparison line. */
  genres: Record<FleschGenre, string>;
  /** "Your book" marker label on the Flesch scale. */
  yourBook: string;
  /** "Comparison" lead-in for the genre benchmark line. */
  comparison: string;
  /** Header for the nested-sentence table's anchor column. */
  nestedColStart: string;
  /** Header for the nested-sentence table's clause column. */
  nestedColClauses: string;
  /** Footer "page" label. */
  page: string;
}

/** Lines (markdown) for the per-chapter nested-sentence candidates. */
function nestedSentenceLines(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
): string[] {
  const lines: string[] = [];
  for (const ch of metrics.chapters) {
    const ranked = rankSentences(
      (ch.long_sentences ?? []).map((s) => s.text),
      10,
    );
    if (ranked.length === 0) continue;
    lines.push(`### ${ch.chapter}`, "");
    for (const sentence of ranked) {
      const words = labels.nestedWords.replace(
        "{count}",
        String(sentence.wordCount),
      );
      const clauses = labels.nestedClauses.replace(
        "{count}",
        String(sentence.clauseCount),
      );
      lines.push(`- "${sentenceAnchor(sentence.text)}" — ${words} · ${clauses}`);
    }
    lines.push("");
  }
  if (lines.length === 0) return [];
  return [`## ${labels.nestedTitle}`, "", ...lines];
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function summaryLines(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
): string[] {
  const nonEmpty = metrics.chapters.filter((ch) => !ch.empty);
  const totalWords = nonEmpty.reduce((sum, ch) => sum + ch.word_count, 0);
  const avg = metrics.averages;
  return [
    `- **${labels.chapters}:** ${nonEmpty.length}`,
    `- **${labels.words}:** ${totalWords}`,
    `- **${labels.avgReadability}:** ${avg.flesch_reading_ease ? avg.flesch_reading_ease.toFixed(1) : "-"}`,
    `- **${labels.avgFiller}:** ${avg.filler_ratio ? pct(avg.filler_ratio) : "-"}`,
  ];
}

/**
 * Render the quality report as a Markdown string (summary + per-chapter table).
 *
 * @param metrics - The chapter metrics response from the ms-tools endpoint.
 * @param labels - Localized column/summary labels.
 * @returns A Markdown document string.
 */
export function buildQualityReportMarkdown(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
): string {
  const header = [
    `# ${labels.title}`,
    metrics.book_title ? `_${metrics.book_title}_` : "",
    "",
    ...summaryLines(metrics, labels),
    "",
    `> ${labels.wordCountNote}`,
    "",
  ];

  const tableHead = [
    `| # | ${labels.colChapter} | ${labels.words} | ${labels.colSentences} | ${labels.flesch} | ${labels.colFiller} | ${labels.colPassive} | ${labels.colAdverb} | ${labels.colLong} |`,
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  const rows = metrics.chapters.map((ch) => {
    if (ch.empty) {
      return `| ${ch.position + 1} | ${ch.chapter} | - | - | - | - | - | - | - |`;
    }
    return `| ${ch.position + 1} | ${ch.chapter} | ${ch.word_count} | ${ch.sentence_count} | ${ch.flesch_reading_ease.toFixed(0)} | ${pct(ch.filler_ratio)} | ${pct(ch.passive_ratio)} | ${pct(ch.adverb_ratio)} | ${ch.long_sentence_count} |`;
  });

  return [
    ...header,
    ...tableHead,
    ...rows,
    "",
    ...nestedSentenceLines(metrics, labels),
    "---",
    "",
    `> ${labels.disclaimer}`,
    "",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* PDF builder (#356): visual parity with the on-screen Quality tab.          */
/* -------------------------------------------------------------------------- */

/** A pdfmake content node (loose: built as plain data, rendered downstream). */
type PdfNode = Record<string, unknown>;

/**
 * Theme-independent PDF palette. The on-screen tables use the semantic theme
 * tokens via `color-mix`; the PDF carries its own fixed tints (light fills of
 * green / amber / red) so it renders identically regardless of the active app
 * theme.
 */
const HEADER_FILL = "#e5e5e5";
const RULE_COLOR = "#cccccc";
const MUTED_COLOR = "#666666";

/** Traffic-light cell fills, keyed by the same severities `MetricsTable` uses. */
const SEVERITY_FILL: Record<CellSeverity, string> = {
  good: "#d6efdc",
  warn: "#fdeccb",
  bad: "#f7dcdc",
};

/** Flesch band fills (easiest first), mirroring the on-screen scale order. */
const FLESCH_BAND_FILL: Record<FleschBand, string> = {
  easy: "#bfe6cb",
  readable: "#dff1e5",
  demanding: "#fce3bf",
  academic: "#f4cfcf",
};

const FLESCH_BAND_ORDER: FleschBand[] = [
  "easy",
  "readable",
  "demanding",
  "academic",
];

/** Numeric range shown under each band label (matches `FleschScale`). */
const FLESCH_BAND_RANGE: Record<FleschBand, string> = {
  easy: "80+",
  readable: "60-80",
  demanding: "40-60",
  academic: "<40",
};

const GENRE_ORDER: FleschGenre[] = [
  "fiction",
  "nonfiction",
  "scientific",
  "children",
];

/** A4 usable content width at 40pt side margins (595.28 - 80). */
const CONTENT_WIDTH = 515;

/** Horizontal-rule-only table layout (no vertical lines) — matches the UI. */
const TABLE_LAYOUT = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
  vLineWidth: () => 0,
  hLineColor: () => RULE_COLOR,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

interface CellOpts {
  fill?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  color?: string;
}

function cell(text: string, opts: CellOpts = {}): PdfNode {
  return {
    text,
    fontSize: 8,
    alignment: opts.align ?? "center",
    fillColor: opts.fill,
    bold: opts.bold,
    color: opts.color,
  };
}

/** Map a (possibly null) severity to its PDF fill color. */
function severityFill(severity: CellSeverity | null): string | undefined {
  return severity ? SEVERITY_FILL[severity] : undefined;
}

/** One big-number summary column (value over label), like the UI header. */
function summaryColumn(value: string, label: string): PdfNode {
  return {
    width: "*",
    stack: [
      { text: value, fontSize: 18, bold: true },
      { text: label, fontSize: 8, color: MUTED_COLOR, margin: [0, 1, 0, 0] },
    ],
  };
}

/** Colored four-band Flesch scale with a marker line + genre comparison. */
function fleschBlock(score: number, labels: QualityReportLabels): PdfNode[] {
  const activeBand = fleschBand(score);
  const bandCells = FLESCH_BAND_ORDER.map((band) => ({
    stack: [
      {
        text: labels.fleschBands[band],
        bold: true,
        fontSize: 8,
        alignment: "center",
      },
      {
        text: FLESCH_BAND_RANGE[band],
        fontSize: 7,
        color: MUTED_COLOR,
        alignment: "center",
      },
    ],
    fillColor: FLESCH_BAND_FILL[band],
    margin: [2, 4, 2, 4],
  }));

  const markerRow: PdfNode = {
    columns: FLESCH_BAND_ORDER.map((band) => ({
      width: "*",
      text:
        band === activeBand
          ? `▲ ${labels.yourBook}: ${score.toFixed(1)}`
          : "",
      alignment: "center",
      bold: true,
      fontSize: 8,
    })),
    margin: [0, 2, 0, 2],
  };

  const comparison: PdfNode = {
    text: `${labels.comparison}: ${GENRE_ORDER.map(
      (g) => `${labels.genres[g]} ~${GENRE_BENCHMARKS[g]}`,
    ).join(", ")}`,
    fontSize: 7,
    color: MUTED_COLOR,
    margin: [0, 0, 0, 12],
  };

  return [
    {
      table: { widths: ["*", "*", "*", "*"], body: [bandCells] },
      layout: "noBorders",
      margin: [0, 0, 0, 2],
    },
    markerRow,
    comparison,
  ];
}

/** Traffic-light per-chapter comparison table with a bold average row. */
function chapterTable(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
): PdfNode {
  const nonEmpty = metrics.chapters.filter((ch) => !ch.empty);
  const avg = metrics.averages;

  const headerRow = [
    cell("#", { bold: true, fill: HEADER_FILL }),
    cell(labels.colChapter, { bold: true, fill: HEADER_FILL, align: "left" }),
    cell(labels.words, { bold: true, fill: HEADER_FILL }),
    cell(labels.colSentences, { bold: true, fill: HEADER_FILL }),
    cell(labels.flesch, { bold: true, fill: HEADER_FILL }),
    cell(labels.colFiller, { bold: true, fill: HEADER_FILL }),
    cell(labels.colPassive, { bold: true, fill: HEADER_FILL }),
    cell(labels.colAdverb, { bold: true, fill: HEADER_FILL }),
    cell(labels.colLong, { bold: true, fill: HEADER_FILL }),
  ];

  const dataRows = metrics.chapters.map((ch) => {
    if (ch.empty) {
      return [
        cell(String(ch.position + 1), { color: MUTED_COLOR }),
        cell(ch.chapter, { align: "left", color: MUTED_COLOR }),
        ...Array.from({ length: 7 }, () => cell("-", { color: MUTED_COLOR })),
      ];
    }
    const fillerPct = ch.filler_ratio * 100;
    const passivePct = ch.passive_ratio * 100;
    return [
      cell(String(ch.position + 1)),
      cell(ch.chapter, { align: "left" }),
      cell(String(ch.word_count)),
      cell(String(ch.sentence_count)),
      cell(ch.flesch_reading_ease.toFixed(0), {
        fill: severityFill(classify(ch.flesch_reading_ease, FLESCH_THRESHOLD)),
      }),
      cell(fillerPct.toFixed(1), {
        fill: severityFill(classify(fillerPct, FILLER_PCT_THRESHOLD)),
      }),
      cell(passivePct.toFixed(1), {
        fill: severityFill(classify(passivePct, PASSIVE_PCT_THRESHOLD)),
      }),
      cell((ch.adverb_ratio * 100).toFixed(1)),
      cell(String(ch.long_sentence_count), {
        fill: severityFill(
          classify(ch.long_sentence_count, LONG_SENTENCE_THRESHOLD),
        ),
      }),
    ];
  });

  const sumWords = nonEmpty.reduce((s, c) => s + c.word_count, 0);
  const sumSentences = nonEmpty.reduce((s, c) => s + c.sentence_count, 0);
  const avgCell = (value: number | undefined, digits = 1): string =>
    value ? value.toFixed(digits) : "-";
  const avgRow = [
    cell("", { bold: true }),
    cell(labels.total, { bold: true, align: "left" }),
    cell(String(sumWords), { bold: true }),
    cell(String(sumSentences), { bold: true }),
    cell(avgCell(avg.flesch_reading_ease), { bold: true }),
    cell(avg.filler_ratio ? (avg.filler_ratio * 100).toFixed(1) : "-", {
      bold: true,
    }),
    cell(avg.passive_ratio ? (avg.passive_ratio * 100).toFixed(1) : "-", {
      bold: true,
    }),
    cell(avg.adverb_ratio ? (avg.adverb_ratio * 100).toFixed(1) : "-", {
      bold: true,
    }),
    cell(avgCell(avg.long_sentence_count), { bold: true }),
  ];

  return {
    table: {
      headerRows: 1,
      widths: ["auto", "*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"],
      body: [headerRow, ...dataRows, avgRow],
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 6],
  };
}

/** Per-chapter nested-sentence candidate tables (empty when there are none). */
function nestedBlocks(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
): PdfNode[] {
  const blocks: PdfNode[] = [];
  for (const ch of metrics.chapters) {
    const ranked = rankSentences(
      (ch.long_sentences ?? []).map((s) => s.text),
      10,
    );
    if (ranked.length === 0) continue;
    if (blocks.length === 0) {
      blocks.push({
        text: labels.nestedTitle,
        style: "h2",
        pageBreak: "before",
        margin: [0, 0, 0, 6],
      });
    }
    blocks.push({ text: ch.chapter, bold: true, fontSize: 11, margin: [0, 8, 0, 3] });
    const headerRow = [
      cell(labels.nestedColStart, { bold: true, fill: HEADER_FILL, align: "left" }),
      cell(labels.words, { bold: true, fill: HEADER_FILL }),
      cell(labels.nestedColClauses, { bold: true, fill: HEADER_FILL }),
    ];
    const rows = ranked.map((s) => [
      cell(sentenceAnchor(s.text), { align: "left" }),
      cell(String(s.wordCount)),
      cell(String(s.clauseCount)),
    ]);
    blocks.push({
      table: { headerRows: 1, widths: ["*", "auto", "auto"], body: [headerRow, ...rows] },
      layout: TABLE_LAYOUT,
      margin: [0, 0, 0, 4],
    });
  }
  return blocks;
}

/** Optional render-time metadata for the PDF (kept out of the pure data). */
export interface QualityReportPdfOptions {
  /** Pre-formatted date string for the running header (caller localizes). */
  date?: string;
}

/**
 * Build a `pdfmake` document definition that mirrors the on-screen Quality tab:
 * a summary header, the colored Flesch benchmark scale, a traffic-light chapter
 * comparison table, per-chapter nested-sentence tables, and the word-count note
 * plus analysis-scope disclaimer.
 *
 * Pure and synchronous (no `Date`, no DOM): the running-header date is passed
 * in via {@link QualityReportPdfOptions}. Render it with `renderPdfDefinition`.
 *
 * @param metrics - The chapter metrics response.
 * @param labels - Localized labels + thresholds-aligned band/genre strings.
 * @param options - Render metadata (header date).
 * @returns A pdfmake document definition ready for `renderPdfDefinition`.
 */
export function buildQualityReportPdfDefinition(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
  options: QualityReportPdfOptions = {},
): PdfDocDefinition {
  const nonEmpty = metrics.chapters.filter((ch) => !ch.empty);
  const totalWords = nonEmpty.reduce((s, c) => s + c.word_count, 0);
  const avg = metrics.averages;
  const bookTitle = metrics.book_title?.trim() || "";
  const date = options.date ?? "";

  const content: PdfNode[] = [
    { text: labels.title, fontSize: 22, bold: true, margin: [0, 0, 0, 2] },
  ];
  if (bookTitle) {
    content.push({
      text: `„${bookTitle}“`,
      italics: true,
      color: MUTED_COLOR,
      fontSize: 13,
      margin: [0, 0, 0, 10],
    });
  }
  content.push({
    columns: [
      summaryColumn(String(nonEmpty.length), labels.chapters),
      summaryColumn(String(totalWords), labels.words),
      summaryColumn(
        avg.flesch_reading_ease ? avg.flesch_reading_ease.toFixed(1) : "-",
        labels.avgReadability,
      ),
      summaryColumn(
        avg.filler_ratio ? `${(avg.filler_ratio * 100).toFixed(1)}%` : "-",
        labels.avgFiller,
      ),
    ],
    columnGap: 8,
    margin: [0, 0, 0, 14],
  });
  if (avg.flesch_reading_ease) {
    content.push(...fleschBlock(avg.flesch_reading_ease, labels));
  }
  content.push(chapterTable(metrics, labels));
  content.push({
    text: labels.wordCountNote,
    fontSize: 8,
    color: MUTED_COLOR,
    margin: [0, 8, 0, 0],
  });
  content.push(...nestedBlocks(metrics, labels));
  content.push({
    canvas: [
      {
        type: "line",
        x1: 0,
        y1: 6,
        x2: CONTENT_WIDTH,
        y2: 6,
        lineWidth: 0.5,
        lineColor: RULE_COLOR,
      },
    ],
    margin: [0, 14, 0, 0],
  });
  content.push({
    text: labels.disclaimer,
    fontSize: 8,
    italics: true,
    color: MUTED_COLOR,
    margin: [0, 6, 0, 0],
  });

  return {
    pageSize: "A4",
    pageMargins: [40, 54, 40, 42],
    header: () => ({
      columns: [
        { text: bookTitle, fontSize: 8, color: MUTED_COLOR, margin: [40, 22, 0, 0] },
        {
          text: date,
          fontSize: 8,
          color: MUTED_COLOR,
          alignment: "right",
          margin: [0, 22, 40, 0],
        },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      text: `${labels.page} ${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 8,
      color: MUTED_COLOR,
      margin: [0, 14, 0, 0],
    }),
    content,
    styles: { h2: { fontSize: 14, bold: true } },
    defaultStyle: { fontSize: 9, lineHeight: 1.2 },
    info: { title: labels.title },
  };
}
