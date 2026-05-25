import type {CSSProperties, ReactNode} from "react";

/**
 * Standardized small italic help-text under inputs / checkboxes /
 * sections in Settings.
 *
 * Replaces the 3 inconsistent font-size variants
 * (0.7rem / 0.75rem / 0.8125rem) that grew across the Settings
 * sub-components. All call sites now share a single typography:
 * ``text-muted`` colour, 0.75rem, ``display: block`` + 4px top
 * margin.
 *
 * ``indented`` toggles a 24px left margin for help text that
 * appears under a checkbox row so it aligns under the label,
 * not under the checkbox. ``style`` lets call sites tweak
 * residual layout (e.g. ``marginBottom`` for a section trailer).
 */
export function HelpText({
    children,
    indented = false,
    style,
    testId,
}: {
    children: ReactNode;
    indented?: boolean;
    style?: CSSProperties;
    testId?: string;
}) {
    return (
        <small
            data-testid={testId}
            style={{
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                marginTop: 4,
                display: "block",
                ...(indented ? {marginLeft: 24} : {}),
                ...style,
            }}
        >
            {children}
        </small>
    );
}
