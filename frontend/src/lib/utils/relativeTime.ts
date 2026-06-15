/**
 * Locale-aware relative time formatting (#314).
 *
 * Pure, framework-free. Uses the platform `Intl.RelativeTimeFormat`, so it is
 * correct in every locale Bibliogon ships (de/en/es/fr/el/pt/tr/ja) without a
 * manual translation catalog — "vor 2 Minuten" / "2 minutes ago" / "gestern" /
 * "yesterday" are produced natively (`numeric: "auto"`).
 */

interface Division {
  /** Upper bound (exclusive) in seconds for choosing this unit. */
  limit: number;
  /** Seconds per one unit. */
  perUnit: number;
  unit: Intl.RelativeTimeFormatUnit;
}

const DIVISIONS: Division[] = [
  { limit: 60, perUnit: 1, unit: "second" },
  { limit: 3600, perUnit: 60, unit: "minute" },
  { limit: 86400, perUnit: 3600, unit: "hour" },
  { limit: 604800, perUnit: 86400, unit: "day" },
  { limit: 2629800, perUnit: 604800, unit: "week" },
  { limit: 31557600, perUnit: 2629800, unit: "month" },
  { limit: Infinity, perUnit: 31557600, unit: "year" },
];

export interface RelativeTimeOptions {
  /** Reference "now" (defaults to the current time). */
  now?: Date;
  /** BCP47 locale (e.g. "de"); defaults to the runtime locale. */
  locale?: string;
}

/**
 * Format a past (or future) date relative to now, localized.
 *
 * @param date - The timestamp to describe.
 * @param options - Reference time + locale.
 * @returns A localized string like "vor 2 Minuten" / "yesterday".
 *
 * @example
 * ```ts
 * formatRelativeTime(twoHoursAgo, { locale: "de" }); // "vor 2 Stunden"
 * ```
 */
export function formatRelativeTime(
  date: Date,
  options: RelativeTimeOptions = {},
): string {
  const now = options.now ?? new Date();
  const rtf = new Intl.RelativeTimeFormat(options.locale, { numeric: "auto" });
  const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(deltaSeconds);
  for (const division of DIVISIONS) {
    if (abs < division.limit) {
      return rtf.format(Math.round(deltaSeconds / division.perUnit), division.unit);
    }
  }
  return rtf.format(0, "second");
}
