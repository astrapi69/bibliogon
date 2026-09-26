import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import type { AplusModuleDraft } from "../../../lib/utils/aplus/aplusDocument";
import { addSlot, canAddSlot, canRemoveSlot, removeSlot, setField, setSlot } from "../../../lib/utils/aplus/moduleEdits";
import {
    findTemplate,
    imageSizesSummary,
    slotSpecAt,
    type AplusModuleTemplate,
    type AplusTextFieldSpec,
} from "../../../lib/utils/aplus/moduleTemplates";
import type { TFunc } from "../tabTypes";
import AplusField from "./AplusField";
import AplusRowsEditor from "./AplusRowsEditor";
import AplusModuleSketch from "./AplusModuleSketch";
import AplusSlotFields from "./AplusSlotFields";

interface AplusModuleCardProps {
    module: AplusModuleDraft;
    index: number;
    count: number;
    t: TFunc;
    onChange: (module: AplusModuleDraft) => void;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
}

/** Localised name of a module template, falling back to Amazon's name, then the id. */
export function templateLabel(templateId: string, t: TFunc): string {
    return t(`ui.aplus.template_${templateId}`, findTemplate(templateId)?.name ?? templateId);
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

function TemplateFields({
    module,
    specs,
    base,
    t,
    onChange,
}: {
    module: AplusModuleDraft;
    specs: readonly AplusTextFieldSpec[];
    base: string;
    t: TFunc;
    onChange: (module: AplusModuleDraft) => void;
}) {
    return (
        <>
            {specs.map((spec) => (
                <AplusField
                    key={spec.key}
                    label={t(spec.labelKey, spec.labelFallback).replace("{n}", String(spec.n ?? ""))}
                    value={module.fields?.[spec.key] ?? ""}
                    onChange={(value) => onChange(setField(module, spec.key, value))}
                    testId={`${base}-field-${spec.key}`}
                    rows={spec.multiline ? 3 : 1}
                    maxChars={spec.maxChars}
                />
            ))}
        </>
    );
}

function slotHeading(template: AplusModuleTemplate | undefined, module: AplusModuleDraft, index: number, t: TFunc): string | null {
    const spec = template ? slotSpecAt(template, index) : undefined;
    if (spec?.labelKey) return t(spec.labelKey, spec.labelFallback ?? "");
    if (template?.rows?.kind === "matrix") return t("ui.aplus.column_n", "Spalte {n}").replace("{n}", String(index + 1));
    return module.slots.length > 1 ? t("ui.aplus.image_n", "Bild {n}").replace("{n}", String(index + 1)) : null;
}

/**
 * One A+ module of the document (#891, #895), rendered from its catalog
 * template: header with name, image sizes and move / remove controls, the
 * module headline where Amazon has one, module-level texts, the image places
 * (added and removed within the template's limits), and table rows.
 *
 * @example
 * <AplusModuleCard module={m} index={0} count={2} t={t} onChange={set} onMove={move} onRemove={remove} />
 */
export default function AplusModuleCard({ module, index, count, t, onChange, onMove, onRemove }: AplusModuleCardProps) {
    const [expanded, setExpanded] = useState(false);
    const template = findTemplate(module.template);
    const base = `aplus-module-${index}`;
    const sizes = template ? imageSizesSummary(template) || t("ui.aplus.no_image", "Kein Bild") : "";
    const fields = template?.fields ?? [];
    const variableSlots = Boolean(template && template.maxSlots > template.minSlots);
    const toggleLabel = expanded ? t("ui.common.close", "Schliessen") : t("ui.common.edit", "Bearbeiten");
    const moduleTitle = (module.module_title ?? "").trim();
    const handleToggle = () => setExpanded((prev) => !prev);
    const actionButtons = (
        <>
            <IconButton label={t("ui.aplus.module_up", "Nach oben")} testId={`${base}-up`} disabled={index === 0} onClick={() => onMove(-1)}>
                <ChevronUp size={16} />
            </IconButton>
            <IconButton label={t("ui.aplus.module_down", "Nach unten")} testId={`${base}-down`} disabled={index === count - 1} onClick={() => onMove(1)}>
                <ChevronDown size={16} />
            </IconButton>
            <IconButton label={t("ui.aplus.module_remove", "Modul entfernen")} testId={`${base}-remove`} onClick={onRemove}>
                <Trash2 size={16} />
            </IconButton>
        </>
    );

    if (!expanded) {
        return (
            <section
                className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] p-3"
                data-testid={base}
                data-state="collapsed"
            >
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        {template && (
                            <div className="w-28 shrink-0">
                                <AplusModuleSketch template={template} />
                            </div>
                        )}
                        <div className="flex min-w-0 flex-col gap-1">
                            <strong className="text-sm">
                                {t("ui.aplus.module_n", "Modul {n}").replace("{n}", String(index + 1))}: {templateLabel(module.template, t)}
                            </strong>
                            {sizes && <span className="text-xs text-[var(--text-muted)]">{sizes}</span>}
                            {moduleTitle && <span className="text-xs text-[var(--text-muted)]">{moduleTitle}</span>}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm min-h-[44px]"
                            data-testid={`${base}-toggle`}
                            onClick={handleToggle}
                            aria-expanded={expanded}
                        >
                            {toggleLabel}
                        </button>
                        {actionButtons}
                    </div>
                </div>
            </section>
        );
    }
    return (
        <section className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3" data-testid={base} data-state="open">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                    <strong className="text-sm">
                        {t("ui.aplus.module_n", "Modul {n}").replace("{n}", String(index + 1))}: {templateLabel(module.template, t)}
                    </strong>
                    {sizes && <span className="text-xs text-[var(--text-muted)]">{sizes}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        data-testid={`${base}-toggle`}
                        onClick={handleToggle}
                        aria-expanded={expanded}
                    >
                        {toggleLabel}
                    </button>
                    {actionButtons}
                </div>
            </div>
            {(!template || template.headline) && (
                <AplusField
                    label={t("ui.aplus.module_headline", "Modul-Überschrift")}
                    value={module.module_title}
                    onChange={(value) => onChange({ ...module, module_title: value })}
                    testId={`${base}-title`}
                />
            )}
            <TemplateFields module={module} specs={fields.filter((spec) => !spec.afterSlots)} base={base} t={t} onChange={onChange} />
            {module.slots.map((slot, i) => (
                <AplusSlotFields
                    key={i}
                    slot={slot}
                    spec={template ? slotSpecAt(template, i) : undefined}
                    templateId={module.template}
                    prefix={`${base}-slot-${i}`}
                    heading={slotHeading(template, module, i, t)}
                    t={t}
                    onChange={(next) => onChange(setSlot(module, i, next))}
                    onRemove={variableSlots && canRemoveSlot(module) ? () => onChange(removeSlot(module, i)) : undefined}
                />
            ))}
            {variableSlots && (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-[44px] self-start"
                    data-testid={`${base}-add-slot`}
                    disabled={!canAddSlot(module)}
                    onClick={() => onChange(addSlot(module))}
                >
                    <Plus size={14} />{" "}
                    {template?.rows?.kind === "matrix"
                        ? t("ui.aplus.column_add", "Spalte hinzufügen")
                        : t("ui.aplus.image_add", "Bild hinzufügen")}
                </button>
            )}
            <TemplateFields module={module} specs={fields.filter((spec) => spec.afterSlots)} base={base} t={t} onChange={onChange} />
            {template?.rows && <AplusRowsEditor module={module} spec={template.rows} prefix={base} t={t} onChange={onChange} />}
        </section>
    );
}
