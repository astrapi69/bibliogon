import type {ChangeEvent, ReactNode} from "react";
import {HelpText} from "./HelpText";

/**
 * Composition component for checkbox-style settings.
 *
 * Replaces the recurring
 * ``<label flex><input type="checkbox"><span></label><HelpText>``
 * pattern that grew across Settings sub-components. Canonical
 * Notion / Linear shape: a bold inline label aligned with the
 * checkbox, an optional short description below (HelpText), and
 * an optional ``children`` slot for nested conditional controls
 * (e.g. a follow-up RadixSelect that only renders when the
 * toggle is on).
 *
 * Sites that need a different visual shape (list-row with
 * side-by-side label+description, generic plugin-setting
 * renderers) deliberately stay separate from this component —
 * see the SETT-PHASE-3-TOGGLE-COMPONENT-01 archive entry for the
 * non-migration rationale.
 */
export function Toggle({
    label,
    description,
    checked,
    onChange,
    testId,
    indentedDescription = false,
    children,
}: {
    label: ReactNode;
    description?: ReactNode;
    checked: boolean;
    onChange: (next: boolean) => void;
    testId?: string;
    indentedDescription?: boolean;
    children?: ReactNode;
}) {
    return (
        <>
            <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
                    data-testid={testId}
                    style={{width: 16, height: 16, accentColor: "var(--accent)"}}
                />
                <span className="label" style={{margin: 0}}>{label}</span>
            </label>
            {children}
            {description ? (
                <HelpText indented={indentedDescription}>{description}</HelpText>
            ) : null}
        </>
    );
}
