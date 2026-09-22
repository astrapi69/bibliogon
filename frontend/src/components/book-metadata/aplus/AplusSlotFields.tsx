import { Trash2 } from "lucide-react";

import { APLUS_FIELD_LIMITS, type AplusSlotDraft } from "../../../lib/utils/aplus/aplusDocument";
import type { AplusSlotField, AplusSlotSpec } from "../../../lib/utils/aplus/moduleTemplates";
import type { TFunc } from "../tabTypes";
import AplusField from "./AplusField";

const CLASSIC_FIELDS: readonly AplusSlotField[] = ["title", "text", "image_prompt", "alt_text"];

interface FieldLook {
    labelKey: string;
    fallback: string;
    rows?: number;
    mono?: boolean;
    maxChars?: number;
}

const FIELD_LOOK: Record<AplusSlotField, FieldLook> = {
    title: { labelKey: "ui.aplus.module_title", fallback: "Titel" },
    text: { labelKey: "ui.aplus.module_text", fallback: "Text", rows: 3 },
    image_prompt: { labelKey: "ui.aplus.image_prompt", fallback: "Bild-Prompt", rows: 3, mono: true },
    alt_text: { labelKey: "ui.aplus.alt_text", fallback: "Alt-Text", rows: 2, maxChars: APLUS_FIELD_LIMITS.alt_text },
    caption: { labelKey: "ui.aplus.caption", fallback: "Bildunterschrift" },
    asin: { labelKey: "ui.aplus.asin", fallback: "ASIN" },
};

const TITLE_LIMIT_BY_TEMPLATE: Record<string, number> = { comparison_chart: 80 };

interface AplusSlotFieldsProps {
    slot: AplusSlotDraft;
    spec: AplusSlotSpec | undefined;
    templateId: string;
    prefix: string;
    heading: string | null;
    t: TFunc;
    onChange: (slot: AplusSlotDraft) => void;
    /** Shown only for templates with a variable number of image places. */
    onRemove?: () => void;
}

/**
 * The texts of one image place of an A+ module (#891, #895): the fields its
 * template slot lists (title, text, image prompt, alt text, caption, ASIN),
 * with the image size in the heading.
 *
 * @example
 * <AplusSlotFields slot={slot} spec={spec} templateId="comparison_chart" prefix="aplus-module-0-slot-0" heading="Bild 1" t={t} onChange={set} />
 */
export default function AplusSlotFields({ slot, spec, templateId, prefix, heading, t, onChange, onRemove }: AplusSlotFieldsProps) {
    const fields = spec?.fields ?? CLASSIC_FIELDS;
    return (
        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3" data-testid={prefix}>
            {(heading || onRemove) && (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                        {heading}
                        {spec && <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{spec.size}</span>}
                    </span>
                    {onRemove && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm min-h-[44px] min-w-[44px]"
                            data-testid={`${prefix}-remove`}
                            aria-label={t("ui.aplus.slot_remove", "Entfernen")}
                            title={t("ui.aplus.slot_remove", "Entfernen")}
                            onClick={onRemove}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            )}
            {fields.map((field) => {
                const look = FIELD_LOOK[field];
                const maxChars = field === "title" ? TITLE_LIMIT_BY_TEMPLATE[templateId] : look.maxChars;
                const suffix = field === "image_prompt" ? "prompt" : field === "alt_text" ? "alt" : field;
                return (
                    <AplusField
                        key={field}
                        label={t(look.labelKey, look.fallback)}
                        value={slot[field] ?? ""}
                        onChange={(value) => onChange({ ...slot, [field]: value })}
                        testId={`${prefix}-${suffix}`}
                        rows={look.rows}
                        mono={look.mono}
                        maxChars={maxChars}
                    />
                );
            })}
        </div>
    );
}
