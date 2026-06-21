/**
 * Vitest coverage for formatLocaleDate / formatLocaleDateTime.
 *
 * Pins:
 * - 8 i18n lang codes each resolve to a sensible BCP47 locale.
 * - Unknown lang code falls back to undefined (browser default).
 * - Empty / null / undefined input returns "".
 * - Unparseable string returns the raw string.
 * - Custom options override the date-only / date-time defaults.
 */

import {describe, it, expect} from "vitest";
import {
    formatLocaleDate,
    formatLocaleDateTime,
    resolveLocale,
} from "./formatDate";

describe("resolveLocale", () => {
    it.each([
        ["de", "de-DE"],
        ["en", "en-US"],
        ["es", "es-ES"],
        ["fr", "fr-FR"],
        ["el", "el-GR"],
        ["pt", "pt-PT"],
        ["tr", "tr-TR"],
        ["ja", "ja-JP"],
    ])("maps lang %s to locale %s", (lang, expected) => {
        expect(resolveLocale(lang)).toBe(expected);
    });

    it("returns undefined for unknown lang code", () => {
        expect(resolveLocale("xx")).toBeUndefined();
    });

    it("returns undefined when lang is undefined", () => {
        expect(resolveLocale(undefined)).toBeUndefined();
    });
});

describe("formatLocaleDate", () => {
    it("returns empty string for null input", () => {
        expect(formatLocaleDate(null, "de")).toBe("");
    });

    it("returns empty string for undefined input", () => {
        expect(formatLocaleDate(undefined, "de")).toBe("");
    });

    it("returns raw string for unparseable input", () => {
        expect(formatLocaleDate("not-a-date", "de")).toBe("not-a-date");
    });

    it("renders a date string in German locale when lang=de", () => {
        const out = formatLocaleDate("2026-03-15T10:30:00Z", "de");
        // German short-month abbreviation contains "Mär" or "März"
        // depending on Intl impl; either is fine, just assert non-
        // English shape.
        expect(out).toMatch(/Mär|März/);
    });

    it("renders a date string in English locale when lang=en", () => {
        const out = formatLocaleDate("2026-03-15T10:30:00Z", "en");
        expect(out).toMatch(/Mar/);
    });

    it("respects a custom options override", () => {
        const out = formatLocaleDate("2026-03-15T10:30:00Z", "en", {
            year: "numeric",
        });
        // Only year asked for; output should not carry month.
        expect(out).toMatch(/^2026$/);
    });
});

describe("formatLocaleDateTime", () => {
    it("returns empty string for null input", () => {
        expect(formatLocaleDateTime(null, "de")).toBe("");
    });

    it("includes time digits by default", () => {
        const out = formatLocaleDateTime("2026-03-15T10:30:00Z", "en");
        expect(out).toMatch(/\d{1,2}:\d{2}/);
    });

    it("returns raw string for unparseable input", () => {
        expect(formatLocaleDateTime("not-a-date", "en")).toBe("not-a-date");
    });
});
