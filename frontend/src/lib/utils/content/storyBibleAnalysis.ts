/**
 * Story-Bible text analysis: entity auto-detect + continuity warnings.
 *
 * A faithful TypeScript mirror of `plugin-story-bible`'s
 * `autodetect.py` (STORY-BIBLE C14) and `continuity.py` (C11), so both
 * features work in the backendless (Dexie / GitHub Pages) build instead
 * of silently returning nothing (#732). Both are pure text/graph
 * analysis — no AI, no external service, no network.
 *
 * The functions take plain records rather than storage rows, so they are
 * testable without IndexedDB and reusable from any caller. Input order is
 * the caller's: `detectUnlinkedMentions` walks entities in the order it
 * is given, chapters before pages, exactly as the Python query loop does.
 *
 * The output shapes are the API's own `StoryEntityAutoDetectProposal` and
 * `ContinuityWarning` (type-only imports), so the compiler enforces the
 * parity this module exists to provide.
 *
 * @example
 * const proposals = detectUnlinkedMentions({ entities, chapters, pages, links });
 * const warnings = computeContinuityWarnings(pages, links);
 */

import type { ContinuityWarning, StoryEntityAutoDetectProposal } from "../../../api/types";

import { htmlToPlainText } from "./htmlToPlainText";

/**
 * Entity names shorter than this are skipped.
 *
 * One- and two-character names (initials, "I") match far too much prose
 * to be useful, and a false positive costs more trust than a missed
 * mention — the detector is deliberately conservative.
 */
export const MIN_ENTITY_NAME_LENGTH = 3;

/** Minimum absence, in pages, before a continuity warning is raised. */
export const DEFAULT_GAP_THRESHOLD = 5;

/**
 * Word characters for the mention matcher.
 *
 * Python's `\w` is Unicode-aware on `str`, JavaScript's is ASCII-only.
 * Using `\b` here would both refuse to match an entity whose name starts
 * with an umlaut (`Öko`) and happily match `mile` inside `Émile`, so the
 * boundary is checked against this class instead.
 */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** An entity as the detector needs it. */
export interface AnalysedEntity {
    id: string;
    name: string;
    entity_type: string;
}

/** A chapter as the detector needs it (`content` in any stored shape). */
export interface AnalysedChapter {
    id: string;
    title?: string | null;
    content?: string | null;
}

/** A picture-book page as the detector needs it. */
export interface AnalysedPage {
    id: string;
    position: number;
    text_content?: string | null;
}

/** An existing entity-to-page/chapter link, used to exclude known pairs. */
export interface AnalysedLink {
    entity_id: string;
    page_id?: string | null;
    chapter_id?: string | null;
}

/** The book slice `detectUnlinkedMentions` scans. */
export interface AutoDetectInput {
    entities: readonly AnalysedEntity[];
    chapters: readonly AnalysedChapter[];
    pages: readonly AnalysedPage[];
    links: readonly AnalysedLink[];
}

/** A page in reading order, for the continuity rules. */
export interface ContinuityPage {
    id: string;
    position: number;
}

/** An entity appearance on a page, for the continuity rules. */
export interface ContinuityLink {
    page_id: string;
    entity_id: string;
    entity_name?: string | null;
}

/**
 * Flatten a chapter body or page text to the prose the matcher scans.
 *
 * Mirrors `autodetect._tiptap_to_text`: TipTap JSON is walked (text
 * leaves joined with a space, a newline after every paragraph/heading),
 * HTML is stripped to prose, and anything else — legacy plain text,
 * unparseable JSON — is returned unchanged.
 */
export function storyBiblePlainText(content: string | null | undefined): string {
    if (!content) return "";
    const stripped = content.trimStart();
    if (stripped.startsWith("{")) {
        let doc: unknown;
        try {
            doc = JSON.parse(content);
        } catch {
            return content;
        }
        const parts: string[] = [];
        walkTipTap(doc, parts);
        return parts.join(" ");
    }
    if (stripped.startsWith("<")) return htmlToPlainText(content);
    return content;
}

/** Depth-first TipTap walk collecting text leaves and block breaks. */
function walkTipTap(node: unknown, parts: string[]): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const record = node as { type?: unknown; text?: unknown; content?: unknown };
    if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
    if (Array.isArray(record.content)) {
        for (const child of record.content) walkTipTap(child, parts);
    }
    if (record.type === "paragraph" || record.type === "heading") parts.push("\n");
}

/**
 * Count case-insensitive, word-bounded occurrences of `name` in `text`.
 *
 * Matches are non-overlapping and scanned left to right, the way
 * Python's `re.findall` advances: past a match on success, one character
 * on failure.
 *
 * @example
 * countEntityMentions("Tom", "Tom isst eine Tomate."); // 1
 */
export function countEntityMentions(name: string, text: string): number {
    if (!name || !text) return 0;
    const needle = name.toLowerCase();
    const haystack = text.toLowerCase();
    let count = 0;
    let from = 0;
    for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) return count;
        const before = at > 0 ? haystack[at - 1] : "";
        const after = haystack[at + needle.length] ?? "";
        if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) {
            count += 1;
            from = at + needle.length;
        } else {
            from = at + 1;
        }
    }
}

