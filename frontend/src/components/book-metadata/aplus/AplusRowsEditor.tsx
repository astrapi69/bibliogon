import { Plus, Trash2 } from "lucide-react";

import type { AplusModuleDraft } from "../../../lib/utils/aplus/aplusDocument";
import { addRow, canAddRow, canRemoveRow, removeRow, setRowValue } from "../../../lib/utils/aplus/moduleEdits";
import type { AplusRowsSpec } from "../../../lib/utils/aplus/moduleTemplates";
import type { TFunc } from "../tabTypes";

/** Amazon's limit for a comparison metric or label (`PlainTextItem.value`). */
const CELL_LIMIT = 250;

interface AplusRowsEditorProps {
    module: AplusModuleDraft;
    spec: AplusRowsSpec;
    prefix: string;
    t: TFunc;
    onChange: (module: AplusModuleDraft) => void;
}

function Cell({ value, label, testId, onChange }: { value: string; label: string; testId: string; onChange: (value: string) => void }) {
    return (
        <input
            className="input min-h-[44px] min-w-0 flex-1"
            value={value}
            aria-label={label}
            maxLength={CELL_LIMIT}
            data-testid={testId}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

/**
 * Table rows of an A+ module (#895): name/definition pairs for the tech
 * specs, or a metric with one value per column for the comparison chart.
 * Rows are added and removed within the template's limits.
 *
 * @example
 * <AplusRowsEditor module={m} spec={template.rows} prefix="aplus-module-0" t={t} onChange={set} />
 */
export default function AplusRowsEditor({ module, spec, prefix, t, onChange }: AplusRowsEditorProps) {
    const rows = module.rows ?? [];
    const matrix = spec.kind === "matrix";
    const labelText = matrix ? t("ui.aplus.row_metric", "Merkmal") : t("ui.aplus.row_name", "Bezeichnung");
    return (
        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-sm font-semibold">
                {matrix ? t("ui.aplus.rows_comparison", "Vergleichszeilen") : t("ui.aplus.rows_specs", "Angaben")}
            </span>
            {rows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
                    <Cell value={row.label} label={labelText} testId={`${prefix}-row-${i}-label`} onChange={(v) => onChange(setRowValue(module, i, "label", v))} />
                    {row.values.map((value, column) => (
                        <Cell
                            key={column}
                            value={value}
                            label={
                                matrix
                                    ? t("ui.aplus.column_n", "Spalte {n}").replace("{n}", String(column + 1))
                                    : t("ui.aplus.row_value", "Beschreibung")
                            }
                            testId={`${prefix}-row-${i}-value-${column}`}
                            onChange={(v) => onChange(setRowValue(module, i, column, v))}
                        />
                    ))}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm min-h-[44px] min-w-[44px]"
                        data-testid={`${prefix}-row-${i}-remove`}
                        aria-label={t("ui.aplus.row_remove", "Zeile entfernen")}
                        title={t("ui.aplus.row_remove", "Zeile entfernen")}
                        disabled={!canRemoveRow(module)}
                        onClick={() => onChange(removeRow(module, i))}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="btn btn-secondary btn-sm min-h-[44px] self-start"
                data-testid={`${prefix}-add-row`}
                disabled={!canAddRow(module)}
                onClick={() => onChange(addRow(module))}
            >
                <Plus size={14} /> {t("ui.aplus.row_add", "Zeile hinzufügen")}
            </button>
        </div>
    );
}
