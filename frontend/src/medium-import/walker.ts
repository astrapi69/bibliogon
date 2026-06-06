/**
 * Client-side Medium HTML -> TipTap walker (offline Medium import, #34 P4).
 *
 * A faithful TypeScript/DOMParser port of the backend
 * `bibliogon_medium_import/walker.py`. Medium's HTML export is templated:
 * each post lives in `<article class="h-entry">` with a header (title /
 * subtitle), a `<section data-field="body">`, and a footer (canonical URL /
 * author / date). Body content is split across one-or-more
 * `<section class="section--body">` containers; each holds MULTIPLE
 * `<div class="section-inner">` divs (title lane / image lane / body), so we
 * iterate ALL of them — using only the first silently dropped ~56% of the
 * 209-post production corpus (see lessons-learned "Walker iterating repeated
 * containers: prefer find_all over find").
 *
 * Images keep their `cdn-images-1.medium.com` src (client-side download is
 * CORS-blocked; the URLs display in the editor while online). Figure nodes use
 * Bibliogon's `imageFigure` node type, NOT `image` (the editor loads the
 * Figure extension, and an `image`-typed node fails the schema — see
 * lessons-learned "TipTap image node is imageFigure").
 *
 * Two areas diverge from the backend by necessity:
 *   - Language detection is statistical in the browser via Unicode-script
 *     ranges (no langdetect): Greek -> el, Japanese kana -> ja, Cyrillic ->
 *     ru; Latin-dominant text is ambiguous (de/en/es/fr/pt/tr) -> null, so the
 *     importer falls back to its default language.
 *   - The comment heuristic is ported verbatim; comment-classified posts are
 *     skipped offline (there is no offline comment store yet).
 */

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
}

export interface TipTapDoc {
  type: "doc";
  content: TipTapNode[];
}

export interface ImageRef {
  src: string;
  alt: string;
  caption: string;
  dataImageId: string;
}

export interface ParsedPost {
  title: string;
  subtitle: string;
  canonicalUrl: string;
  publishedAt: string | null;
  author: string;
  contentDoc: TipTapDoc;
  images: ImageRef[];
  warnings: string[];
  /** ISO 639-1 code from a confident Unicode-script signal, else null. */
  detectedLanguage: string | null;
  /** True when the two-tier comment heuristic matches. */
  isComment: boolean;
}

// Medium maps user-typed H2 to graf--h3 in body (the H1 is in the header).
const HEADING_LEVELS: Record<string, number> = {
  h1: 1,
  h2: 1,
  h3: 2,
  h4: 3,
  h5: 4,
  h6: 5,
};

// Comment-detection thresholds (ported from walker.py; data-validated against
// the 209-post production corpus).
const COMMENT_BODY_LEN_THRESHOLD = 500;
const COMMENT_EXTENDED_BODY_LEN_THRESHOLD = 2000;
const COMMENT_STRUCTURAL_NODE_TYPES = new Set([
  "heading",
  "codeBlock",
  "bulletList",
  "orderedList",
  "imageFigure",
]);
const COMMENT_EXTENDED_DISQUALIFIERS = new Set([
  "heading",
  "codeBlock",
  "imageFigure",
]);
const COMMENT_SECOND_PERSON_PREFIXES = [
  "your ",
  "you ",
  "you'",
  "du ",
  "dein ",
  "deine ",
  "ihre ",
];
const COMMENT_QUESTION_OPEN_WINDOW = 200;
const COMMENT_QUESTION_CLOSE_WINDOW = 300;

/** Parse one Medium post HTML string into a ParsedPost. */
export function parseMediumPost(html: string): ParsedPost {
  return new MediumWalker().parse(html);
}

class MediumWalker {
  private warnings: string[] = [];
  private images: ImageRef[] = [];
  private titleSkipped = false;

  parse(html: string): ParsedPost {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const contentDoc = this.walkBody(doc);
    return {
      title: this.extractTitle(doc),
      subtitle: this.extractSubtitle(doc),
      canonicalUrl: this.extractCanonical(doc),
      publishedAt: this.extractDate(doc),
      author: this.extractAuthor(doc),
      contentDoc,
      images: this.images,
      warnings: this.warnings,
      detectedLanguage: detectLanguage(contentDoc),
      isComment: classifyAsComment(contentDoc),
    };
  }

  private extractTitle(doc: Document): string {
    return doc.querySelector("h1.p-name")?.textContent?.trim() ?? "";
  }

  private extractSubtitle(doc: Document): string {
    return (
      doc
        .querySelector('section[data-field="subtitle"]')
        ?.textContent?.trim() ?? ""
    );
  }

  private extractCanonical(doc: Document): string {
    return doc.querySelector("a.p-canonical")?.getAttribute("href") ?? "";
  }

  private extractDate(doc: Document): string | null {
    return (
      doc.querySelector("time.dt-published")?.getAttribute("datetime") ?? null
    );
  }

  private extractAuthor(doc: Document): string {
    return doc.querySelector("a.p-author")?.textContent?.trim() ?? "";
  }