/**
 * Propose an entity-appearance link wherever an entity's name occurs in
 * a chapter or page that is not linked to it yet.
 *
 * Creating the links stays the caller's choice — the Story-Bible sidebar
 * shows the proposals and only writes them on "link automatically".
 */
export function detectUnlinkedMentions(input: AutoDetectInput): StoryEntityAutoDetectProposal[] {
    const { entities, chapters, pages, links } = input;
    if (!entities.length) return [];

    const entityIds = new Set(entities.map((entity) => entity.id));
    const linked = new Set<string>();
    for (const link of links) {
        if (!entityIds.has(link.entity_id)) continue;
        const target = link.page_id || link.chapter_id;
        if (target) linked.add(`${link.entity_id}\u0000${target}`);
    }

    const chapterText = new Map(chapters.map((c) => [c.id, storyBiblePlainText(c.content)]));
    const pageText = new Map(pages.map((p) => [p.id, storyBiblePlainText(p.text_content)]));

    const proposals: StoryEntityAutoDetectProposal[] = [];
    for (const entity of entities) {
        const name = (entity.name ?? "").trim();
        if (name.length < MIN_ENTITY_NAME_LENGTH) continue;
        for (const chapter of chapters) {
            if (linked.has(`${entity.id}\u0000${chapter.id}`)) continue;
            const occurrences = countEntityMentions(name, chapterText.get(chapter.id) ?? "");
            if (occurrences > 0) {
                proposals.push({
                    entity_id: entity.id,
                    entity_name: entity.name,
                    entity_type: entity.entity_type,
                    page_id: null,
                    chapter_id: chapter.id,
                    ref_label: chapter.title || chapter.id,
                    occurrences,
                });
            }
        }
        for (const page of pages) {
            if (linked.has(`${entity.id}\u0000${page.id}`)) continue;
            const occurrences = countEntityMentions(name, pageText.get(page.id) ?? "");
            if (occurrences > 0) {
                proposals.push({
                    entity_id: entity.id,
                    entity_name: entity.name,
                    entity_type: entity.entity_type,
                    page_id: page.id,
                    chapter_id: null,
                    ref_label: `Page ${page.position}`,
                    occurrences,
                });
            }
        }
    }
    return proposals;
}

/**
 * Advisory continuity warnings for a picture-book Storyboard.
 *
 * Three rules, all advisory and dismissable in the UI: a page with no
 * entity at all (`empty_page`), an entity absent across a long internal
 * stretch (`entity_gap`), and an entity that never returns after its last
 * appearance (`entity_disappears`).
 *
 * @param pages Every page of the book, in any order.
 * @param links Entity appearances; links to unknown pages are ignored.
 * @param options.gapThreshold Minimum absence before a gap is flagged.
 */
export function computeContinuityWarnings(
    pages: readonly ContinuityPage[],
    links: readonly ContinuityLink[],
    options: { gapThreshold?: number } = {},
): ContinuityWarning[] {
    const gapThreshold = options.gapThreshold ?? DEFAULT_GAP_THRESHOLD;
    const ordered = [...pages].sort((a, b) => a.position - b.position);
    if (!ordered.length) return [];
    const positionById = new Map(ordered.map((page) => [page.id, page.position]));
    const lastPosition = ordered[ordered.length - 1].position;
    const warnings: ContinuityWarning[] = [];

    const linkedPageIds = new Set(links.map((link) => link.page_id));
    for (const page of ordered) {
        if (!linkedPageIds.has(page.id)) {
            warnings.push({
                code: "empty_page",
                page_id: page.id,
                page_position: page.position,
            });
        }
    }

    const byEntity = new Map<string, { name: string; appearances: [number, string][] }>();
    for (const link of links) {
        const position = positionById.get(link.page_id);
        if (position === undefined) continue;
        let entry = byEntity.get(link.entity_id);
        if (!entry) {
            entry = { name: link.entity_name ?? "", appearances: [] };
            byEntity.set(link.entity_id, entry);
        }
        entry.appearances.push([position, link.page_id]);
    }

    for (const [entityId, entry] of byEntity) {
        const appearances = entry.appearances.sort(
            (a, b) => a[0] - b[0] || a[1].localeCompare(b[1]),
        );
        for (let i = 0; i < appearances.length - 1; i += 1) {
            const [previousPosition, previousPage] = appearances[i];
            const [nextPosition] = appearances[i + 1];
            if (nextPosition - previousPosition - 1 >= gapThreshold) {
                warnings.push({
                    code: "entity_gap",
                    page_id: previousPage,
                    page_position: previousPosition,
                    entity_id: entityId,
                    entity_name: entry.name,
                    gap_to_position: nextPosition,
                });
            }
        }
        const [finalPosition, finalPage] = appearances[appearances.length - 1];
        if (lastPosition - finalPosition >= gapThreshold) {
            warnings.push({
                code: "entity_disappears",
                page_id: finalPage,
                page_position: finalPosition,
                entity_id: entityId,
                entity_name: entry.name,
            });
        }
    }

    return warnings;
}
