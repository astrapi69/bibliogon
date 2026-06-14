import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useI18n } from "../../../../hooks/useI18n";
import type { BookImportOverrideKey } from "../../../../api/import";
import {
    type FieldSpec,
    type FieldState,
    formValueEmpty,
} from "./model";
import {
    inputStyle,
    sectionHeadingStyle,
    sectionStyle,
} from "./styles";

export function FieldSection({
    titleKey,
    fallback,
    fields,
    state,
    onUpdate,
}: {
    titleKey: string;
    fallback: string;
    fields: FieldSpec[];
    state: Record<BookImportOverrideKey, FieldState>;
    onUpdate: (key: BookImportOverrideKey, patch: Partial<FieldState>) => void;
}) {
    const { t } = useI18n();
    // Hide the section if every field in it is empty (detected gave us
    // nothing to show). User can still add via an "add field" row.
    const hasAnyValue = fields.some((f) => !formValueEmpty(state[f.key].value));
    const [showAll, setShowAll] = useState(false);
    const effectiveShowAll = showAll || hasAnyValue;
    const testid = `preview-section-${titleKey.split(".").pop()}`;
    return (
        <section data-testid={testid} style={sectionStyle}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                }}
            >
                <h4 style={sectionHeadingStyle}>{t(titleKey, fallback)}</h4>
                {!hasAnyValue && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        data-testid={`${testid}-toggle`}
                        onClick={() => setShowAll(!showAll)}
                        style={{ fontSize: "0.75rem" }}
                    >
                        {showAll ? (
                            <>
                                <X size={12} />{" "}
                                {t(
                                    "ui.import_wizard.section_hide_empty",
                                    "Hide empty fields",
                                )}
                            </>
                        ) : (
                            <>
                                <Plus size={12} />{" "}
                                {t(
                                    "ui.import_wizard.section_show_empty",
                                    "Add fields",
                                )}
                            </>
                        )}
                    </button>
                )}
            </div>
            {effectiveShowAll &&
                fields.map((f) => (
                    <FieldRow
                        key={f.key}
                        fieldKey={f.key}
                        labelKey={f.labelKey}
                        fallback={f.fallback}
                        longform={f.longform}
                        mono={f.mono}
                        state={state[f.key]}
                        onUpdate={(p) => onUpdate(f.key, p)}
                    />
                ))}
        </section>
    );
}

export function FieldRow({
    fieldKey,
    labelKey,
    fallback,
    longform,
    mono,
    state,
    onUpdate,
}: {
    fieldKey: BookImportOverrideKey;
    labelKey: string;
    fallback: string;
    longform?: boolean;
    mono?: boolean;
    state: FieldState;
    onUpdate: (patch: Partial<FieldState>) => void;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const isLong = (state.value || "").length > 200;
    const testid = `preview-field-${fieldKey.replace(/_/g, "-")}`;
    return (
        <div
            data-testid={`${testid}-row`}
            style={{ marginTop: 10, opacity: state.include ? 1 : 0.55 }}
        >
            <label
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    marginBottom: 4,
                }}
            >
                <input
                    type="checkbox"
                    data-testid={`${testid}-include`}
                    checked={state.include}
                    onChange={(e) =>
                        onUpdate({ include: e.target.checked })
                    }
                />
                {t(labelKey, fallback)}
            </label>
            {longform ? (
                <>
                    <textarea
                        data-testid={testid}
                        value={
                            isLong && !expanded
                                ? state.value.slice(0, 200) + "..."
                                : state.value
                        }
                        onChange={(e) =>
                            onUpdate({ value: e.target.value })
                        }
                        disabled={!state.include || (isLong && !expanded)}
                        style={{
                            ...inputStyle,
                            width: "100%",
                            minHeight: 60,
                            fontFamily: mono ? "var(--font-mono)" : undefined,
                            fontSize: mono ? "0.75rem" : "0.8125rem",
                            resize: "vertical",
                        }}
                    />
                    {isLong && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            data-testid={`${testid}-expand`}
                            onClick={() => setExpanded(!expanded)}
                            style={{ fontSize: "0.75rem", marginTop: 2 }}
                        >
                            {expanded
                                ? t(
                                      "ui.import_wizard.field_collapse",
                                      "Collapse",
                                  )
                                : t(
                                      "ui.import_wizard.field_expand",
                                      `Show all (${state.value.length} chars)`,
                                  )}
                        </button>
                    )}
                </>
            ) : (
                <input
                    data-testid={testid}
                    value={state.value}
                    onChange={(e) => onUpdate({ value: e.target.value })}
                    disabled={!state.include}
                    style={{
                        ...inputStyle,
                        width: "100%",
                        fontFamily: mono ? "var(--font-mono)" : undefined,
                        fontSize: mono ? "0.75rem" : "0.875rem",
                    }}
                />
            )}
        </div>
    );
}