  private walkBody(doc: Document): TipTapDoc {
    const body = doc.querySelector('section[data-field="body"]');
    if (!body) {
      this.warnings.push("body section not found");
      return { type: "doc", content: [] };
    }
    const nodes: TipTapNode[] = [];
    // Direct-child section.section--body, then ALL inner divs (title / image /
    // body lanes), then each lane's element children.
    body.querySelectorAll(":scope > section.section--body").forEach((section) => {
      section.querySelectorAll("div.section-inner").forEach((inner) => {
        for (const child of Array.from(inner.children)) {
          const node = this.walkBlock(child);
          if (node) nodes.push(node);
        }
      });
    });
    return { type: "doc", content: nodes };
  }

  private walkBlock(el: Element): TipTapNode | null {
    const name = el.tagName.toLowerCase();
    // Skip exactly one duplicated graf--title (Medium repeats the page H1).
    if (el.classList.contains("graf--title") && !this.titleSkipped) {
      this.titleSkipped = true;
      return null;
    }
    if (name === "p") return this.emitParagraph(el);
    if (name in HEADING_LEVELS) return this.emitHeading(el, name);
    if (name === "blockquote") return this.emitBlockquote(el);
    if (name === "pre") return this.emitCodeBlock(el);
    if (name === "ul" || name === "ol") return this.emitList(el, name);
    if (name === "figure") return this.emitFigure(el);
    if (name === "hr") return null;
    if (name === "div" && el.classList.contains("section-divider")) return null;

    const text = el.textContent?.trim() ?? "";
    if (text) {
      this.warnings.push(
        `unknown block element <${name}> preserved as plain paragraph`,
      );
      return { type: "paragraph", content: [{ type: "text", text }] };
    }
    return null;
  }

  private emitParagraph(el: Element): TipTapNode | null {
    const content = this.inline(el);
    if (!content.length) return null;
    return { type: "paragraph", content };
  }

  private emitHeading(el: Element, name: string): TipTapNode {
    return {
      type: "heading",
      attrs: { level: HEADING_LEVELS[name] },
      content: this.inline(el),
    };
  }

  private emitBlockquote(el: Element): TipTapNode | null {
    const inline = this.inline(el);
    if (!inline.length) return null;
    return {
      type: "blockquote",
      content: [{ type: "paragraph", content: inline }],
    };
  }

  private emitCodeBlock(el: Element): TipTapNode {
    const lang = el.getAttribute("data-code-block-lang");
    const text = extractPreText(el);
    const content: TipTapNode[] = [];
    if (text) content.push({ type: "text", text });
    const attrs: Record<string, unknown> = {};
    if (lang) attrs.language = lang;
    return { type: "codeBlock", attrs, content };
  }

  private emitList(listEl: Element, name: string): TipTapNode | null {
    const listType = name === "ul" ? "bulletList" : "orderedList";
    const items: TipTapNode[] = [];
    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      const inline = this.inline(li);
      if (!inline.length) continue;
      items.push({
        type: "listItem",
        content: [{ type: "paragraph", content: inline }],
      });
    }
    if (!items.length) return null;
    return { type: listType, content: items };
  }

  private emitFigure(figure: Element): TipTapNode | null {
    const img = figure.querySelector("img");
    const src = img?.getAttribute("src");
    if (!img || !src) return null;
    const caption = figure.querySelector("figcaption")?.textContent?.trim() ?? "";
    const alt = img.getAttribute("alt") ?? "";
    const dataImageId = img.getAttribute("data-image-id") ?? "";
    this.images.push({ src, alt, caption, dataImageId });
    const attrs: Record<string, unknown> = { src };
    if (alt) attrs.alt = alt;
    if (caption) attrs.title = caption;
    return { type: "imageFigure", attrs };
  }

  private inline(parent: Element): TipTapNode[] {
    const out: TipTapNode[] = [];
    this.inlineWalk(parent, [], out);
    return mergeAdjacentText(out);
  }

  private inlineWalk(
    node: Node,
    marks: TipTapMark[],
    out: TipTapNode[],
  ): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (!text) continue;
        const item: TipTapNode = { type: "text", text };
        if (marks.length) item.marks = [...marks];
        out.push(item);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as Element;
        if (childEl.tagName.toLowerCase() === "br") {
          out.push({ type: "hardBreak" });
          continue;
        }
        const added = marksFor(childEl);
        this.inlineWalk(childEl, [...marks, ...added], out);
      }
    }
  }
}

function marksFor(el: Element): TipTapMark[] {
  const name = el.tagName.toLowerCase();
  const cls = el.classList;
  const marks: TipTapMark[] = [];
  if (name === "strong" || cls.contains("markup--strong")) marks.push({ type: "bold" });
  if (name === "em" || cls.contains("markup--em")) marks.push({ type: "italic" });
  if (name === "code" || cls.contains("markup--code")) marks.push({ type: "code" });
  if (name === "a" || cls.contains("markup--anchor")) {
    const href = el.getAttribute("href");
    if (href) marks.push({ type: "link", attrs: { href } });
  }
  return marks;
}

