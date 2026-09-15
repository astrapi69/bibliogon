// @vitest-environment jsdom
//
// happy-dom, the suite default, breaks DOMPurify >= 3.4.12: sanitize()
// silently stops removing <script> and strips allowed tags instead, while
// isSupported stays true (#718). The sanitization cases below would report
// a surviving <script> that production never renders.
/**
 * HtmlFieldWithPreview shape handling (#814).
 *
 * The three marketing fields that share this component hold either HTML
 * or Markdown depending on how the value arrived: `html_description`
 * comes from a `.html` sidecar, `backpage_description` and
 * `backpage_author_bio` from `.md` sidecars stored verbatim, and the
 * user can paste either shape into any of them afterwards. The preview
 * used to hand every value to DOMPurify as HTML, so a Markdown value
 * rendered its literal syntax (`**fett**`) instead of formatted text.
 *
 * These cases assert the rendered OUTPUT of the preview pane, not that a
 * converter was called - a regression that re-introduces the raw-HTML
 * path fails on the visible text.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fb: string) => fb, lang: "de", setLang: vi.fn() }),
}));

import { HtmlFieldWithPreview } from "./HtmlField";

function showPreview(value: string): HTMLElement {
    render(<HtmlFieldWithPreview label="Rückseitentext" value={value} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("html-preview-toggle"));
    return screen.getByTestId("html-field-preview");
}

describe("HtmlFieldWithPreview preview shape detection", () => {
    it("formats a Markdown value instead of showing its syntax", () => {
        const preview = showPreview("Ein **fetter** Hinweis.");

        expect(preview.querySelector("strong")?.textContent).toBe("fetter");
        expect(preview.textContent).not.toContain("**");
    });

    it("formats a Markdown list rather than leaving the dashes visible", () => {
        const preview = showPreview("- erster Punkt\n- zweiter Punkt");

        expect(preview.querySelectorAll("li")).toHaveLength(2);
        expect(preview.textContent).toContain("erster Punkt");
        expect(preview.textContent).not.toContain("- erster");
    });

    it("renders an HTML value unchanged", () => {
        const preview = showPreview("<p>Ein <b>fetter</b> Hinweis.</p>");

        expect(preview.querySelector("b")?.textContent).toBe("fetter");
        expect(preview.textContent).toBe("Ein fetter Hinweis.");
    });

    it("renders plain prose as text, with no stray markup or syntax", () => {
        const preview = showPreview("Nur ein Satz ohne Auszeichnung.");

        expect(preview.textContent).toBe("Nur ein Satz ohne Auszeichnung.");
    });

    it("keeps sanitizing: a script in a Markdown value never survives", () => {
        const preview = showPreview('Ein **Satz**.\n\n<script>alert("xss")</script>');

        expect(preview.querySelector("script")).toBeNull();
        expect(preview.textContent).not.toContain("alert");
    });

    it("keeps sanitizing: a script in an HTML value never survives", () => {
        const preview = showPreview('<b>safe</b><script>alert("xss")</script>');

        expect(preview.querySelector("script")).toBeNull();
        expect(preview.textContent).toBe("safe");
    });

    it("shows an empty preview for an empty value", () => {
        const preview = showPreview("");

        expect(preview.textContent).toBe("");
    });
});
