import { findTemplate, type AplusModuleTemplate } from "./moduleTemplates";

/**
 * Editable A+ Content document model (#891).
 *
 * The document is what an author ships to Amazon's A+ manager: a content
 * name, a short description, bullets, and an ordered list of modules, each
 * built from a template of the module catalog (`moduleTemplates.ts`). It is
 * filled by hand, from an AI result, or both. The shape mirrors the backend
 * body `bibliogon_aplus.schema.AplusDocumentBody`.
 *
 * @example
 * const doc = emptyDocument(book.title, () => crypto.randomUUID());
 * doc.modules.push(createModule("three_images_text", crypto.randomUUID()));
 */

export interface AplusBulletDraft {
    heading: string;
    body: string;
}

/** One image of a module with its texts. `caption` and `asin` are used by
 *  some templates only and missing in documents written before #895. */
export interface AplusSlotDraft {
    title: string;
    text: string;
    image_prompt: string;
    alt_text: string;
    caption?: string;
    asin?: string;
}

/** A table row: a label plus one value per column (or one value for a pair). */
export interface AplusRowDraft {
    label: string;
    values: string[];
}

export interface AplusModuleDraft {
    id: string;
    template: string;
    /** The module headline Amazon shows above the module. */
    module_title: string;
    slots: AplusSlotDraft[];
    /** Module-level texts keyed by the template's field keys (#895). */
    fields?: Record<string, string>;
    /** Table rows of the comparison chart and tech specs templates (#895). */
    rows?: AplusRowDraft[];
}

export interface AplusDocumentDraft {
    content_name: string;
    short_description: string;
    bullets: AplusBulletDraft[];
    modules: AplusModuleDraft[];
}

/** Character limits from the backend ruleset's `schema_limits`. */
export const APLUS_FIELD_LIMITS = {
    short_description: 300,
    bullet_heading: 160,
    bullet_body: 1000,
    alt_text: 200,
} as const;

export const APLUS_BULLET_COUNT = 3;

/** An AI-generated package as the generate endpoint returns it (the parts used here). */
export interface GeneratedAplusPackage {
    short_description: string;
    bullets: AplusBulletDraft[];
    module_header: GeneratedAplusModule;
    module_three_images: GeneratedAplusModule[];
}

export interface GeneratedAplusModule {
    title: string;
    text: string;
    image: { prompt: string; rendered?: string };
    alt_text: string;
}

/**
 * A module id, unique within the document. `crypto.randomUUID` needs a secure
 * context, which a phone reaching the desktop over LAN mode (plain http) is
 * not, so this falls back to a time-plus-random id there.
 */
export function newModuleId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptySlot(): AplusSlotDraft {
    return { title: "", text: "", image_prompt: "", alt_text: "", caption: "", asin: "" };
}

/** An empty table row with `columns` values. */
export function emptyRow(columns: number): AplusRowDraft {
    return { label: "", values: Array.from({ length: columns }, () => "") };
}

/** Values per table row: one per column for a comparison, one for a pair. */
export function rowWidth(template: AplusModuleTemplate | undefined, slotCount: number): number {
    return template?.rows?.kind === "matrix" ? slotCount : 1;
}

/** A new module from a catalog template: empty image places, fields and rows.
 *  An unknown template gets one image place with the classic fields. */
export function createModule(templateId: string, id: string): AplusModuleDraft {
    const template = findTemplate(templateId);
    const slotCount = template ? template.slots.length : 1;
    const module: AplusModuleDraft = {
        id,
        template: templateId,
        module_title: "",
        slots: Array.from({ length: slotCount }, emptySlot),
    };
    if (template && template.fields.length > 0) {
        module.fields = Object.fromEntries(template.fields.map((spec) => [spec.key, ""]));
    }
    if (template?.rows) {
        module.rows = Array.from({ length: template.rows.initial }, () => emptyRow(rowWidth(template, slotCount)));
    }
    return module;
}

/** The starting document: named after the book, three bullets, the two standard modules. */
export function emptyDocument(bookTitle: string, newId: () => string): AplusDocumentDraft {
    return {
        content_name: `${bookTitle} - A+Content`,
        short_description: "",
        bullets: Array.from({ length: APLUS_BULLET_COUNT }, () => ({ heading: "", body: "" })),
        modules: [createModule("image_header_text", newId()), createModule("three_images_text", newId())],
    };
}

