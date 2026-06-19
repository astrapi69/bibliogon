/**
 * AI Story Bible + Storyboard extraction orchestrator (#374).
 *
 * Reads a book's chapters through the storage seam, asks the configured AI
 * provider to extract structured story elements, and returns a preview the
 * user reviews before anything is persisted. The actual AI call dispatches by
 * storage mode — `api.ai.generate` (backend key) online, browser-direct
 * `aiChat` (the user's own key in IndexedDB) offline — mirroring the
 * established offline-aiFill split. The apply step writes through the seam, so
 * it works identically in both modes.
 *
 * Existing Story Bible entries are never overwritten: a proposed entity whose
 * (type, name) already exists is marked `existing` and skipped on apply, so
 * the AI augments rather than clobbers.
 */

import { getStorage } from "../storage";
import type { Chapter, RelationshipType, StoryEntityRelationship } from "../api/client";
import { AiClientError, type AiChatMessage } from "./llmClient";
import { aiComplete, AiNotConfiguredError } from "./aiComplete";
import { extractBodyText, parseAiObject } from "./templateApply";
import {
    buildStoryBibleMessages,
    buildStoryboardMessages,
    type ChapterCorpusEntry,
} from "./storyExtractionPrompts";
import { STORY_BEATS } from "../components/StoryboardAnnotations";

/** Char budget per AI request. Long books are split into several requests
 *  (one progress step each); short books fit in a single request. */
const CHAR_BUDGET = 14000;
const RESPONSE_MAX_TOKENS = 2048;

/** Entity-type ids (story-bible-entities.yaml SSoT) the extraction maps onto. */
const ENTITY_TYPE = {
    character: "character",
    setting: "setting",
    plotPoint: "plot_point",
    lore: "lore",
} as const;

/** Valid relationship types (mirrors the backend `RelationshipType` Literal). */
const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
    "ally",
    "rival",
    "family",
    "mentor",
    "romantic",
    "neutral",
];

/** Coerce a free-text relationship label from the model onto a valid type,
 *  defaulting to `neutral` so a creative label never trips backend validation. */
function normalizeRelationshipType(raw: string): RelationshipType {
    const lower = raw.trim().toLowerCase();
    const direct = RELATIONSHIP_TYPES.find((type) => type === lower);
    if (direct) return direct;
    if (/friend|ally|companion/.test(lower)) return "ally";
    if (/rival|enemy|foe|antagonist/.test(lower)) return "rival";
    if (/family|parent|sibling|brother|sister|mother|father|son|daughter/.test(lower)) {
        return "family";
    }
    if (/mentor|teacher|student|mentee|master|apprentice/.test(lower)) return "mentor";
    if (/roman|lover|partner|spouse|love/.test(lower)) return "romantic";
    return "neutral";
}

/** Error codes the UI maps to a localized message. */
export type StoryExtractionErrorCode = "no_chapters" | "no_content" | "not_configured";

/** A typed extraction failure that the button surfaces with an i18n message. */
export class StoryExtractionError extends Error {
    constructor(readonly code: StoryExtractionErrorCode) {
        super(code);
        this.name = "StoryExtractionError";
    }
}

export type ExtractionTarget = "story-bible" | "storyboard";

/** Progress callback: invoked once per AI request with 1-based step + total. */
export type ProgressCallback = (current: number, total: number) => void;

/** A single reviewable row in the preview dialog. */
export interface PreviewItem {
    /** Stable selection key. */
    key: string;
    /** i18n key for the category badge (resolved by the dialog). */
    badgeKey: string;
    /** Primary label (entity name, relationship label, chapter title). */
    title: string;
    /** Secondary text (description / summary); may be empty. */
    detail: string;
    /** True when this maps to an already-existing Story Bible entity. The row
     *  is shown but unchecked + disabled (augment, never overwrite). */
    existing?: boolean;
}

interface EntityProposal {
    key: string;
    entityType: string;
    name: string;
    description: string;
    existing: boolean;
}

interface RelationshipProposal {
    key: string;
    fromName: string;
    toName: string;
    relType: RelationshipType;
    description: string;
}

interface ChapterProposal {
    key: string;
    chapterId: string;
    version: number;
    title: string;
    summary: string;
    beat: string | null;
    moodColor: string | null;
}

