import {
    countCharacters,
    type AplusDocumentDraft,
    type AplusModuleDraft,
    type AplusSlotDraft,
} from "./aplusDocument";
import {
    findTemplate,
    slotSpecAt,
    type AplusModuleTemplate,
    type AplusSlotField,
    type AplusSlotSpec,
    type AplusTextFieldSpec,
} from "./moduleTemplates";

/** Labels for the text export; the caller passes them in the UI language. */
export interface AplusTextLabels {
    contentName: string;
    shortDescription: string;
    characters: string;
    bullets: string;
    module: string;
    moduleTitle: string;
    image: string;
    title: string;
    text: string;
    imagePrompt: string;
    altText: string;
    caption: string;
    asin: string;
    templateName: (templateId: string) => string;
    fieldLabel: (spec: AplusTextFieldSpec) => string;
    slotLabel: (spec: AplusSlotSpec) => string;
}

const CLASSIC_FIELDS: readonly AplusSlotField[] = ["title", "text", "image_prompt", "alt_text"];

function slotFieldLabel(field: AplusSlotField, labels: AplusTextLabels): string {
    const byField: Record<AplusSlotField, string> = {
        title: labels.title,
        text: labels.text,
        image_prompt: labels.imagePrompt,
        alt_text: labels.altText,
        caption: labels.caption,
        asin: labels.asin,
    };
    return byField[field];
}

function slotLines(
    slot: AplusSlotDraft,
    fields: readonly AplusSlotField[],
    prefix: string,
    labels: AplusTextLabels,
): string[] {
    return [...fields.map((field) => `${prefix}${slotFieldLabel(field, labels)}: ${slot[field] ?? ""}`), ""];
}

function fieldLines(module: AplusModuleDraft, specs: readonly AplusTextFieldSpec[], labels: AplusTextLabels): string[] {
    const lines = specs.flatMap((spec) => {
        const value = module.fields?.[spec.key] ?? "";
        if (!spec.list) return [`${labels.fieldLabel(spec)}: ${value}`];
        const items = value.split("\n").filter((item) => item.trim() !== "");
        return [`${labels.fieldLabel(spec)}:`, ...items.map((item) => `- ${item.trim()}`)];
    });
    return lines.length > 0 ? [...lines, ""] : [];
}

function rowLines(module: AplusModuleDraft): string[] {
    const rows = module.rows ?? [];
    return rows.length > 0 ? [...rows.map((row) => `${row.label}: ${row.values.join(" | ")}`), ""] : [];
}

function sizesText(template: AplusModuleTemplate | undefined): string {
    return template ? [...new Set(template.slots.map((spec) => spec.size))].join(", ") : "";
}

function slotPrefix(template: AplusModuleTemplate | undefined, module: AplusModuleDraft, index: number, labels: AplusTextLabels): string {
    const spec = template ? slotSpecAt(template, index) : undefined;
    if (spec?.labelKey) return `${labels.slotLabel(spec)} `;
    return module.slots.length > 1 ? `${labels.image} ${index + 1} ` : "";
}

function moduleLines(module: AplusModuleDraft, index: number, labels: AplusTextLabels): string[] {
    const template = findTemplate(module.template);
    const sizes = sizesText(template);
    const heading = `${labels.module} ${index + 1}: ${labels.templateName(module.template)}`;
    const headline = !template || template.headline ? [`${labels.moduleTitle}: ${module.module_title}`] : [];
    const fields = template?.fields ?? [];
    return [
        sizes ? `${heading} (${sizes})` : heading,
        ...headline,
        "",
        ...fieldLines(module, fields.filter((spec) => !spec.afterSlots), labels),
        ...module.slots.flatMap((slot, i) =>
            slotLines(slot, (template && slotSpecAt(template, i)?.fields) || CLASSIC_FIELDS, slotPrefix(template, module, i, labels), labels),
        ),
        ...fieldLines(module, fields.filter((spec) => spec.afterSlots), labels),
        ...rowLines(module),
    ];
}

function bulletLines(doc: AplusDocumentDraft, labels: AplusTextLabels): string[] {
    const bullets = doc.bullets.filter((bullet) => bullet.heading.trim() || bullet.body.trim());
    if (bullets.length === 0) return [];
    return [`${labels.bullets}:`, "", ...bullets.flatMap((bullet) => [bullet.heading, bullet.body, ""])];
}

/**
 * The whole A+ document as plain text, in the layout authors keep next to
 * KDP's A+ manager: content name, short description with its character
 * count, bullets, then every module with its image size and fields.
 *
 * @example
 * await copyToClipboard(documentToText(doc, labels));
 */
export function documentToText(doc: AplusDocumentDraft, labels: AplusTextLabels): string {
    return [
        `${labels.contentName}: ${doc.content_name}`,
        "",
        `${labels.shortDescription} (${countCharacters(doc.short_description)} ${labels.characters}):`,
        "",
        doc.short_description,
        "",
        ...bulletLines(doc, labels),
        ...doc.modules.flatMap((module, i) => moduleLines(module, i, labels)),
    ].join("\n");
}