function marksSignature(marks: TipTapMark[] | undefined): string {
  if (!marks || !marks.length) return "";
  // Order-insensitive, stable signature.
  return JSON.stringify([...marks].sort((a, b) => (a.type < b.type ? -1 : 1)));
}

function mergeAdjacentText(nodes: TipTapNode[]): TipTapNode[] {
  const merged: TipTapNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (
      node.type === "text" &&
      prev &&
      prev.type === "text" &&
      marksSignature(prev.marks) === marksSignature(node.marks)
    ) {
      prev.text = (prev.text ?? "") + (node.text ?? "");
    } else {
      merged.push(node);
    }
  }
  return merged;
}

/** Extract a <pre> element's text preserving <br> as newlines (Medium encodes
 *  code-block line breaks as <br>, which textContent would drop). */
function extractPreText(el: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        parts.push(child.textContent ?? "");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as Element;
        if (childEl.tagName.toLowerCase() === "br") parts.push("\n");
        else walk(childEl);
      }
    }
  };
  walk(el);
  return parts.join("");
}

// --- language detection (Unicode-script; no langdetect in the browser) -----

/** Detect the dominant body language via Unicode-script ranges. Returns an ISO
 *  639-1 code only for an unambiguous non-Latin script; Latin-dominant text
 *  (de/en/es/fr/pt/tr — indistinguishable without a statistical model) returns
 *  null so the importer falls back to its default language. */
export function detectLanguage(contentDoc: TipTapDoc): string | null {
  const text = gatherText(contentDoc);
  if (text.length < 50) return null;
  let greek = 0;
  let kana = 0;
  let cyrillic = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0370 && c <= 0x03ff) greek++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0xff66 && c <= 0xff9d)) kana++;
    else if (c >= 0x0400 && c <= 0x04ff) cyrillic++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  const total = greek + kana + cyrillic + latin;
  if (total === 0) return null;
  if (greek / total > 0.3) return "el";
  if (kana / total > 0.05) return "ja";
  if (cyrillic / total > 0.3) return "ru";
  return null;
}

function gatherText(node: unknown): string {
  const bits: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n !== "object" || n === null) return;
    const obj = n as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") bits.push(obj.text);
    const content = obj.content;
    if (Array.isArray(content)) content.forEach(walk);
  };
  walk(node);
  return bits.filter((b) => b.trim()).join(" ");
}

// --- comment classification (two-tier; ported verbatim) --------------------

/** Apply the two-tier comment-detection heuristic. Returns true when the post
 *  is comment-shaped. */
export function classifyAsComment(contentDoc: TipTapDoc): boolean {
  const { textBits, hasStructural, paragraphTexts } = scanDoc(contentDoc);
  const bodyText = textBits.filter((b) => b.trim()).join(" ");
  const bodyLen = bodyText.length;

  // Tier 1 — strict.
  if (!hasStructural && bodyLen < COMMENT_BODY_LEN_THRESHOLD) return true;

  // Tier 2 — extended conversational-marker rule.
  if (bodyLen >= COMMENT_EXTENDED_BODY_LEN_THRESHOLD) return false;
  if (hasExtendedDisqualifier(contentDoc)) return false;
  if (!paragraphTexts.length) return false;

  const firstP = paragraphTexts[0];
  const lastP = paragraphTexts[paragraphTexts.length - 1];
  const lower = firstP.toLowerCase();
  const starts2p = COMMENT_SECOND_PERSON_PREFIXES.some((p) => lower.startsWith(p));
  const qInOpen = firstP.slice(0, COMMENT_QUESTION_OPEN_WINDOW).includes("?");
  const qInClose = lastP.slice(-COMMENT_QUESTION_CLOSE_WINDOW).includes("?");
  return starts2p || qInOpen || qInClose;
}

function scanDoc(contentDoc: TipTapDoc): {
  textBits: string[];
  hasStructural: boolean;
  paragraphTexts: string[];
} {
  const textBits: string[] = [];
  let hasStructural = false;
  const paragraphTexts: string[] = [];

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    const type = obj.type;
    if (typeof type === "string" && COMMENT_STRUCTURAL_NODE_TYPES.has(type)) {
      hasStructural = true;
    }
    if (type === "text" && typeof obj.text === "string") textBits.push(obj.text);
    const content = obj.content;
    if (Array.isArray(content)) content.forEach(walk);
  };
  walk(contentDoc);

  for (const child of contentDoc.content ?? []) {
    if (child.type === "paragraph") paragraphTexts.push(gatherText(child));
  }
  return { textBits, hasStructural, paragraphTexts };
}

function hasExtendedDisqualifier(contentDoc: TipTapDoc): boolean {
  const walk = (node: unknown): boolean => {
    if (typeof node !== "object" || node === null) return false;
    const obj = node as Record<string, unknown>;
    if (typeof obj.type === "string" && COMMENT_EXTENDED_DISQUALIFIERS.has(obj.type)) {
      return true;
    }
    const content = obj.content;
    if (Array.isArray(content)) return content.some(walk);
    return false;
  };
  return walk(contentDoc);
}
