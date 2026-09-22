import { emptyRow, rowWidth, type AplusModuleDraft, type AplusSlotDraft } from "./aplusDocument";
import { findTemplate } from "./moduleTemplates";

/**
 * Immutable edits of one A+ module within its template's limits (#895):
 * image places (columns of a comparison chart) and table rows. A comparison
 * row keeps one value per column, so adding or removing a column adds or
 * removes that value in every row. Every function returns a new module, or
 * the same one when the edit is not allowed.
 *
 * @example
 * const wider = canAddSlot(chart) ? addSlot(chart) : chart;
 */

function slotLimits(module: AplusModuleDraft): { min: number; max: number } {
    const template = findTemplate(module.template);
    return template ? { min: template.minSlots, max: template.maxSlots } : { min: 1, max: 1 };
}

export function canAddSlot(module: AplusModuleDraft): boolean {
    return module.slots.length < slotLimits(module).max;
}

export function canRemoveSlot(module: AplusModuleDraft): boolean {
    return module.slots.length > slotLimits(module).min;
}

const emptySlot = (): AplusSlotDraft => ({ title: "", text: "", image_prompt: "", alt_text: "", caption: "", asin: "" });

const isMatrix = (module: AplusModuleDraft): boolean => findTemplate(module.template)?.rows?.kind === "matrix";

export function addSlot(module: AplusModuleDraft): AplusModuleDraft {
    if (!canAddSlot(module)) return module;
    const rows = isMatrix(module) ? module.rows?.map((row) => ({ ...row, values: [...row.values, ""] })) : module.rows;
    return { ...module, slots: [...module.slots, emptySlot()], rows };
}

export function removeSlot(module: AplusModuleDraft, index: number): AplusModuleDraft {
    if (!canRemoveSlot(module)) return module;
    const rows = isMatrix(module)
        ? module.rows?.map((row) => ({ ...row, values: row.values.filter((_, i) => i !== index) }))
        : module.rows;
    return { ...module, slots: module.slots.filter((_, i) => i !== index), rows };
}

function rowLimits(module: AplusModuleDraft): { min: number; max: number } {
    const rows = findTemplate(module.template)?.rows;
    return rows ? { min: rows.min, max: rows.max } : { min: 0, max: 0 };
}

export function canAddRow(module: AplusModuleDraft): boolean {
    return (module.rows?.length ?? 0) < rowLimits(module).max;
}

export function canRemoveRow(module: AplusModuleDraft): boolean {
    return (module.rows?.length ?? 0) > rowLimits(module).min;
}

export function addRow(module: AplusModuleDraft): AplusModuleDraft {
    if (!canAddRow(module)) return module;
    const width = rowWidth(findTemplate(module.template), module.slots.length);
    return { ...module, rows: [...(module.rows ?? []), emptyRow(width)] };
}

export function removeRow(module: AplusModuleDraft, index: number): AplusModuleDraft {
    if (!canRemoveRow(module)) return module;
    return { ...module, rows: (module.rows ?? []).filter((_, i) => i !== index) };
}

/** Set a row's label (`"label"`) or the value in column `column`. */
export function setRowValue(
    module: AplusModuleDraft,
    rowIndex: number,
    column: number | "label",
    value: string,
): AplusModuleDraft {
    const rows = (module.rows ?? []).map((row, i) => {
        if (i !== rowIndex) return row;
        if (column === "label") return { ...row, label: value };
        return { ...row, values: row.values.map((v, j) => (j === column ? value : v)) };
    });
    return { ...module, rows };
}

export function setField(module: AplusModuleDraft, key: string, value: string): AplusModuleDraft {
    return { ...module, fields: { ...(module.fields ?? {}), [key]: value } };
}

export function setSlot(module: AplusModuleDraft, index: number, slot: AplusSlotDraft): AplusModuleDraft {
    return { ...module, slots: module.slots.map((s, i) => (i === index ? slot : s)) };
}
