/**
 * Client Medium walker tests (offline import #34 P4). Ported from the
 * backend walker's regression coverage — pins the corpus-validated quirks:
 * multiple section-inner lanes, imageFigure node type, code-block <br>,
 * graf--title skip, inline marks, comment heuristic, Unicode-script language.
 */

import { describe, it, expect } from "vitest";

import {
  classifyAsComment,
  detectLanguage,
  parseMediumPost,
  type TipTapDoc,
  type TipTapNode,
} from "./walker";

/** Wrap body inner-lane HTML in the Medium post envelope. */
function post(
  bodyInners: string,
  opts: {
    title?: string;
    subtitle?: string;
    author?: string;
    canonical?: string;
    date?: string;
  } = {},
): string {
  const {
    title = "My Post",
    subtitle = "A subtitle",
    author = "Jane Doe",
    canonical = "https://medium.com/@jane/my-post-abc123",
    date = "2020-06-01T10:00:00.000Z",
  } = opts;
  return `<!doctype html><html><body><article class="h-entry">
    <header><h1 class="p-name">${title}</h1></header>
    <section data-field="subtitle" class="p-summary">${subtitle}</section>
    <section data-field="body" class="e-content">
      <section name="s1" class="section section--body section--first section--last">
        <div class="section-divider"><hr></div>
        <div class="section-content">${bodyInners}</div>
      </section>
    </section>
    <footer>
      <a class="p-author" href="https://medium.com/@jane">${author}</a>
      <a class="p-canonical" href="${canonical}">Canonical</a>
      <time class="dt-published" datetime="${date}">Jun 1, 2020</time>
    </footer>
  </article></body></html>`;
}

const inner = (html: string) =>
  `<div class="section-inner sectionLayout--insetColumn">${html}</div>`;

const allText = (doc: TipTapDoc): string => {
  const bits: string[] = [];
  const walk = (n: TipTapNode | TipTapDoc) => {
    if ("text" in n && n.text) bits.push(n.text);
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return bits.join(" ");
};

describe("parseMediumPost — metadata", () => {
  it("extracts title, subtitle, author, canonical, date", () => {
    const parsed = parseMediumPost(post(inner('<p class="graf graf--p">Hello.</p>')));
    expect(parsed.title).toBe("My Post");
    expect(parsed.subtitle).toBe("A subtitle");
    expect(parsed.author).toBe("Jane Doe");
    expect(parsed.canonicalUrl).toBe("https://medium.com/@jane/my-post-abc123");
    expect(parsed.publishedAt).toBe("2020-06-01T10:00:00.000Z");
  });
});

describe("parseMediumPost — body structure", () => {
  it("captures content across MULTIPLE section-inner lanes (find_all, not find)", () => {
    // Lane 1: duplicated title (skipped). Lane 2: image. Lane 3: the body.
    // The old find-first bug would skip the title lane and drop the rest.
    const body =
      inner('<h3 class="graf graf--h3 graf--title">My Post</h3>') +
      inner(
        '<figure class="graf graf--figure"><img src="https://cdn-images-1.medium.com/x.png" data-image-id="x"></figure>',
      ) +
      inner('<p class="graf graf--p">The real body paragraph.</p>');
    const parsed = parseMediumPost(post(body));
    const types = parsed.contentDoc.content.map((n) => n.type);
    // Title lane skipped once; image + paragraph survive.
    expect(types).toEqual(["imageFigure", "paragraph"]);
    expect(allText(parsed.contentDoc)).toContain("The real body paragraph.");
  });

  it("emits imageFigure (NOT image) with src/alt/caption + records the image", () => {
    const body = inner(
      '<figure class="graf graf--figure"><img src="https://cdn-images-1.medium.com/p.png" alt="Alt" data-image-id="id1"><figcaption>Cap</figcaption></figure>',
    );
    const parsed = parseMediumPost(post(body));
    const fig = parsed.contentDoc.content[0];
    expect(fig.type).toBe("imageFigure");
    expect(fig.attrs).toEqual({
      src: "https://cdn-images-1.medium.com/p.png",
      alt: "Alt",
      title: "Cap",
    });
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].src).toBe("https://cdn-images-1.medium.com/p.png");
  });

  it("graf--h3 becomes heading level 2", () => {
    const parsed = parseMediumPost(
      post(inner('<h3 class="graf graf--h3">Section</h3>')),
    );
    expect(parsed.contentDoc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
  });

  it("preserves <br> as newlines inside a code block + carries the language", () => {
    const body = inner(
      '<pre class="graf graf--pre" data-code-block-lang="python">def f():<br>    return 1</pre>',
    );
    const parsed = parseMediumPost(post(body));
    const code = parsed.contentDoc.content[0];
    expect(code.type).toBe("codeBlock");
    expect(code.attrs).toEqual({ language: "python" });
    expect(code.content?.[0].text).toBe("def f():\n    return 1");
  });

  it("converts ul/ol to bulletList/orderedList of listItems", () => {
    const body = inner(
      '<ul class="postList"><li class="graf graf--li">One</li><li class="graf graf--li">Two</li></ul>',
    );
    const parsed = parseMediumPost(post(body));
    const list = parsed.contentDoc.content[0];
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content?.[0].type).toBe("listItem");
  });

  it("captures inline marks incl. nested bold+italic + links", () => {
    const body = inner(
      '<p class="graf graf--p">plain <strong>bold <em>both</em></strong> and <a class="markup--anchor" href="https://x.com">link</a></p>',
    );
    const parsed = parseMediumPost(post(body));
    const para = parsed.contentDoc.content[0];
    const both = para.content?.find((n) => n.text === "both");
    expect(both?.marks?.map((m) => m.type).sort()).toEqual(["bold", "italic"]);
    const link = para.content?.find((n) => n.text === "link");
    expect(link?.marks?.[0]).toEqual({
      type: "link",
      attrs: { href: "https://x.com" },
    });
  });

  it("warns + falls back to a plain paragraph for an unknown block", () => {
    const parsed = parseMediumPost(post(inner("<table><tr><td>cell</td></tr></table>")));
    expect(parsed.contentDoc.content[0].type).toBe("paragraph");
    expect(parsed.warnings.some((w) => w.includes("unknown block"))).toBe(true);
  });
});

