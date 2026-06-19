import { useState, type CSSProperties } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Props for {@link TokenInput}. The component is intentionally app-import-free
 * (library-grade): i18n strings for the reveal/hide toggle are passed IN as
 * props rather than resolved through a hook, so this stays importable from
 * anywhere without dragging the app in.
 */
export interface TokenInputProps {
    /** Current secret value (controlled). */
    value: string;
    /** Called with the new value on every edit. */
    onChange: (value: string) => void;
    /** Placeholder shown when empty. */
    placeholder?: string;
    /** Start masked (dots) with an eye-toggle to reveal. Default `true`.
     *  When `false`, the value is always plain and no toggle is rendered. */
    masked?: boolean;
    /** Disable the input + toggle. */
    disabled?: boolean;
    /** `id` for the `<input>` (pair with an external `<label htmlFor>`). */
    id?: string;
    /** `data-testid` for the input; the toggle gets `${testId}-toggle`. */
    testId?: string;
    /** Accessible label for the "reveal" action (e.g. t("ui.common.show")). */
    showLabel?: string;
    /** Accessible label for the "hide" action (e.g. t("ui.common.hide")). */
    hideLabel?: string;
    /** Extra classes appended to the input (kept on the shared `.input` look). */
    className?: string;
    /** Focus the input on mount. */
    autoFocus?: boolean;
}

/**
 * Single-line input for secrets (API keys, access tokens) that must NOT trigger
 * the browser's password manager.
 *
 * Why not `type="password"`: that is exactly the signal password managers key
 * on (autofill dropdown + "save password"). Instead the input is always
 * `type="text"`; masking is done visually via `-webkit-text-security` toggled
 * by an eye-icon button. Autofill is further suppressed with `autocomplete`
 * off + the per-manager opt-out attributes (`data-1p-ignore`,
 * `data-lpignore`, `data-form-type`). No `<form>` wrapper is rendered.
 *
 * Library-First note: this is hand-built (hierarchy stage 4) because no
 * stage-1..3 option covers the specific combination of *non-`type=password`
 * masking* + *password-manager suppression*. It is a thin wrapper over a native
 * `<input>` + two `lucide-react` icons, with no app imports.
 *
 * @example
 * <TokenInput
 *   value={apiKey}
 *   onChange={setApiKey}
 *   placeholder="sk-..."
 *   showLabel={t("ui.common.show", "Anzeigen")}
 *   hideLabel={t("ui.common.hide", "Ausblenden")}
 *   testId="ai-api-key-input"
 * />
 */
export function TokenInput({
    value,
    onChange,
    placeholder,
    masked = true,
    disabled = false,
    id,
    testId,
    showLabel,
    hideLabel,
    className,
    autoFocus,
}: TokenInputProps) {
    const [revealed, setRevealed] = useState(false);
    const obscured = masked && !revealed;
    const inputClassName = className ? `input flex-1 ${className}` : "input flex-1";
    const inputStyle: CSSProperties | undefined = obscured
        ? ({ WebkitTextSecurity: "disc" } as CSSProperties)
        : undefined;

    return (
        <div className="flex flex-1 items-center gap-2">
            <input
                id={id}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                data-masked={obscured ? "true" : "false"}
                data-testid={testId}
                className={inputClassName}
                style={inputStyle}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={(e) => onChange(e.target.value)}
            />
            {masked && (
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={disabled}
                    onClick={() => setRevealed((r) => !r)}
                    aria-pressed={revealed}
                    aria-label={revealed ? hideLabel : showLabel}
                    title={revealed ? hideLabel : showLabel}
                    data-testid={testId ? `${testId}-toggle` : undefined}
                >
                    {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
            )}
        </div>
    );
}
