import {
    countCharacters,
    findTemplate,
    type AplusDocumentDraft,
    type AplusModuleDraft,
    type AplusSlotDraft,
} from "./aplusDocument";

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
    templateName: (templateId: string) => string;
}

function slotLines(slot: AplusSlotDraft, prefix: string, labels: AplusTextLabels): string[] {
    return [
        `${prefix}${labels.title}: ${slot.title}`,
        `${prefix}${labels.text}: ${slot.text}`,
        `${prefix}${labels.imagePrompt}: ${slot.image_prompt}`,
        `${prefix}${labels.altText}: ${slot.alt_text}`,
        "",
    ];
}

function moduleLines(module: AplusModuleDraft, index: number, labels: AplusTextLabels): string[] {
    const size = findTemplate(module.template)?.size;
    const heading = `${labels.module} ${index + 1}: ${labels.templateName(module.template)}`;
    const multiSlot = module.slots.length > 1;
    return [
        size ? `${heading} (${size})` : heading,
        `${labels.moduleTitle}: ${module.module_title}`,
        "",
        ...module.slots.flatMap((slot, i) =>
            slotLines(slot, multiSlot ? `${labels.image} ${i + 1} ` : "", labels),
        ),
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
