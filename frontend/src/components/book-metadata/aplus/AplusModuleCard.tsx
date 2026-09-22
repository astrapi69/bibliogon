import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import {
    APLUS_FIELD_LIMITS,
    findTemplate,
    type AplusModuleDraft,
    type AplusSlotDraft,
} from "../../../lib/utils/aplus/aplusDocument";
import type { TFunc } from "../tabTypes";
import AplusField from "./AplusField";

interface AplusModuleCardProps {
    module: AplusModuleDraft;
    index: number;
    count: number;
    t: TFunc;
    onChange: (module: AplusModuleDraft) => void;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
}

/** Localised name of a module template, falling back to its id. */
export function templateLabel(templateId: string, t: TFunc): string {
    return t(`ui.aplus.template_${templateId}`, templateId);
}

function IconButton({
    label,
    testId,
    disabled,
    onClick,
    children,
}: {
    label: string;
    testId: string;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className="btn btn-ghost btn-sm min-h-[44px] min-w-[44px]"
            data-testid={testId}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function SlotFields({
    slot,
    prefix,
    heading,
    t,
    onChange,
}: {
    slot: AplusSlotDraft;
    prefix: string;
    heading: string | null;
    t: TFunc;
    onChange: (slot: AplusSlotDraft) => void;
}) {
    const set = (key: keyof AplusSlotDraft) => (value: string) => onChange({ ...slot, [key]: value });
    return (
        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
            {heading && <span className="text-sm font-semibold">{heading}</span>}
            <AplusField label={t("ui.aplus.module_title", "Titel")} value={slot.title} onChange={set("title")} testId={`${prefix}-title`} />
            <AplusField label={t("ui.aplus.module_text", "Text")} value={slot.text} onChange={set("text")} testId={`${prefix}-text`} rows={3} />
            <AplusField
                label={t("ui.aplus.image_prompt", "Bild-Prompt")}
                value={slot.image_prompt}
                onChange={set("image_prompt")}
                testId={`${prefix}-prompt`}
                rows={3}
                mono
            />
            <AplusField
                label={t("ui.aplus.alt_text", "Alt-Text")}
                value={slot.alt_text}
                onChange={set("alt_text")}
                testId={`${prefix}-alt`}
                maxChars={APLUS_FIELD_LIMITS.alt_text}
                rows={2}
            />
        </div>
    );
}

/**
 * One A+ module of the document (#891): header with template name, image
 * size and move / remove controls, the module title, then every image slot
 * with its title, text, image prompt and alt text.
 *
 * @example
 * <AplusModuleCard module={m} index={0} count={2} t={t} onChange={set} onMove={move} onRemove={remove} />
 */
export default function AplusModuleCard({ module, index, count, t, onChange, onMove, onRemove }: AplusModuleCardProps) {
    const template = findTemplate(module.template);
    const base = `aplus-module-${index}`;
    const multiSlot = module.slots.length > 1;
    const setSlot = (slotIndex: number) => (slot: AplusSlotDraft) =>
        onChange({ ...module, slots: module.slots.map((s, i) => (i === slotIndex ? slot : s)) });
    return (
        <section
            className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3"
            data-testid={base}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                    <strong className="text-sm">
                        {t("ui.aplus.module_n", "Modul {n}").replace("{n}", String(index + 1))}:{" "}
                        {templateLabel(module.template, t)}
                    </strong>
                    {template && (
                        <span className="text-xs text-[var(--text-muted)]">
                            {t("ui.aplus.image_size", "Bildgröße {size}, Seitenverhältnis {ratio}")
                                .replace("{size}", template.size)
                                .replace("{ratio}", template.aspectRatio)}
                        </span>
                    )}
                </div>
                <div className="flex gap-1">
                    <IconButton label={t("ui.aplus.module_up", "Nach oben")} testId={`${base}-up`} disabled={index === 0} onClick={() => onMove(-1)}>
                        <ChevronUp size={16} />
                    </IconButton>
                    <IconButton
                        label={t("ui.aplus.module_down", "Nach unten")}
                        testId={`${base}-down`}
                        disabled={index === count - 1}
                        onClick={() => onMove(1)}
                    >
                        <ChevronDown size={16} />
                    </IconButton>
                    <IconButton label={t("ui.aplus.module_remove", "Modul entfernen")} testId={`${base}-remove`} onClick={onRemove}>
                        <Trash2 size={16} />
                    </IconButton>
                </div>
            </div>
            <AplusField
                label={t("ui.aplus.module_name", "Modulname")}
                value={module.module_title}
                onChange={(value) => onChange({ ...module, module_title: value })}
                testId={`${base}-title`}
            />
            {module.slots.map((slot, i) => (
                <SlotFields
                    key={i}
                    slot={slot}
                    prefix={`${base}-slot-${i}`}
                    heading={multiSlot ? t("ui.aplus.image_n", "Bild {n}").replace("{n}", String(i + 1)) : null}
                    t={t}
                    onChange={setSlot(i)}
                />
            ))}
        </section>
    );
}
