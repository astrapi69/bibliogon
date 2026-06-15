/**
 * Traffic-light thresholds for the quality report's comparison table (#284).
 *
 * Kept as named constants (not inlined in JSX) so the boundaries are
 * documented in one place and easy to tune. Ratio-based metrics (filler,
 * passive) are expressed in PERCENT to match how the column values are fed
 * to {@link MetricsTable} (ratio * 100).
 */

import type { MetricThreshold } from "../lib/components/MetricsTable";

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
