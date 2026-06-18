/**
 * Traffic-light thresholds for the quality report's comparison table (#284).
 *
 * Kept as named constants (not inlined in JSX) so the boundaries are
 * documented in one place and easy to tune. Ratio-based metrics (filler,
 * passive) are expressed in PERCENT to match how the column values are fed
 * to {@link MetricsTable} (ratio * 100).
 */

import type { MetricThreshold, CellSeverity } from "../lib/components/MetricsTable";
import type { FleschBand } from "../lib/components/FleschScale";

/** Flesch reading ease: >60 good, 50-60 attention, <50 action needed. */
export const FLESCH_THRESHOLD: MetricThreshold = {
  good: 60,
  warn: 50,
  betterWhenHigher: true,
};

/** Filler-word share (%): <1 good, 1-2 attention, >2 action needed. */
export const FILLER_PCT_THRESHOLD: MetricThreshold = {
  good: 1,
  warn: 2,
  betterWhenHigher: false,
};

/** Passive-voice share (%): <2 good, 2-5 attention, >5 action needed. */
export const PASSIVE_PCT_THRESHOLD: MetricThreshold = {
  good: 2,
  warn: 5,
  betterWhenHigher: false,
};

/** Long sentences (count): <20 good, 20-30 attention, >30 action needed. */
export const LONG_SENTENCE_THRESHOLD: MetricThreshold = {
  good: 20,
  warn: 30,
  betterWhenHigher: false,
};

/* -------------------------------------------------------------------------- */
/* Quality-report PDF palette (#427)                                          */
/* -------------------------------------------------------------------------- */
/**
 * Theme-independent fill/line/text colors for the quality-report PDF.
 *
 * pdfmake renders a fixed document and cannot resolve CSS variables, so the PDF
 * carries its own hex palette (light green/amber/red severity tints + grey
 * rules) instead of the on-screen semantic theme tokens. These are color DATA,
 * not app styling, kept here so the renderer (`qualityReport.ts`) stays free of
 * inline hex and `make verify-theme` passes.
 */
export const HEADER_FILL = "#e5e5e5";
export const RULE_COLOR = "#cccccc";
export const MUTED_COLOR = "#666666";

/** Traffic-light cell fills, keyed by the same severities `MetricsTable` uses. */
export const SEVERITY_FILL: Record<CellSeverity, string> = {
  good: "#d6efdc",
  warn: "#fdeccb",
  bad: "#f7dcdc",
};

/** Flesch band fills (easiest first), mirroring the on-screen scale order. */
export const FLESCH_BAND_FILL: Record<FleschBand, string> = {
  easy: "#bfe6cb",
  readable: "#dff1e5",
  demanding: "#fce3bf",
  academic: "#f4cfcf",
};
