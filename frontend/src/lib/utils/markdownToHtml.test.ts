import { describe, it, expect } from "vitest";
import { markdownToHtml } from "./markdownToHtml";

describe("markdownToHtml", () => {
    it("converts headings of all levels", () => {
        expect(markdownToHtml("# H1")).toBe("<h1>H1</h1>");
        expect(markdownToHtml("###### H6")).toBe("<h6>H6</h6>");
    });

    it("converts inline emphasis", () => {
        expect(markdownToHtml("a **b** c")).toBe("<p>a <strong>b</strong> c</p>");
        expect(markdownToHtml("a *b* c")).toBe("<p>a <em>b</em> c</p>");
        expect(markdownToHtml("a ~~b~~ c")).toBe("<p>a <s>b</s> c</p>");
        expect(markdownToHtml("a `b` c")).toBe("<p>a <code>b</code> c</p>");
    });

    it("converts links", () => {
        expect(markdownToHtml("[text](http://x)")).toBe('<p><a href="http://x">text</a></p>');
    });

    it("converts unordered and ordered lists", () => {
        expect(markdownToHtml("- one\n- two")).toBe("<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
        expect(markdownToHtml("1. one\n2. two")).toBe("<ol>\n<li>one</li>\n<li>two</li>\n</ol>");
    });

    it("converts blockquotes", () => {
        expect(markdownToHtml("> quoted")).toBe("<blockquote><p>quoted</p></blockquote>");
    });

    it("converts horizontal rules", () => {
        expect(markdownToHtml("---")).toBe("<hr>");
    });

    it("converts fenced code blocks and escapes angle brackets", () => {
        expect(markdownToHtml("```\n<a>\n```")).toBe("<pre><code>&lt;a&gt;</code></pre>");
    });

    it("promotes a standalone image with an italic caption to a figure", () => {
        expect(markdownToHtml("![alt](src)\n*caption*")).toBe(
            '<figure><img src="src" alt="alt" /><figcaption>caption</figcaption></figure>',
        );
    });

    it("renders a standalone image without a caption as a bare img", () => {
        expect(markdownToHtml("![alt](src)")).toBe('<img src="src" alt="alt" />');
    });
});
