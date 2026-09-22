/**
 * Catalog of Amazon's 17 standard A+ modules (#895) as templates for the
 * editable A+ document.
 *
 * Structure (which texts, how many images, which tables) follows Amazon's
 * public A+ Content API model (`aplusContent_2020-11-01.json`, 15 module
 * types; the text overlay comes dark and light, the side image left and
 * right, which makes the 17 modules KDP's "Add module" dialog offers).
 * Image sizes are Amazon's minimums from the seller-facing "A+ Content -
 * Standard Modules" guide and KDP's "A+ Content Examples"; where those two
 * disagree with current guides (four images, multiple image module) the
 * current value is used. Sizes are hints, never enforced.
 *
 * @example
 * const template = findTemplate("three_images_text");
 * template?.slots[0].size; // "300x300"
 */

export type AplusSlotField = "title" | "text" | "image_prompt" | "alt_text" | "caption" | "asin";

/** One image place of a module and the texts that belong to it. */
export interface AplusSlotSpec {
    size: string;
    aspectRatio: string;
    fields: readonly AplusSlotField[];
    /** i18n key of the slot heading; without it slots are numbered "Image n". */
    labelKey?: string;
    labelFallback?: string;
}

/** A module-level text field (besides the module headline). */
export interface AplusTextFieldSpec {
    key: string;
    labelKey: string;
    labelFallback: string;
    /** Replaces `{n}` in the label. */
    n?: number;
    multiline?: boolean;
    /** One list item per line (bullet lists). */
    list?: boolean;
    maxChars?: number;
    /** Render below the image slots instead of above them. */
    afterSlots?: boolean;
}

/** Table rows: name/definition pairs (tech specs) or one value per column (comparison). */
export interface AplusRowsSpec {
    kind: "pairs" | "matrix";
    initial: number;
    min: number;
    max: number;
}

/** A cell of the tile's layout sketch. */
export type AplusSketchCell = "image" | "wide" | "tall" | "text" | "logo" | "overlay" | "overlay_dark" | "table";

export type AplusModuleCategory = "image" | "text" | "table" | "brand";

export interface AplusModuleTemplate {
    id: string;
    /** Amazon's module name (English), the label fallback. */
    name: string;
    category: AplusModuleCategory;
    /** One-line purpose (German fallback; i18n key `ui.aplus.template_<id>_purpose`). */
    purpose: string;
    headline: boolean;
    fields: readonly AplusTextFieldSpec[];
    /** Initial image places; added places copy the last spec. */
    slots: readonly AplusSlotSpec[];
    minSlots: number;
    maxSlots: number;
    rows?: AplusRowsSpec;
    /** Amazon allows the module only once per A+ Content. */
    once?: boolean;
    /** Rows of cells for the tile preview. */
    sketch: readonly (readonly AplusSketchCell[])[];
}

/** KDP shows at most this many modules per A+ Content. */
export const KDP_MAX_MODULES = 5;

const IMAGE_TEXT: readonly AplusSlotField[] = ["title", "text", "image_prompt", "alt_text"];
const IMAGE_ONLY: readonly AplusSlotField[] = ["image_prompt", "alt_text"];

const slot = (size: string, aspectRatio: string, fields: readonly AplusSlotField[] = IMAGE_TEXT): AplusSlotSpec => ({
    size,
    aspectRatio,
    fields,
});

const repeat = (count: number, spec: AplusSlotSpec): AplusSlotSpec[] => Array.from({ length: count }, () => spec);

const field = (
    key: string,
    labelKey: string,
    labelFallback: string,
    extra: Partial<AplusTextFieldSpec> = {},
): AplusTextFieldSpec => ({ key, labelKey: `ui.aplus.field_${labelKey}`, labelFallback, ...extra });

const textBlock = (n: number): AplusTextFieldSpec[] => [
    field(`block_${n}_headline`, "block_headline", "Überschrift Textblock {n}", { n }),
    field(`block_${n}_body`, "block_body", "Text Textblock {n}", { n, multiline: true }),
];

const BODY = field("body", "body", "Text", { multiline: true });
const BULLETS_HEADLINE = field("bullets_headline", "bullets_headline", "Überschrift der Aufzählung");
const BULLETS = field("bullets", "bullets", "Aufzählung (ein Punkt pro Zeile)", { multiline: true, list: true });

