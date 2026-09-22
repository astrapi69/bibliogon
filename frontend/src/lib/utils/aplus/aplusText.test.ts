/**
 * Plain-text export of an A+ document (#891), in the layout authors keep
 * next to KDP's A+ manager: content name, short description with its
 * character count, bullets, then each module with its fields.
 */

import { describe, expect, it } from "vitest";

import { createModule, type AplusDocumentDraft } from "./aplusDocument";
import { documentToText, type AplusTextLabels } from "./aplusText";

const LABELS: AplusTextLabels = {
    contentName: "Name des Inhalts",
    shortDescription: "Kurzbeschreibung",
    characters: "Zeichen",
    bullets: "Bulletpoints",
    module: "Modul",
    moduleTitle: "Modultitel",
    image: "Bild",
    title: "Titel",
    text: "Text",
    imagePrompt: "Bild-Prompt",
    altText: "Alt-Text",
    caption: "Bildunterschrift",
    asin: "ASIN",
    templateName: (id) => (id === "image_header_text" ? "Bild-Kopfzeile mit Text" : "Drei Bilder und Text"),
    fieldLabel: (spec) => spec.labelFallback.replace("{n}", String(spec.n ?? "")),
    slotLabel: (spec) => spec.labelFallback ?? "",
};

function sampleDocument(): AplusDocumentDraft {
    const header = createModule("image_header_text", "m1");
    header.module_title = "El caballo que se reía";
    header.slots[0] = { title: "Filimón", text: "Vive en una granja.", image_prompt: "farm --ar 97:60", alt_text: "Granja" };
    const three = createModule("three_images_text", "m2");
    three.module_title = "Cultura griega";
    three.slots = three.slots.map((_, i) => ({ title: `T${i + 1}`, text: `x${i + 1}`, image_prompt: `p${i + 1}`, alt_text: `a${i + 1}` }));
    return {
        content_name: "El caballo que se reía - A+Content",
        short_description: "Filimón sabe reír.",
        bullets: [
            { heading: "Uno", body: "Primero." },
            { heading: "Dos", body: "Segundo." },
        ],
        modules: [header, three],
    };
}

describe("documentToText", () => {
    it("writes every section in order with labels, counts and image sizes", () => {
        const text = documentToText(sampleDocument(), LABELS);
        expect(text).toBe(
            [
                "Name des Inhalts: El caballo que se reía - A+Content",
                "",
                "Kurzbeschreibung (18 Zeichen):",
                "",
                "Filimón sabe reír.",
                "",
                "Bulletpoints:",
                "",
                "Uno",
                "Primero.",
                "",
                "Dos",
                "Segundo.",
                "",
                "Modul 1: Bild-Kopfzeile mit Text (970x600)",
                "Modultitel: El caballo que se reía",
                "",
                "Titel: Filimón",
                "Text: Vive en una granja.",
                "Bild-Prompt: farm --ar 97:60",
                "Alt-Text: Granja",
                "",
                "Modul 2: Drei Bilder und Text (300x300)",
                "Modultitel: Cultura griega",
                "",
                "Bild 1 Titel: T1",
                "Bild 1 Text: x1",
                "Bild 1 Bild-Prompt: p1",
                "Bild 1 Alt-Text: a1",
                "",
                "Bild 2 Titel: T2",
                "Bild 2 Text: x2",
                "Bild 2 Bild-Prompt: p2",
                "Bild 2 Alt-Text: a2",
                "",
                "Bild 3 Titel: T3",
                "Bild 3 Text: x3",
                "Bild 3 Bild-Prompt: p3",
                "Bild 3 Alt-Text: a3",
                "",
            ].join("\n"),
        );
    });

    it("skips empty bullets and an unknown template's size", () => {
        const doc = sampleDocument();
        doc.bullets = [{ heading: "", body: "" }];
        doc.modules = [{ ...createModule("custom_x", "m3"), module_title: "Frei" }];
        const text = documentToText(doc, { ...LABELS, templateName: () => "Frei" });
        expect(text).not.toContain("Bulletpoints:");
        expect(text).toContain("Modul 1: Frei\n");
    });

    it("writes module fields, list items, labelled image places and table rows", () => {
        const doc = sampleDocument();
        const sidebar = createModule("image_sidebar", "s1");
        sidebar.module_title = "Kopf";
        sidebar.fields = { ...sidebar.fields, description_body: "Beschreibung.", bullets: "eins\n\n zwei " };
        sidebar.slots[0] = { ...sidebar.slots[0], caption: "Unterschrift" };
        const specs = createModule("tech_specs", "t1");
        specs.module_title = "Daten";
        specs.rows = [{ label: "Seiten", values: ["320"] }];
        const chart = createModule("comparison_chart", "c1");
        chart.rows = [{ label: "Genre", values: ["Krimi", "Roman", ""] }];
        doc.modules = [sidebar, specs, chart];
        const text = documentToText(doc, { ...LABELS, templateName: (id) => id });

        expect(text).toContain("Modul 1: image_sidebar (300x400, 350x175)\nModultitel: Kopf\n");
        expect(text).toContain("Beschreibung: Beschreibung.\n");
        expect(text).toContain("Aufzählung (ein Punkt pro Zeile):\n- eins\n- zwei\n");
        expect(text).toContain("Hauptbild Bildunterschrift: Unterschrift\n");
        expect(text).toContain("Seitenleiste Titel: \n");
        expect(text).toContain("Modul 2: tech_specs\nModultitel: Daten\n");
        expect(text).toContain("Seiten: 320\n");
        expect(text).toContain("Modul 3: comparison_chart (150x300)\n\n");
        expect(text).toContain("Bild 2 ASIN: \n");
        expect(text).toContain("Genre: Krimi | Roman | \n");
    });
});