function moduleTexts(module: AplusModuleDraft): string[] {
    return [
        module.module_title,
        ...module.slots.flatMap((slot) => [
            slot.title,
            slot.text,
            slot.image_prompt,
            slot.alt_text,
            slot.caption ?? "",
            slot.asin ?? "",
        ]),
        ...Object.values(module.fields ?? {}),
        ...(module.rows ?? []).flatMap((row) => [row.label, ...row.values]),
    ];
}

const nonBlank = (text: string): boolean => text.trim() !== "";

/** True when any field of the module holds text. */
export function moduleHasContent(module: AplusModuleDraft): boolean {
    return moduleTexts(module).some(nonBlank);
}

/** True when the author typed anything beyond the generated content name. */
export function hasContent(doc: AplusDocumentDraft): boolean {
    const texts = [
        doc.short_description,
        ...doc.bullets.flatMap((bullet) => [bullet.heading, bullet.body]),
        ...doc.modules.flatMap(moduleTexts),
    ];
    return texts.some(nonBlank);
}

function slotFromGenerated(generated: GeneratedAplusModule): AplusSlotDraft {
    return {
        title: generated.title,
        text: generated.text,
        image_prompt: generated.image.rendered || generated.image.prompt,
        alt_text: generated.alt_text,
    };
}

function fillModule(
    modules: AplusModuleDraft[],
    templateId: string,
    generated: GeneratedAplusModule[],
    newId: () => string,
): AplusModuleDraft[] {
    const index = modules.findIndex((module) => module.template === templateId);
    const target = index >= 0 ? modules[index] : createModule(templateId, newId());
    const slots = generated.map(slotFromGenerated);
    const filled = { ...target, slots: slots.length > 0 ? slots : target.slots };
    return index >= 0 ? modules.map((module, i) => (i === index ? filled : module)) : [...modules, filled];
}

/**
 * Merge an AI package into the document. The AI writes the short
 * description, the bullets, and the first header and three-image modules;
 * the content name, module titles and every other module stay as the
 * author left them. Returns a new document.
 */
export function packageToDocument(
    pkg: GeneratedAplusPackage,
    current: AplusDocumentDraft,
    newId: () => string,
): AplusDocumentDraft {
    let modules = fillModule(current.modules, "image_header_text", [pkg.module_header], newId);
    modules = fillModule(modules, "three_images_text", pkg.module_three_images, newId);
    return {
        ...current,
        short_description: pkg.short_description,
        bullets: pkg.bullets.map((bullet) => ({ heading: bullet.heading, body: bullet.body })),
        modules,
    };
}

/** Move the module at `index` by `delta`; the same array back when the move leaves the list. */
export function moveModule(modules: AplusModuleDraft[], index: number, delta: -1 | 1): AplusModuleDraft[] {
    const target = index + delta;
    if (target < 0 || target >= modules.length) return modules;
    const next = [...modules];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

/** Characters as a reader counts them: code points, so an emoji or accent is one. */
export function countCharacters(text: string): number {
    return Array.from(text).length;
}

/** An A+ document as the backend stores it (`aplus_documents` row), the shape
 *  both `.bgb` writers use so either side restores the other's backup. */
export interface AplusStoredRow {
    id: string;
    book_id: string;
    language: string;
    document_json: string;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface AplusDocumentKeyed extends AplusDocumentDraft {
    book_id: string;
    language: string;
    updated_at?: string | null;
}

function draftOf(doc: AplusDocumentDraft): AplusDocumentDraft {
    return {
        content_name: doc.content_name,
        short_description: doc.short_description,
        bullets: doc.bullets,
        modules: doc.modules,
    };
}

/** Serialise a document into the stored-row shape. */
export function toStoredRow(doc: AplusDocumentKeyed, id: string): AplusStoredRow {
    return {
        id,
        book_id: doc.book_id,
        language: doc.language,
        document_json: JSON.stringify(draftOf(doc)),
        created_at: doc.updated_at ?? null,
        updated_at: doc.updated_at ?? null,
    };
}

/** Read a stored row back into a document draft; missing fields become empty. */
export function fromStoredRow(row: AplusStoredRow): AplusDocumentDraft {
    const parsed = JSON.parse(row.document_json) as Partial<AplusDocumentDraft>;
    return {
        content_name: parsed.content_name ?? "",
        short_description: parsed.short_description ?? "",
        bullets: parsed.bullets ?? [],
        modules: parsed.modules ?? [],
    };
}