export const APLUS_MODULE_TEMPLATES: readonly AplusModuleTemplate[] = [
    {
        id: "image_header_text",
        name: "Standard Image Header With Text",
        category: "image",
        purpose: "Großes Titelbild mit Überschrift und Text, ideal als Einstieg.",
        headline: true,
        fields: [],
        slots: [slot("970x600", "97:60")],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["wide"], ["text"]],
    },
    {
        id: "three_images_text",
        name: "Standard Three Images & Text",
        category: "image",
        purpose: "Drei Bilder nebeneinander, je mit Überschrift und Text.",
        headline: true,
        fields: [],
        slots: repeat(3, slot("300x300", "1:1")),
        minSlots: 3,
        maxSlots: 3,
        sketch: [["image", "image", "image"], ["text", "text", "text"]],
    },
    {
        id: "four_images_text",
        name: "Standard Four Image & Text",
        category: "image",
        purpose: "Vier Bilder in einer Reihe, je mit Überschrift und Text.",
        headline: true,
        fields: [],
        slots: repeat(4, slot("220x220", "1:1")),
        minSlots: 4,
        maxSlots: 4,
        sketch: [["image", "image", "image", "image"], ["text", "text", "text", "text"]],
    },
    {
        id: "four_images_quadrant",
        name: "Standard Four Image/Text Quadrant",
        category: "image",
        purpose: "Vier kleine Bilder mit Text im Raster zwei mal zwei.",
        headline: false,
        fields: [],
        slots: repeat(4, slot("135x135", "1:1")),
        minSlots: 4,
        maxSlots: 4,
        sketch: [["image", "text", "image", "text"], ["image", "text", "image", "text"]],
    },
    {
        id: "single_left_image",
        name: "Standard Single Left Image",
        category: "image",
        purpose: "Ein Bild links, daneben Überschrift und Text.",
        headline: false,
        fields: [],
        slots: [slot("300x300", "1:1")],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["image", "text", "text"]],
    },
    {
        id: "single_right_image",
        name: "Standard Single Right Image",
        category: "image",
        purpose: "Überschrift und Text, daneben ein Bild rechts.",
        headline: false,
        fields: [],
        slots: [slot("300x300", "1:1")],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["text", "text", "image"]],
    },
    {
        id: "image_dark_overlay",
        name: "Standard Image & Dark Text Overlay",
        category: "image",
        purpose: "Breites Bild mit dunklem Textkasten darüber.",
        headline: false,
        fields: [],
        slots: [slot("970x300", "97:30")],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["overlay_dark"]],
    },
    {
        id: "image_light_overlay",
        name: "Standard Image & Light Text Overlay",
        category: "image",
        purpose: "Breites Bild mit hellem Textkasten darüber.",
        headline: false,
        fields: [],
        slots: [slot("970x300", "97:30")],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["overlay"]],
    },
    {
        id: "image_sidebar",
        name: "Standard Single Image & Sidebar",
        category: "image",
        purpose: "Hauptbild mit Beschreibung und Aufzählung, dazu eine Seitenleiste mit kleinem Bild.",
        headline: true,
        fields: [
            field("description_headline", "description_headline", "Überschrift der Beschreibung"),
            field("description_body", "description_body", "Beschreibung", { multiline: true }),
            BULLETS,
            field("sidebar_bullets", "sidebar_bullets", "Aufzählung der Seitenleiste (ein Punkt pro Zeile)", {
                multiline: true,
                list: true,
                afterSlots: true,
            }),
        ],
        slots: [
            {
                size: "300x400",
                aspectRatio: "3:4",
                fields: ["image_prompt", "alt_text", "caption"],
                labelKey: "ui.aplus.slot_main_image",
                labelFallback: "Hauptbild",
            },
            {
                size: "350x175",
                aspectRatio: "2:1",
                fields: IMAGE_TEXT,
                labelKey: "ui.aplus.slot_sidebar",
                labelFallback: "Seitenleiste",
            },
        ],
        minSlots: 2,
        maxSlots: 2,
        sketch: [["tall", "text", "image"], ["tall", "text", "text"]],
    },
    {
        id: "single_image_highlights",
        name: "Standard Single Image & Highlights",
        category: "image",
        purpose: "Ein Bild mit drei Textblöcken und einer Aufzählung.",
        headline: true,
        fields: [...textBlock(1), ...textBlock(2), ...textBlock(3), BULLETS_HEADLINE, BULLETS],
        slots: [slot("300x300", "1:1", IMAGE_ONLY)],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["image", "text", "text"], ["image", "text", "text"]],
    },
    {
        id: "single_image_specs",
        name: "Standard Single Image & Specs Detail",
        category: "image",
        purpose: "Ein Bild mit Beschreibung, zwei Textblöcken und technischen Details.",
        headline: true,
        fields: [
            field("description_headline", "description_headline", "Überschrift der Beschreibung"),
            ...textBlock(1),
            ...textBlock(2),
            field("specification_headline", "specification_headline", "Überschrift der Details"),
            BULLETS_HEADLINE,
            BULLETS,
            ...textBlock(3),
        ],
        slots: [slot("300x300", "1:1", IMAGE_ONLY)],
        minSlots: 1,
        maxSlots: 1,
        sketch: [["image", "text", "table"], ["image", "text", "table"]],
    },
    {
        id: "multiple_image",
        name: "Standard Multiple Image Module A",
        category: "image",
        purpose: "Bis zu vier Bilder, die Leser über Vorschaubilder durchklicken.",
        headline: false,
        fields: [],
        slots: repeat(4, slot("300x300", "1:1", ["title", "text", "caption", "image_prompt", "alt_text"])),
        minSlots: 1,
        maxSlots: 4,
        sketch: [["tall", "text"], ["image", "image"]],
    },
    {
        id: "comparison_chart",
        name: "Standard Comparison Chart",
        category: "table",
        purpose: "Tabelle, die bis zu sechs Bücher Merkmal für Merkmal vergleicht.",
        headline: false,
        fields: [],
        slots: repeat(3, slot("150x300", "1:2", ["title", "asin", "image_prompt", "alt_text"])),
        minSlots: 1,
        maxSlots: 6,
        rows: { kind: "matrix", initial: 3, min: 0, max: 10 },
        sketch: [["image", "image", "image"], ["table", "table", "table"]],
    },
    {
        id: "tech_specs",
        name: "Standard Tech Specs",
        category: "table",
        purpose: "Tabelle mit 4 bis 16 Angaben wie Seitenzahl, Format oder Lesealter.",
        headline: true,
        fields: [],
        slots: [],
        minSlots: 0,
        maxSlots: 0,
        rows: { kind: "pairs", initial: 4, min: 4, max: 16 },
        sketch: [["table", "table"], ["table", "table"]],
    },
    {
        id: "text",
        name: "Standard Text",
        category: "text",
        purpose: "Überschrift und Text ohne Bild.",
        headline: true,
        fields: [BODY],
        slots: [],
        minSlots: 0,
        maxSlots: 0,
        sketch: [["text"], ["text"]],
    },
    {
        id: "product_description",
        name: "Standard Product Description Text",
        category: "text",
        purpose: "Langer Beschreibungstext ohne Bild, bis zu 6000 Zeichen.",
        headline: false,
        fields: [field("body", "body", "Text", { multiline: true, maxChars: 6000 })],
        slots: [],
        minSlots: 0,
        maxSlots: 0,
        sketch: [["text"], ["text"], ["text"]],
    },
    {
        id: "company_logo",
        name: "Standard Company Logo",
        category: "brand",
        purpose: "Logo von Verlag oder Autor, einmal pro A+ Content.",
        headline: false,
        fields: [],
        slots: [slot("600x180", "10:3", IMAGE_ONLY)],
        minSlots: 1,
        maxSlots: 1,
        once: true,
        sketch: [["logo"]],
    },
];

export function findTemplate(id: string): AplusModuleTemplate | undefined {
    return APLUS_MODULE_TEMPLATES.find((template) => template.id === id);
}

/** The spec for slot `index`: the initial spec at that place, else the last one. */
export function slotSpecAt(template: AplusModuleTemplate, index: number): AplusSlotSpec | undefined {
    if (template.slots.length === 0) return undefined;
    return template.slots[Math.min(index, template.slots.length - 1)];
}

/** Image sizes of a module for display, e.g. "3 × 300x300" or "300x400, 350x175". */
export function imageSizesSummary(template: AplusModuleTemplate): string {
    const sizes = template.slots.map((spec) => spec.size);
    if (sizes.length === 0) return "";
    const unique = [...new Set(sizes)];
    if (unique.length > 1) return unique.join(", ");
    const count = template.maxSlots > template.minSlots ? `${template.minSlots}-${template.maxSlots}` : String(sizes.length);
    return count === "1" ? unique[0] : `${count} × ${unique[0]}`;
}
