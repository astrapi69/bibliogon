// @vitest-environment jsdom
//
// jsdom, not the happy-dom default: under happy-dom DOMPurify >= 3.4.12
// keeps <script> and drops allowed tags (see BookMetadataEditor.test.tsx).

import { describe, expect, it } from "vitest";

import { KDP_DESCRIPTION_TAGS, kdpRejectedTags, toKdpHtml } from "./kdpHtml";

describe("KDP_DESCRIPTION_TAGS", () => {
    it("is the list KDP's 'Supported HTML' help names, nothing more (#1119)", () => {
        expect([...KDP_DESCRIPTION_TAGS].sort()).toEqual(
            ["b", "br", "em", "h4", "h5", "h6", "i", "li", "ol", "p", "u", "ul"].sort(),
        );
    });

    it("does not contain strong or h1-h3, which KDP rejects", () => {
        for (const tag of ["strong", "h1", "h2", "h3", "blockquote"]) {
            expect(KDP_DESCRIPTION_TAGS).not.toContain(tag);
        }
    });
});

describe("toKdpHtml", () => {
    it("rewrites strong to b instead of dropping the emphasis", () => {
        expect(toKdpHtml("<p><strong>Wichtig</strong> und mehr</p>")).toBe(
            "<p><b>Wichtig</b> und mehr</p>",
        );
    });

    it("rewrites h1 to h3 to the largest heading KDP accepts", () => {
        expect(toKdpHtml("<h1>A</h1><h2>B</h2><h3>C</h3>")).toBe("<h4>A</h4><h4>B</h4><h4>C</h4>");
    });

    it("keeps the tags KDP accepts unchanged", () => {
        const html =
            "<p><b>b</b> <i>i</i> <em>e</em> <u>u</u><br></p><ul><li>x</li></ul><h5>h</h5>";
        expect(toKdpHtml(html)).toBe(html);
    });

    it("drops an unsupported tag but keeps its text", () => {
        expect(toKdpHtml("<blockquote>Zitat</blockquote>")).toBe("Zitat");
    });

    it("strips scripts and every attribute", () => {
        expect(toKdpHtml('<p class="x" onclick="y()">t</p><script>alert(1)</script>')).toBe(
            "<p>t</p>",
        );
    });

    it("handles nesting: strong inside h2", () => {
        expect(toKdpHtml("<h2><strong>T</strong></h2>")).toBe("<h4><b>T</b></h4>");
    });

    it("returns an empty string for empty input", () => {
        expect(toKdpHtml("")).toBe("");
    });
});

describe("kdpRejectedTags", () => {
    it("lists every tag KDP would reject, once, sorted", () => {
        expect(
            kdpRejectedTags(
                "<h2>T</h2><p><strong>a</strong><strong>b</strong></p><blockquote>q</blockquote>",
            ),
        ).toEqual(["blockquote", "h2", "strong"]);
    });

    it("is empty for a description KDP accepts", () => {
        expect(kdpRejectedTags("<p><b>ok</b></p><ul><li>x</li></ul>")).toEqual([]);
    });

    it("is empty for plain text and for an empty value", () => {
        expect(kdpRejectedTags("nur Text")).toEqual([]);
        expect(kdpRejectedTags("")).toEqual([]);
    });

    it("ignores letter case in tag names", () => {
        expect(kdpRejectedTags("<STRONG>x</STRONG>")).toEqual(["strong"]);
    });
});
