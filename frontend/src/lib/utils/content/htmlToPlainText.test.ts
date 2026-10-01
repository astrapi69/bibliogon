import { describe, expect, it } from "vitest";

import { htmlToPlainText } from "./htmlToPlainText";

describe("htmlToPlainText", () => {
    it("strips inline tags and keeps the prose (backend doctest parity)", () => {
        expect(htmlToPlainText("<p>Hello <strong>world</strong>.</p>")).toBe("Hello world.");
    });

    it("emits one line per block element and drops empty ones", () => {
        expect(htmlToPlainText("<h1>Titel</h1><p>Erster</p><p></p><p>Zweiter</p>")).toBe(
            "Titel\nErster\nZweiter",
        );
    });

    it("collapses internal whitespace within a line", () => {
        expect(htmlToPlainText("<p>viel\n   Abstand\t hier</p>")).toBe("viel Abstand hier");
    });

    it("decodes character references", () => {
        expect(htmlToPlainText("<p>Caf&eacute; &amp; Bar</p>")).toBe("Café & Bar");
    });

    it("drops attribute values, so a name in an href is not prose", () => {
        expect(htmlToPlainText('<p>Siehe <a href="/wiki/Mueller">dort</a>.</p>')).toBe(
            "Siehe dort.",
        );
    });

    it("skips script and style content", () => {
        expect(
            htmlToPlainText("<style>p{color:red}</style><p>Text</p><script>var x=1</script>"),
        ).toBe("Text");
    });

    it("joins adjacent inline tags with a space so split names stay matchable", () => {
        expect(htmlToPlainText("<p><em>Frau</em> <strong>Mueller</strong></p>")).toBe(
            "Frau Mueller",
        );
    });

    // Was the port's one divergence until #913 fixed the backend the same
    // way; now a parity pin. All three spellings break exactly once.
    it("treats <br> as a line break, however it is spelled", () => {
        expect(htmlToPlainText("<p>Erste<br>Zweite</p>")).toBe("Erste\nZweite");
        expect(htmlToPlainText("<p>Erste<br/>Zweite</p>")).toBe("Erste\nZweite");
        expect(htmlToPlainText("<p>Erste<br></br>Zweite</p>")).toBe("Erste\nZweite");
    });

    it("keeps list items on separate lines", () => {
        expect(htmlToPlainText("<ul><li>Eins</li><li>Zwei</li></ul>")).toBe("Eins\nZwei");
    });

    it("returns an empty string for empty or whitespace-only input", () => {
        expect(htmlToPlainText("")).toBe("");
        expect(htmlToPlainText("   \n  ")).toBe("");
    });

    it("passes markup-free text through unchanged", () => {
        expect(htmlToPlainText("Nur Text")).toBe("Nur Text");
    });
});
