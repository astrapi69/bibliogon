import {describe, it, expect} from "vitest";

import {eventLabel} from "./AudioExportProgress";
import type {AudiobookEvent} from "../contexts/AudiobookJobContext";

const t = (_key: string, fallback: string) => fallback;

function ev(type: AudiobookEvent["type"], data: Record<string, unknown>): AudiobookEvent {
    return {type, data};
}

describe("eventLabel", () => {
    it("formats chapter_start as '01 | Title <generating>'", () => {
        const result = eventLabel(ev("chapter_start", {index: 1, title: "Vorwort"}), 12, t);
        // The exact "generating" word comes from i18n; we just want to
        // verify the prefix shape and that the title is intact.
        expect(result.startsWith("01 | Vorwort")).toBe(true);
    });

    it("formats chapter_done with the duration when reported", () => {
        const result = eventLabel(
            ev("chapter_done", {index: 1, title: "Vorwort", duration_seconds: 12.3}),
            12, t,
        );
        expect(result).toContain("01 | Vorwort");
        expect(result).toContain("12.3s");
    });

    it("never says 'Kapitel X:' anywhere in the rendered output", () => {
        // Regression: the old format was "Kapitel 1: Vorwort". The new
        // format is the bare prefix "01 | Vorwort" instead.
        const result = eventLabel(ev("chapter_start", {index: 1, title: "Vorwort"}), 12, t);
        expect(result).not.toContain("Kapitel 1:");
        expect(result).not.toContain("Chapter 1:");
    });

    it("uses three-digit padding for books with 100+ chapters", () => {
        const result = eventLabel(ev("chapter_start", {index: 7, title: "Foo"}), 150, t);
        expect(result.startsWith("007 | Foo")).toBe(true);
    });

    it("renders skipped chapters with the same prefix style", () => {
        const result = eventLabel(
            ev("chapter_skipped", {index: 5, title: "Glossar", reason: "type"}),
            20, t,
        );
        expect(result).toContain("05 | Glossar");
    });
});
