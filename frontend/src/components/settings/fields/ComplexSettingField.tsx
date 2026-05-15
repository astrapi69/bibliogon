import {useEffect, useState} from "react";
import {useI18n} from "../../../hooks/useI18n";

/** Editable JSON textarea for nested object settings. Validates on blur
 *  and only commits when the JSON parses; otherwise the local edit is
 *  kept and a warning is shown so the user does not silently lose work.
 */
export function ComplexSettingField({
    settingKey,
    value,
    onChange,
}: {
    settingKey: string;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    const {t} = useI18n();
    const [text, setText] = useState(() => JSON.stringify(value, null, 2));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setText(JSON.stringify(value, null, 2));
        setError(null);
    }, [value]);

    const commit = () => {
        try {
            const parsed = JSON.parse(text);
            setError(null);
            onChange(parsed);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <div style={{marginBottom: 12}}>
            <label className="label">
                {settingKey}{" "}
                <span style={{fontWeight: 400, fontSize: "0.75rem", color: "var(--text-muted)"}}>
                    ({t("ui.settings.advanced_hint", "JSON, nur für fortgeschrittene User")})
                </span>
            </label>
            <textarea
                className="input"
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8125rem",
                    minHeight: 120,
                    width: "100%",
                }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
            />
            {error && (
                <small style={{color: "var(--danger, #ef4444)", fontSize: "0.75rem"}}>
                    {t("ui.settings.invalid_json", "Ungültiges JSON")}: {error}
                </small>
            )}
        </div>
    );
}