describe("classifyAsComment", () => {
  const doc = (content: TipTapNode[]): TipTapDoc => ({ type: "doc", content });
  const para = (text: string): TipTapNode => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });

  it("tier 1: short body, no structural nodes -> comment", () => {
    expect(classifyAsComment(doc([para("Thanks, great post!")]))).toBe(true);
  });

  it("tier 1: a heading disqualifies even a short body", () => {
    expect(
      classifyAsComment(
        doc([{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] }]),
      ),
    ).toBe(false);
  });

  it("tier 2: longer reply opening with a second-person address -> comment", () => {
    const longReply = "Your analysis here is sharp. " + "More words. ".repeat(40);
    expect(classifyAsComment(doc([para(longReply)]))).toBe(true);
  });

  it("a long article paragraph with no conversational marker -> not a comment", () => {
    const article = "This essay examines the subject in depth. " + "More prose. ".repeat(60);
    expect(classifyAsComment(doc([para(article)]))).toBe(false);
  });
});

describe("detectLanguage (Unicode-script)", () => {
  const para = (text: string): TipTapDoc => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  it("returns el for Greek-dominant text", () => {
    expect(detectLanguage(para("Καλημέρα κόσμε, αυτό είναι ένα δοκιμαστικό κείμενο στα ελληνικά."))).toBe(
      "el",
    );
  });

  it("returns ja for Japanese kana text", () => {
    // >50 chars (the detection gate); real Japanese articles are long.
    expect(
      detectLanguage(
        para(
          "これはテストです。日本語のテキストをここに書いています。ひらがなとカタカナが含まれているので、言語は日本語として検出されるはずです。",
        ),
      ),
    ).toBe("ja");
  });

  it("returns null for Latin-dominant text (ambiguous de/en/...)", () => {
    expect(
      detectLanguage(para("This is a fairly long English sentence that should not be classified by script.")),
    ).toBeNull();
  });

  it("returns null for text too short to score", () => {
    expect(detectLanguage(para("Hi"))).toBeNull();
  });
});
