import {useI18n} from "../../../hooks/useI18n";

/** Render a single scalar plugin setting with the right input type:
 *  boolean -> checkbox, number -> number input, string -> text input.
 *  Replaces the previous "everything is a text input" path that turned
 *  booleans into the literal strings "true"/"false".
 */
export function ScalarSettingField({
    settingKey,
    value,
    onChange,
}: {
    settingKey: string;
    value: unknown;
    onChange: (v: string | number | boolean) => void;
}) {
    const {t} = useI18n();
    const label = t(`ui.audiobook.${settingKey}`, settingKey);

    if (typeof value === "boolean") {
        return (
            <div className="field">
                <label className="label icon-row">
                    <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => onChange(e.target.checked)}
                    />
                    {label}
                </label>
            </div>
        );
    }

    if (typeof value === "number") {
        return (
            <div className="field">
                <label className="label">{label}</label>
                <input
                    className="input"
                    type="number"
                    value={String(value)}
                    onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isNaN(parsed)) onChange(parsed);
                    }}
                />
            </div>
        );
    }

    // string fallback (also covers null/undefined coerced to empty)
    return (
        <div className="field">
            <label className="label">{label}</label>
            <input
                className="input"
                type="text"
                value={value == null ? "" : String(value)}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
