/**
 * CollapsibleConfigSection — shared collapsible wrapper for the
 * parent-level sections of the picture-book / comic editor right
 * sidebars (#109): the "Layout" picker, the per-layout config
 * sections ("Sprechblase", "Bild oben", ...), and the comic panel /
 * bubble panes.
 *
 * Mirrors the pattern the nested Tier sections (Tier1Section /
 * Tier2Section) already use — Radix Collapsible + the shared
 * ``sectionTrigger`` look + ``useCollapsibleState`` localStorage
 * persistence — so every section in these sidebars folds the same
 * way. The open/close height animation is shared via
 * ``COLLAPSIBLE_CONTENT_ANIMATION`` (Tailwind keyframes driven by
 * Radix' ``--radix-collapsible-content-height``), which the Tier
 * sections also apply for consistency.
 *
 * Unlike the Tier sections (defaultOpen=false), parent sections
 * default to OPEN so the pre-#109 at-a-glance sidebar stays the
 * out-of-the-box experience; the collapse choice persists per
 * ``storageKey``.
 */

import type {ReactNode} from "react";
import * as Collapsible from "@radix-ui/react-collapsible";

import {useCollapsibleState} from "../hooks/ui/useCollapsibleState";

import styles from "./comics/tier-section.module.css";

/** Tailwind utilities for the animated Collapsible.Content (#109).
 *  Reused by Tier1Section/Tier2Section so all sidebar sections share
 *  the same 200ms ease-out height transition. */
export const COLLAPSIBLE_CONTENT_ANIMATION =
    "overflow-hidden data-[state=open]:animate-collapsible-down " +
    "data-[state=closed]:animate-collapsible-up";

interface CollapsibleConfigSectionProps {
    /** localStorage slot for the open-state, convention
     *  ``bibliogon-collapsible-<scope>``. Sections that represent the
     *  same conceptual slot across layouts (the per-layout config
     *  body) deliberately share one key. */
    storageKey: string;
    /** Localized section heading rendered inside the trigger. */
    heading: string;
    /** Testid namespace: renders ``<prefix>-section-trigger`` +
     *  ``<prefix>-section-content``. */
    testidPrefix: string;
    /** Initial open-state when no persisted choice exists. */
    defaultOpen?: boolean;
    children: ReactNode;
}

export function CollapsibleConfigSection({
    storageKey,
    heading,
    testidPrefix,
    defaultOpen = true,
    children,
}: CollapsibleConfigSectionProps) {
    const {open, onOpenChange} = useCollapsibleState(storageKey, defaultOpen);
    return (
        <Collapsible.Root open={open} onOpenChange={onOpenChange}>
            <Collapsible.Trigger asChild>
                <button
                    type="button"
                    className={`${styles.sectionTrigger} min-h-11 w-full`}
                    data-testid={`${testidPrefix}-section-trigger`}
                    aria-expanded={open}
                >
                    <span className={styles.sectionChevron} aria-hidden>
                        {open ? "▾" : "▸"}
                    </span>
                    {heading}
                </button>
            </Collapsible.Trigger>
            <Collapsible.Content
                className={COLLAPSIBLE_CONTENT_ANIMATION}
                data-testid={`${testidPrefix}-section-content`}
            >
                {children}
            </Collapsible.Content>
        </Collapsible.Root>
    );
}
