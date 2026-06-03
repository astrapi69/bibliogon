import * as React from "react";
import {ChevronLeft} from "lucide-react";

import {cn} from "@/lib/utils";

export type PageMaxWidth = "sm" | "md" | "lg" | "xl";

const MAX_WIDTH: Record<PageMaxWidth, string> = {
    sm: "max-w-lg",
    md: "max-w-2xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
};

export interface PageLayoutProps {
    /** Page heading, rendered as the <h1>. */
    title: string;
    /** Content max-width bucket (readability). Default "lg". */
    maxWidth?: PageMaxWidth;
    /** Back-navigation handler (usually from `useGoBack`). Omit to hide. */
    onBack?: () => void;
    /** Accessible label for the back button (i18n; pass via t()). */
    backLabel?: string;
    /** Optional right-aligned header controls (e.g. ThemeToggle). */
    actions?: React.ReactNode;
    /** testid namespace for the page root; back button gets `${testId}-back`. */
    testId?: string;
    /** Optional testid for the <h1> title (e.g. a page that preserves a
     *  per-variant title testid from the dialog it replaced). */
    titleTestId?: string;
    children: React.ReactNode;
}

/**
 * Shared full-page layout for the Dialog->Pages migration. Replaces the
 * per-dialog overlay/centering with a real, deep-linkable, responsive
 * page: a sticky-free header (back button + title + optional actions)
 * over a max-width content column. Tailwind utilities only, all colors
 * via the Phase-A token bridge (bg-background/text-foreground/border-
 * border), so it themes across all 12 variants and stays responsive
 * (no fixed dialog width).
 */
export function PageLayout({
    title,
    maxWidth = "lg",
    onBack,
    backLabel,
    actions,
    testId,
    titleTestId,
    children,
}: PageLayoutProps) {
    const widthClass = MAX_WIDTH[maxWidth];
    return (
        <div className="min-h-screen bg-background text-foreground" data-testid={testId}>
            <header className="border-b border-border">
                <div className={cn("mx-auto flex items-center gap-3 px-4 py-4 sm:px-6", widthClass)}>
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
                        className="flex-1 font-[family-name:var(--font-display)] text-xl font-semibold"
                        data-testid={titleTestId}
                    >
                        {title}
                    </h1>
                    {actions}
                </div>
            </header>
            <main id="main-content" className={cn("mx-auto px-4 py-6 sm:px-6", widthClass)}>
                {children}
            </main>
        </div>
    );
}
