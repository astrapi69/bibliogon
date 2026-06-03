import * as React from "react";

import {cn} from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

/*
 * Color comes exclusively from the token-mapped utilities defined in
 * styles/tailwind.css (``bg-primary`` -> ``var(--accent)``, etc.), so
 * every variant themes correctly across all 12 variants with zero
 * hardcoded color. ``rounded-[var(--radius-md)]`` shows the Phase-A
 * pattern for the non-color tokens that are NOT yet mapped into the
 * Tailwind theme (radius/shadow/font collide name-for-name with
 * Tailwind's own namespaces, so they are referenced via arbitrary
 * values until a later phase maps them under non-colliding keys).
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
    destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
    outline: "border border-border bg-transparent text-foreground hover:bg-muted",
    ghost: "bg-transparent text-foreground hover:bg-muted",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-6 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

/**
 * Co-existence proof for the Tailwind v4 + shadcn/ui adoption (Phase A).
 *
 * A shadcn-style button built on the token-mapped utility layer. It is
 * intentionally ``class-variance-authority``-free for Phase A (cva is a
 * separate dependency, deferred to the first real ``shadcn add`` pass)
 * and uses plain variant/size maps + ``cn()`` instead.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({className, variant = "primary", size = "md", type = "button", ...props}, ref) => (
        <button
            ref={ref}
            type={type}
            className={cn(
                "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                className,
            )}
            {...props}
        />
    ),
);

Button.displayName = "Button";
