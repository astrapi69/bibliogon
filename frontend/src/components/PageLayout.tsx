import * as React from "react";
import {BookOpen, ChevronLeft} from "lucide-react";
import {useNavigate} from "react-router-dom";

import ThemeToggle from "./ThemeToggle";
import {cn} from "@/lib/utils";

export type PageMaxWidth = "sm" | "md" | "lg" | "xl";

const MAX_WIDTH: Record<PageMaxWidth, string> = {
    sm: "max-w-lg",
    md: "max-w-2xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
};

export interface PageLayoutProps {
    /** Page heading, rendered as the <h1> at the top of the content. */
    title: string;
    /** Content max-width bucket (readability). Default "lg". */
    maxWidth?: PageMaxWidth;
    /** Back-navigation handler (usually from `useGoBack`). Omit to hide. */
    onBack?: () => void;
    /** Accessible label for the back button (i18n; pass via t()). */
    backLabel?: string;
    /** Optional right-aligned header controls, shown left of the theme
     *  toggle. */
    actions?: React.ReactNode;
    /** testid namespace for the page root; back button gets `${testId}-back`. */
    testId?: string;
    /** Optional testid for the <h1> title (e.g. a page that preserves a
     *  per-variant title testid from the dialog it replaced). */
    titleTestId?: string;
    /** Wrap the title + content in a centered card surface (bg-card +
     *  border + shadow + padding), matching the Medium-import / wizard
     *  visual language so every Dialog->Pages page reads as the same
     *  kind of surface. Default `true`; pass `false` for a page that
     *  manages its own full-bleed layout. */
    card?: boolean;
    children: React.ReactNode;
}

/**
 * Shared full-page layout for the Dialog->Pages migration. Carries the
 * same app-chrome header as the rest of Bibliogon (Dashboard / Settings /
 * editors): the Bibliogon brand on the left (click -> dashboard) and the
 * theme toggle on the right, on a `bg-card` bar with the same tokens, so
 * a deep-linked page reads as "still inside Bibliogon" rather than a
 * separate surface. The page-specific back button + title sit in a
 * centered, max-width content column below, wrapped in a card surface.
 * Pure Tailwind utilities, all colors via the token bridge. (Spacing
 * utilities rely on the global `*` reset living in `@layer base` so the
 * `utilities` layer outranks it -- see global.css.)
 */
export function PageLayout({
    title,
    maxWidth = "lg",
    onBack,
    backLabel,
    actions,
    testId,
    titleTestId,
    card = true,
    children,
}: PageLayoutProps) {
    const navigate = useNavigate();
    const widthClass = MAX_WIDTH[maxWidth];
    return (
        <div className="min-h-screen bg-background text-foreground" data-testid={testId}>
            {/* App-chrome header — brand left, controls right, on a
                bg-card bar (same surface as the Medium-import header). */}
            <header className="border-b border-border bg-card">
                <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6">
                    {/* `appearance-none border-0 bg-transparent p-0` strips the
                        user-agent button chrome (Preflight is omitted, so a bare
                        <button> otherwise renders the browser default light-grey
                        box + outset border -- the "logo is white in dark mode"
                        report). The whole mark is `text-primary` (=> var(--accent)),
                        designed to stay legible on the bg-card bar in every
                        light/dark variant. */}
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        className="flex cursor-pointer appearance-none items-center gap-2.5 border-0 bg-transparent p-0 text-primary"
                        title="Dashboard"
                        data-testid={testId ? `${testId}-home` : "page-home"}
                    >
                        <BookOpen size={28} strokeWidth={1.5} />
                        <span className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-primary">
                            Bibliogon
                        </span>
                    </button>
                    <div className="flex items-center gap-2">
                        {actions}
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main id="main-content" className={cn("mx-auto px-4 py-8 sm:px-6", widthClass)}>
                {/* Centered card surface (Dialog->Pages visual parity): the same
                    bg-card + border + radius + padding language as the
                    Medium-import cards, so every migrated page reads as the same
                    kind of surface. Tokens only -> verify-theme stays
                    authoritative across all 12 variants. */}
                <div
                    className={cn(
                        card &&
                            "rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-[var(--shadow-md)] sm:p-8",
                    )}
                >
                    <div className="mb-6 flex items-center gap-3">
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                className="btn-icon"
                                aria-label={backLabel ?? "Back"}
                                data-testid={testId ? `${testId}-back` : "page-back"}
                            >
                                <ChevronLeft size={18} />
                            </button>
                        )}
                        <h1
                            className="font-[family-name:var(--font-display)] text-2xl font-semibold"
                            data-testid={titleTestId}
                        >
                            {title}
                        </h1>
                    </div>
                    {children}
                </div>
            </main>
        </div>
    );
}
