import { EnhancedTextarea } from "../../textarea/EnhancedTextarea";

interface AplusFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    testId: string;
    /** Soft limit from the ruleset: the counter turns red, input is not capped. */
    maxChars?: number;
    rows?: number;
    mono?: boolean;
}

/**
 * One labelled A+ text field (#891): the shared `EnhancedTextarea` with its
 * copy button and character counter, grown to fit the text.
 *
 * @example
 * <AplusField label="Alt-Text" value={slot.alt_text} onChange={set} testId="alt" maxChars={200} />
 */
export default function AplusField({ label, value, onChange, testId, maxChars, rows = 1, mono }: AplusFieldProps) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
            <EnhancedTextarea
                value={value}
                onChange={onChange}
                ariaLabel={label}
                testid={testId}
                rows={rows}
                maxChars={maxChars}
                wordCount={false}
                mono={mono}
            />
        </div>
    );
}
