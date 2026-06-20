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

import type { ChapterMetric, ChapterMetricsResponse, ChapterType } from "../../api/client";
import type { PdfDocDefinition } from "../../export/formatPdf";
import { rankSentences, sentenceAnchor } from "../../lib/utils/sentenceComplexity";
import {
  FRONT_MATTER_TYPES,
  BACK_MATTER_TYPES,
} from "../../lib/utils/chapterGroups";
import { classify, type CellSeverity } from "../../lib/components/MetricsTable";
import {
  fleschBand,
  GENRE_BENCHMARKS,
  type FleschBand,
  type FleschGenre,
} from "../../lib/components/FleschScale";
import {
  FLESCH_THRESHOLD,
  FILLER_PCT_THRESHOLD,
  PASSIVE_PCT_THRESHOLD,
  LONG_SENTENCE_THRESHOLD,
  HEADER_FILL,
  RULE_COLOR,
  MUTED_COLOR,
  SEVERITY_FILL,
  FLESCH_BAND_FILL,
} from "../qualityThresholds";

/** A chapter metric tagged with its sequential book number (1..N). */
export interface NumberedChapterMetric extends ChapterMetric {
  /** 1-based sequential number in logical book order, independent of the raw
   *  `position` value (which may be sparse or shared and must NOT drive the
   *  displayed number). */
  number: number;
}

/**
 * Logical book-order rank for a chapter type, matching the ChapterSidebar's
 * front-matter -> main -> back-matter grouping (see {@link groupChapters}):
 * 0 = front matter, 1 = main body (chapters + structural types + anything
 * not explicitly front/back), 2 = back matter. Used to order the quality
 * report the same way the author sees the book in the sidebar, rather than
 * by raw `position` (which interleaves low-position back-matter placeholders
 * before later main chapters).
 */
function bookOrderRank(chapterType: string): number {
  if (FRONT_MATTER_TYPES.includes(chapterType as ChapterType)) return 0;
  if (BACK_MATTER_TYPES.includes(chapterType as ChapterType)) return 2;
  return 1;
}

/**
 * Number a book's chapters sequentially (1..N) in logical book order.
 *
 * Orders a copy by matter group (front -> main -> back, the same grouping
 * the ChapterSidebar shows) and, within each group, by `position` (a stable
 * sort, so chapters that share a position keep their incoming order), then
 * assigns `number = index + 1`. This is the single source of the displayed
 * chapter number AND order for the UI table, the PDF and the Markdown
 * export, so all three stay consistent with the sidebar and never show a gap,
 * a duplicate, or back-matter interleaved among the main chapters (raw
 * `position` did the last when low-position back-matter placeholders existed).
 */
export function numberChapters(chapters: ChapterMetric[]): NumberedChapterMetric[] {
  return [...chapters]
    .sort((a, b) => {
      const rankA = bookOrderRank(a.chapter_type);
      const rankB = bookOrderRank(b.chapter_type);
      if (rankA !== rankB) return rankA - rankB;
      return a.position - b.position;
    })
    .map((chapter, index) => ({ ...chapter, number: index + 1 }));
}

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

  const rows = numberChapters(metrics.chapters).map((ch) => {
    if (ch.empty) {
      return `| ${ch.number} | ${ch.chapter} | - | - | - | - | - | - | - |`;
    }
    return `| ${ch.number} | ${ch.chapter} | ${ch.word_count} | ${ch.sentence_count} | ${ch.flesch_reading_ease.toFixed(0)} | ${pct(ch.filler_ratio)} | ${pct(ch.passive_ratio)} | ${pct(ch.adverb_ratio)} | ${ch.long_sentence_count} |`;
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

/*
 * The theme-independent PDF palette (HEADER_FILL / RULE_COLOR / MUTED_COLOR /
 * SEVERITY_FILL / FLESCH_BAND_FILL) lives in `qualityThresholds.ts` (#427):
 * pdfmake cannot resolve CSS variables, so the PDF carries fixed tints that
 * render identically regardless of the active app theme.
 */

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

  const dataRows = numberChapters(metrics.chapters).map((ch) => {
    if (ch.empty) {
      return [
        cell(String(ch.number), { color: MUTED_COLOR }),
        cell(ch.chapter, { align: "left", color: MUTED_COLOR }),
        ...Array.from({ length: 7 }, () => cell("-", { color: MUTED_COLOR })),
      ];
    }
    const fillerPct = ch.filler_ratio * 100;
    const passivePct = ch.passive_ratio * 100;
    return [
      cell(String(ch.number)),
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
