/**
 * Pure builders for the downloadable readability/quality report.
 *
 * `buildQualityReportMarkdown` renders a {@link ChapterMetricsResponse} as a
 * Markdown document (summary metrics + a per-chapter table) matching what the
 * Quality tab shows on screen. `buildQualityReportDocument` maps the same data
 * onto the client-side {@link ExportDocument} model so the existing PDF engine
 * (`toPdfBlob`) can render it without a backend round-trip.
 *
 * Both functions are framework-free and synchronous so they can be unit-tested
 * in isolation.
 */

import type { ChapterMetricsResponse } from "../api/client";
import type { ExportDocument, TipTapNode } from "../export/documentModel";
import { rankSentences, sentenceAnchor } from "../lib/utils/sentenceComplexity";

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
  ].join("\n");
}

function paragraph(text: string): TipTapNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/**
 * Map the quality report onto an {@link ExportDocument} for the PDF engine.
 *
 * The on-screen table is flattened into one paragraph per chapter (a table
 * layout is not part of the shared TipTap export model); the summary becomes
 * a leading paragraph block.
 *
 * @param metrics - The chapter metrics response.
 * @param labels - Localized column/summary labels.
 * @returns An {@link ExportDocument} ready for `toPdfBlob`.
 */
export function buildQualityReportDocument(
  metrics: ChapterMetricsResponse,
  labels: QualityReportLabels,
): ExportDocument {
  const summary = summaryLines(metrics, labels).map((line) =>
    paragraph(line.replace(/\*\*/g, "")),
  );

  const chapterParagraphs = metrics.chapters.map((ch) => {
    if (ch.empty) {
      return paragraph(`${ch.position + 1}. ${ch.chapter} — -`);
    }
    const parts = [
      `${labels.words}: ${ch.word_count}`,
      `${labels.colSentences}: ${ch.sentence_count}`,
      `${labels.flesch}: ${ch.flesch_reading_ease.toFixed(0)}`,
      `${labels.colFiller}: ${pct(ch.filler_ratio)}`,
      `${labels.colPassive}: ${pct(ch.passive_ratio)}`,
      `${labels.colAdverb}: ${pct(ch.adverb_ratio)}`,
      `${labels.colLong}: ${ch.long_sentence_count}`,
    ];
    return paragraph(`${ch.position + 1}. ${ch.chapter} — ${parts.join(" · ")}`);
  });

  const nestedParagraphs: TipTapNode[] = [];
  for (const ch of metrics.chapters) {
    const ranked = rankSentences(
      (ch.long_sentences ?? []).map((s) => s.text),
      10,
    );
    if (ranked.length === 0) continue;
    if (nestedParagraphs.length === 0) {
      nestedParagraphs.push(paragraph(labels.nestedTitle));
    }
    nestedParagraphs.push(paragraph(ch.chapter));
    for (const sentence of ranked) {
      const words = labels.nestedWords.replace(
        "{count}",
        String(sentence.wordCount),
      );
      const clauses = labels.nestedClauses.replace(
        "{count}",
        String(sentence.clauseCount),
      );
      nestedParagraphs.push(
        paragraph(`"${sentenceAnchor(sentence.text)}" — ${words} · ${clauses}`),
      );
    }
  }

  return {
    title: labels.title,
    subtitle: metrics.book_title || undefined,
    sections: [
      {
        heading: "",
        doc: {
          type: "doc",
          content: [...summary, ...chapterParagraphs, ...nestedParagraphs],
        },
      },
    ],
  };
}
