/**
 * A+ document model helpers (#891): module templates, the empty
 * starting document, and merging an AI-generated package into the
 * author's document without losing manual fields.
 */

import { describe, expect, it } from "vitest";

import {
    APLUS_FIELD_LIMITS,
    countCharacters,
    createModule,
    emptyDocument,
    fromStoredRow,
    hasContent,
    moduleHasContent,
    moveModule,
    newModuleId,
    packageToDocument,
    toStoredRow,
    type AplusDocumentDraft,
    type GeneratedAplusPackage,
} from "./aplusDocument";

let counter = 0;
const newId = () => `id-${++counter}`;

const PACKAGE: GeneratedAplusPackage = {
    short_description: "Kurz",
    bullets: [
        { heading: "H1", body: "B1" },
        { heading: "H2", body: "B2" },
        { heading: "H3", body: "B3" },
    ],
    module_header: {
        title: "Kopf",
        text: "Kopftext",
        image: { prompt: "raw", rendered: "raw --ar 97:60" },
        alt_text: "Alt Kopf",
    },
    module_three_images: [
        { title: "A", text: "a", image: { prompt: "pa" }, alt_text: "xa" },
        { title: "B", text: "b", image: { prompt: "pb", rendered: "pb --ar 1:1" }, alt_text: "xb" },
        { title: "C", text: "c", image: { prompt: "pc" }, alt_text: "xc" },
    ],
};

describe("createModule", () => {
    it("creates a module with one empty slot per template image", () => {
        const module = createModule("three_images_text", "m1");
        expect(module).toEqual({
            id: "m1",
            template: "three_images_text",
            module_title: "",
            slots: Array.from({ length: 3 }, () => ({
                title: "",
                text: "",
                image_prompt: "",
                alt_text: "",
                caption: "",
                asin: "",
            })),
        });
    });

    it("gives an unknown template one image place", () => {
        expect(createModule("custom_x", "c").slots).toHaveLength(1);
    });

    it("mirrors the backend ruleset limits", () => {
        expect(APLUS_FIELD_LIMITS).toEqual({
            short_description: 300,
            bullet_heading: 160,
            bullet_body: 1000,
            alt_text: 200,
        });
    });
});

describe("hasContent with template fields", () => {
    it("sees text in module fields and table rows", () => {
        const doc = emptyDocument("Buch", newId);
        const text = createModule("text", "t");
        text.fields = { body: "Hallo" };
        expect(hasContent({ ...doc, modules: [text] })).toBe(true);
        const specs = createModule("tech_specs", "s");
        specs.rows = [{ label: "Seiten", values: [""] }];
        expect(hasContent({ ...doc, modules: [specs] })).toBe(true);
    });
});

describe("emptyDocument", () => {
    it("names the content after the book and starts with three bullets and both standard modules", () => {
        const doc = emptyDocument("El caballo que se reía", newId);
        expect(doc.content_name).toBe("El caballo que se reía - A+Content");
        expect(doc.bullets).toHaveLength(3);
        expect(doc.modules.map((m) => m.template)).toEqual(["image_header_text", "three_images_text"]);
        expect(new Set(doc.modules.map((m) => m.id)).size).toBe(2);
        expect(hasContent(doc)).toBe(false);
    });
});

describe("hasContent", () => {
    it("ignores the generated content name but sees any typed field", () => {
        const doc = emptyDocument("Buch", newId);
        expect(hasContent({ ...doc, content_name: "Anders" })).toBe(false);
        const typed: AplusDocumentDraft = structuredClone(doc);
        typed.modules[1].slots[2].alt_text = "x";
        expect(hasContent(typed)).toBe(true);
    });
});

describe("packageToDocument", () => {
    it("fills bullets, short description and both standard modules from the AI package", () => {
        const merged = packageToDocument(PACKAGE, emptyDocument("Buch", newId), newId);
        expect(merged.short_description).toBe("Kurz");
        expect(merged.bullets.map((b) => b.heading)).toEqual(["H1", "H2", "H3"]);
        expect(merged.modules[0].slots[0]).toEqual({
            title: "Kopf",
            text: "Kopftext",
            image_prompt: "raw --ar 97:60",
            alt_text: "Alt Kopf",
        });
        expect(merged.modules[1].slots.map((s) => s.image_prompt)).toEqual(["pa", "pb --ar 1:1", "pc"]);
    });

    it("keeps the content name, module titles and modules the AI does not produce", () => {
        const doc = emptyDocument("Buch", newId);
        doc.content_name = "Mein Name";
        doc.modules[0].module_title = "Modul eins";
        const extra = createModule("image_header_text", "extra");
        extra.slots[0].title = "bleibt";
        doc.modules.push(extra);
        const merged = packageToDocument(PACKAGE, doc, newId);
        expect(merged.content_name).toBe("Mein Name");
        expect(merged.modules[0].module_title).toBe("Modul eins");
        expect(merged.modules[2].slots[0].title).toBe("bleibt");
        expect(doc.short_description).toBe("");
    });

    it("appends the standard modules when the document has none", () => {
        const doc = { ...emptyDocument("Buch", newId), modules: [] };
        const merged = packageToDocument(PACKAGE, doc, newId);
        expect(merged.modules.map((m) => m.template)).toEqual(["image_header_text", "three_images_text"]);
    });
});

describe("moveModule", () => {
    it("moves a module up and down and ignores moves past the ends", () => {
        const doc = emptyDocument("Buch", newId);
        const [first, second] = doc.modules;
        expect(moveModule(doc.modules, 1, -1).map((m) => m.id)).toEqual([second.id, first.id]);
        expect(moveModule(doc.modules, 0, -1)).toBe(doc.modules);
        expect(moveModule(doc.modules, 1, 1)).toBe(doc.modules);
    });
});

describe("countCharacters", () => {
    it("counts code points, so an emoji or accented letter is one character", () => {
        expect(countCharacters("reía")).toBe(4);
        expect(countCharacters("a😀")).toBe(2);
        expect(countCharacters("")).toBe(0);
    });
});

describe("newModuleId", () => {
    it("uses randomUUID when available", () => {
        expect(newModuleId()).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("still returns distinct ids without randomUUID (insecure LAN context)", () => {
        const original = crypto.randomUUID;
        Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
        try {
            const ids = new Set(Array.from({ length: 50 }, () => newModuleId()));
            expect(ids.size).toBe(50);
        } finally {
            Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
        }
    });
});

describe("stored rows", () => {
    it("round-trips a document through the backend row shape", () => {
        const doc = { ...emptyDocument("Buch", newId), book_id: "b1", language: "es", updated_at: "t" };
        const row = toStoredRow(doc, "r1");
        expect(row).toMatchObject({ id: "r1", book_id: "b1", language: "es", updated_at: "t" });
        expect(fromStoredRow(row)).toEqual({
            content_name: doc.content_name,
            short_description: doc.short_description,
            bullets: doc.bullets,
            modules: doc.modules,
        });
    });

    it("fills fields a partial stored document lacks", () => {
        const row = { id: "r", book_id: "b", language: "de", document_json: '{"content_name":"x"}' };
        expect(fromStoredRow(row)).toEqual({ content_name: "x", short_description: "", bullets: [], modules: [] });
    });
});

describe("moduleHasContent", () => {
    it("is false for a fresh module and true once any slot field holds text", () => {
        const module = createModule("three_images_text", "m");
        expect(moduleHasContent(module)).toBe(false);
        module.slots[1].text = "  ";
        expect(moduleHasContent(module)).toBe(false);
        module.slots[1].text = "x";
        expect(moduleHasContent(module)).toBe(true);
    });
});
