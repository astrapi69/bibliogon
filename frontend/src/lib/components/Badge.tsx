import type {CSSProperties, ReactNode} from "react";

export type BadgeVariant =
    | "default"
    | "muted"
    | "success"
    | "warning"
    | "danger"
    | "info";

export interface BadgeProps {
    children: ReactNode;
    /** Semantic color variant. Defaults to "default". */
    variant?: BadgeVariant;
    /** Smaller pill (1px 6px / 0.625rem). */
    size?: "sm" | "md";
    /** Optional leading icon (already-sized Lucide element, etc.). */
    icon?: ReactNode;
    testId?: string;
    title?: string;
    /** Extra class appended after the badge classes. */
    className?: string;
    style?: CSSProperties;
}

/**
 * Canonical status / type / tier / count pill. Backed by the global
 * `.badge` + `.badge-{variant}` classes (color-mix tints of the
 * semantic tokens, themed across all 12 variants — no hardcoded
 * colors). Replaces the ad-hoc inline-styled status pills that grew
 * across the dashboards, cards, panels and wizards.
 *
 * 2026-05-30 component-consistency sweep (Session 2C).
 */
export function Badge({
    children,
    variant = "default",
    size = "md",
    icon,
    testId,
    title,
    className,
    style,
}: BadgeProps) {
    const classes = [
        "badge",
        `badge-${variant}`,
        size === "sm" ? "badge-sm" : "",
        className ?? "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <span
            className={classes}
            data-testid={testId}
            title={title}
            style={style}
        >
            {icon}
            <span>{children}</span>
        </span>
    );
}

export default Badge;