export interface StoryBibleExtraction {
    kind: "story-bible";
    entities: EntityProposal[];
    relationships: RelationshipProposal[];
    /** Existing entities by lowercased name -> id, for relationship resolution. */
    existingByName: Record<string, string>;
    /** Existing entities by id -> current relationships, so apply merges. */
    existingRelations: Record<string, StoryEntityRelationship[]>;
    items: PreviewItem[];
    notes: string[];
    tokens: number;
}

export interface StoryboardExtraction {
    kind: "storyboard";
    chapters: ChapterProposal[];
    items: PreviewItem[];
    notes: string[];
    tokens: number;
}

export type Extraction = StoryBibleExtraction | StoryboardExtraction;

/** Wrap plain text into a minimal TipTap doc JSON string (the canonical
 *  Story Bible description format). Empty paragraphs carry no text node. */
function plainTextToTipTapJson(text: string): string {
    const paragraphs = text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
    const content =
        paragraphs.length > 0
            ? paragraphs.map((para) => ({
                  type: "paragraph",
                  content: [{ type: "text", text: para }],
              }))
            : [{ type: "paragraph" }];
    return JSON.stringify({ type: "doc", content });
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

/** Dispatch one completion by storage mode via the shared {@link aiComplete}
 *  dispatcher, re-mapping its offline "not configured" guard to a typed
 *  {@link StoryExtractionError} so the extraction UI shows its own message. */
async function complete(
    messages: AiChatMessage[],
    bookId: string,
): Promise<{ content: string; tokens: number }> {
    try {
        return await aiComplete(messages, {
            bookId,
            maxTokens: RESPONSE_MAX_TOKENS,
            temperature: 0.4,
        });
    } catch (err) {
        if (err instanceof AiNotConfiguredError) {
            throw new StoryExtractionError("not_configured");
        }
        throw err;
    }
}

/** Load every chapter's plain text. Throws a typed error when the book has no
 *  chapters or no usable text. */
async function loadCorpus(
    bookId: string,
): Promise<{ corpus: ChapterCorpusEntry[]; chapters: Chapter[] }> {
    const chapters = await getStorage().chapters.list(bookId);
    if (chapters.length === 0) {
        throw new StoryExtractionError("no_chapters");
    }
    const corpus: ChapterCorpusEntry[] = chapters.map((chapter, idx) => ({
        index: idx + 1,
        title: chapter.title,
        text: extractBodyText(chapter.content),
    }));
    if (corpus.every((entry) => entry.text.length === 0)) {
        throw new StoryExtractionError("no_content");
    }
    return { corpus, chapters };
}

/** Split chapters into batches that each fit the per-request char budget. */
function batchChapters(corpus: ChapterCorpusEntry[]): ChapterCorpusEntry[][] {
    const batches: ChapterCorpusEntry[][] = [];
    let current: ChapterCorpusEntry[] = [];
    let size = 0;
    for (const entry of corpus) {
        const entrySize = entry.text.length + entry.title.length + 40;
        if (current.length > 0 && size + entrySize > CHAR_BUDGET) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push(entry);
        size += entrySize;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}

/**
 * Extract a Story Bible preview. Existing entities are fetched first so the
 * proposals can be deduped (augment, never overwrite).
 */
export async function extractStoryBible(
    bookId: string,
    opts: { onProgress?: ProgressCallback } = {},
): Promise<StoryBibleExtraction> {
    const { corpus } = await loadCorpus(bookId);
    const existing = await getStorage().storyBible.listEntities(bookId);

    const existingByName: Record<string, string> = {};
    const existingRelations: Record<string, StoryEntityRelationship[]> = {};
    const existingTypeName = new Set<string>();
    for (const entity of existing) {
        existingByName[entity.name.trim().toLowerCase()] = entity.id;
        existingTypeName.add(`${entity.entity_type}::${entity.name.trim().toLowerCase()}`);
        existingRelations[entity.id] = Array.isArray(entity.relationships)
            ? [...entity.relationships]
            : [];
    }

    const batches = batchChapters(corpus);
    const seenEntities = new Set<string>();
    const seenRels = new Set<string>();
    const entities: EntityProposal[] = [];
    const relationships: RelationshipProposal[] = [];
    let tokens = 0;

    const addEntity = (entityType: string, name: string, description: string): void => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const dedupKey = `${entityType}::${trimmed.toLowerCase()}`;
        if (seenEntities.has(dedupKey)) return;
        seenEntities.add(dedupKey);
        entities.push({
            key: `entity-${entities.length}`,
            entityType,
            name: trimmed,
            description: description.trim(),
            existing: existingTypeName.has(dedupKey),
        });
    };

    for (let i = 0; i < batches.length; i += 1) {
        opts.onProgress?.(i + 1, batches.length);
        const messages = buildStoryBibleMessages(batches[i], await bookLanguage(bookId));
        const { content, tokens: batchTokens } = await complete(messages, bookId);
        tokens += batchTokens;
        const parsed = parseAiObject(content);

        for (const raw of asArray(parsed.characters)) {
            const obj = raw as Record<string, unknown>;
            addEntity(ENTITY_TYPE.character, asString(obj.name), asString(obj.description));
        }
        for (const raw of asArray(parsed.locations)) {
            const obj = raw as Record<string, unknown>;
            addEntity(ENTITY_TYPE.setting, asString(obj.name), asString(obj.description));
        }
        for (const raw of asArray(parsed.timeline)) {
            const obj = raw as Record<string, unknown>;
            addEntity(ENTITY_TYPE.plotPoint, asString(obj.event), asString(obj.description));
        }
        for (const raw of asArray(parsed.themes)) {
            const obj = raw as Record<string, unknown>;
            addEntity(ENTITY_TYPE.lore, asString(obj.name), asString(obj.description));
        }
        for (const raw of asArray(parsed.relationships)) {
            const obj = raw as Record<string, unknown>;
            const fromName = asString(obj.from);
            const toName = asString(obj.to);
            const relType = asString(obj.type);
            if (!fromName || !toName) continue;
            const dedupKey = `${fromName.toLowerCase()}|${toName.toLowerCase()}|${relType.toLowerCase()}`;
            if (seenRels.has(dedupKey)) continue;
            seenRels.add(dedupKey);
            relationships.push({
                key: `rel-${relationships.length}`,
                fromName,
                toName,
                relType: normalizeRelationshipType(relType),
                description: asString(obj.description),
            });
        }
    }

    const items: PreviewItem[] = [
        ...entities.map((entity) => ({
            key: entity.key,
            badgeKey: `ui.ai_extraction.badge.${entity.entityType}`,
            title: entity.name,
            detail: entity.description,
            existing: entity.existing,
        })),
        ...relationships.map((rel) => ({
            key: rel.key,
            badgeKey: "ui.ai_extraction.badge.relationship",
            title: `${rel.fromName} → ${rel.toName} (${rel.relType})`,
            detail: rel.description,
        })),
    ];

    return {
        kind: "story-bible",
        entities,
        relationships,
        existingByName,
        existingRelations,
        items,
        notes: [],
        tokens,
    };
}

/** Extract a Storyboard preview (per-chapter summaries + plot arc + notes). */
export async function extractStoryboard(
    bookId: string,
    opts: { onProgress?: ProgressCallback } = {},
): Promise<StoryboardExtraction> {
    const { corpus, chapters } = await loadCorpus(bookId);
    const byIndex = new Map<number, Chapter>();
    corpus.forEach((entry, idx) => byIndex.set(entry.index, chapters[idx]));

    const batches = batchChapters(corpus);
    const proposals: ChapterProposal[] = [];
    const seenChapters = new Set<string>();
    const notes: string[] = [];
    let tokens = 0;

    for (let i = 0; i < batches.length; i += 1) {
        opts.onProgress?.(i + 1, batches.length);
        const messages = buildStoryboardMessages(batches[i], await bookLanguage(bookId));
        const { content, tokens: batchTokens } = await complete(messages, bookId);
        tokens += batchTokens;
        const parsed = parseAiObject(content);

        for (const raw of asArray(parsed.chapters)) {
            const obj = raw as Record<string, unknown>;
            const index = typeof obj.index === "number" ? obj.index : Number(obj.index);
            const chapter = byIndex.get(index);
            if (!chapter || seenChapters.has(chapter.id)) continue;
            const summary = asString(obj.summary);
            if (!summary) continue;
            seenChapters.add(chapter.id);
            const beatRaw = asString(obj.beat).toLowerCase();
            const beat = (STORY_BEATS as readonly string[]).includes(beatRaw) ? beatRaw : null;
            const moodRaw = asString(obj.mood_color);
            const moodColor = /^#[0-9a-fA-F]{6}$/.test(moodRaw) ? moodRaw : null;
            proposals.push({
                key: chapter.id,
                chapterId: chapter.id,
                version: chapter.version,
                title: chapter.title,
                summary,
                beat,
                moodColor,
            });
        }

        const arc = asString(parsed.plot_arc);
        if (arc) notes.push(arc);
        for (const note of asArray(parsed.continuity_notes)) {
            const text = asString(note);
            if (text) notes.push(text);
        }
    }

    proposals.sort((a, b) => {
        const ai = chapters.findIndex((c) => c.id === a.chapterId);
        const bi = chapters.findIndex((c) => c.id === b.chapterId);
        return ai - bi;
    });

    const items: PreviewItem[] = proposals.map((proposal) => ({
        key: proposal.key,
        badgeKey: "ui.ai_extraction.badge.chapter",
        title: proposal.title || `#${proposals.indexOf(proposal) + 1}`,
        detail: proposal.summary,
    }));

    return { kind: "storyboard", chapters: proposals, items, notes, tokens };
}

/** Read the book's language code for prompt localisation (best-effort). */
async function bookLanguage(bookId: string): Promise<string | null> {
    try {
        const book = await getStorage().books.get(bookId);
        return book.language ?? null;
    } catch {
        return null;
    }
}

/**
 * Apply the selected Story Bible proposals. Creates new entities (never the
 * `existing` ones), then attaches selected relationships by resolving both
 * endpoints to entity ids. Returns the number of items persisted.
 */
export async function applyStoryBible(
    bookId: string,
    extraction: StoryBibleExtraction,
    selected: ReadonlySet<string>,
): Promise<number> {
    const storage = getStorage().storyBible;
    const nameToId: Record<string, string> = { ...extraction.existingByName };
    const relations: Record<string, StoryEntityRelationship[]> = {};
    for (const [id, rels] of Object.entries(extraction.existingRelations)) {
        relations[id] = [...rels];
    }
    let applied = 0;

    for (const entity of extraction.entities) {
        if (entity.existing || !selected.has(entity.key)) continue;
        const created = await storage.createEntity(bookId, {
            entity_type: entity.entityType,
            name: entity.name,
            description: entity.description ? plainTextToTipTapJson(entity.description) : null,
        });
        nameToId[entity.name.trim().toLowerCase()] = created.id;
        relations[created.id] = [];
        applied += 1;
    }

    const touchedSources = new Set<string>();
    for (const rel of extraction.relationships) {
        if (!selected.has(rel.key)) continue;
        const sourceId = nameToId[rel.fromName.trim().toLowerCase()];
        const targetId = nameToId[rel.toName.trim().toLowerCase()];
        if (!sourceId || !targetId || sourceId === targetId) continue;
        const current = relations[sourceId] ?? (relations[sourceId] = []);
        if (
            current.some(
                (existing) =>
                    existing.target_entity_id === targetId &&
                    existing.relationship_type === rel.relType,
            )
        ) {
            continue;
        }
        current.push({
            target_entity_id: targetId,
            relationship_type: rel.relType,
            description: rel.description || null,
        });
        touchedSources.add(sourceId);
        applied += 1;
    }

    for (const sourceId of touchedSources) {
        await storage.updateEntity(sourceId, { relationships: relations[sourceId] });
    }

    return applied;
}

/**
 * Apply the selected Storyboard proposals onto the chapter annotation columns
 * (summary -> notes, plus beat + mood when present). Returns the count applied.
 */
export async function applyStoryboard(
    bookId: string,
    extraction: StoryboardExtraction,
    selected: ReadonlySet<string>,
): Promise<number> {
    const storage = getStorage().chapters;
    let applied = 0;
    for (const proposal of extraction.chapters) {
        if (!selected.has(proposal.key)) continue;
        await storage.update(bookId, proposal.chapterId, {
            version: proposal.version,
            notes: proposal.summary,
            ...(proposal.beat ? { story_beat: proposal.beat } : {}),
            ...(proposal.moodColor ? { mood_color: proposal.moodColor } : {}),
        });
        applied += 1;
    }
    return applied;
}

export { AiClientError };
