import { describe, it, expect } from "vitest";

import { formatRelativeTime } from "./relativeTime";

const NOW = new Date("2026-06-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("formats minutes/hours/days in English", () => {
    expect(formatRelativeTime(ago(2 * MIN), { now: NOW, locale: "en" })).toBe(
      "2 minutes ago",
    );
    expect(formatRelativeTime(ago(3 * HOUR), { now: NOW, locale: "en" })).toBe(
      "3 hours ago",
    );
    expect(formatRelativeTime(ago(5 * DAY), { now: NOW, locale: "en" })).toBe(
      "5 days ago",
    );
  });

  it("uses numeric:auto for 'yesterday'", () => {
    expect(formatRelativeTime(ago(DAY), { now: NOW, locale: "en" })).toBe(
      "yesterday",
    );
    expect(formatRelativeTime(ago(DAY), { now: NOW, locale: "de" })).toBe(
      "gestern",
    );
  });

  it("localizes to German", () => {
    expect(formatRelativeTime(ago(2 * MIN), { now: NOW, locale: "de" })).toBe(
      "vor 2 Minuten",
    );
    expect(formatRelativeTime(ago(3 * HOUR), { now: NOW, locale: "de" })).toBe(
      "vor 3 Stunden",
    );
  });

  it("handles 'just now' for sub-minute deltas", () => {
    // numeric:auto renders 0 seconds as "now"/"jetzt".
    expect(formatRelativeTime(ago(2000), { now: NOW, locale: "en" })).toContain(
      "ago",
    );
    expect(formatRelativeTime(NOW, { now: NOW, locale: "en" })).toBe("now");
  });
});
