/**
 * SplitButton — shared primitive for "primary action + chevron
 * dropdown" pattern.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 C4 (2026-05-29). Extracted from
 * Dashboard's ``newBookGroup`` (live since PB-PHASE4 Session 3
 * Commit 9) per the Recurring-Component-Unification Rule
 * (2-surfaces threshold): C5 of this arc adds the same shape on
 * the Article Dashboard for the article-type dropdown.
 *
 * Visual contract:
 *
 *   [ Primary action ][ ▼ ]
 *
 * - Default click on the primary half fires the most-common
 *   action (the 90% case).
 * - Chevron opens a Radix DropdownMenu with the alternative
 *   actions (e.g. "create as picture_book" / "create as
 *   tutorial").
 *
 * Pattern reference: "split-button (default + chevron disclosure)
 * for primary + alternative outputs" lessons-learned rule. See
 * also: Toolbar Copy split-button (F3 v0.32.0) + Dashboard
 * newBookGroup.
 *
 * Lessons applied:
 * - ``onSelect`` handlers on DropdownMenu.Item do NOT call
 *   ``e.preventDefault()`` (per the Menu-Dialog Lifecycle
 *   lessons-learned rule). The menu auto-closes on select; the
 *   action handler runs after.
 * - Radix DropdownMenu + happy-dom is brittle for Vitest. The
 *   sibling test asserts on the rendered trigger; menu-content
 *   behavior is covered by Playwright smoke (C9 of this arc).
 */

import {ChevronDown} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type {ReactNode} from "react";

import styles from "./SplitButton.module.css";

export interface SplitButtonDropdownItem {
    /** Stable id used for the ``key`` prop AND the testid suffix
     *  on the rendered DropdownMenu.Item. */
    id: string;
    /** What the item displays. Caller composes icon + label as
     *  ReactNode. */
    content: ReactNode;
    /** Fires on item-select. Do NOT call ``e.preventDefault()``
     *  inside this handler — Radix auto-closes the menu, the
     *  handler runs after. */
    onSelect: () => void;
}

interface SplitButtonProps {
    /** Tailwind / btn-utility class string for the primary half
     *  (e.g. ``"btn btn-primary"``). The chevron half inherits
     *  the same class so visual cohesion is automatic. */
    buttonClass: string;
    /** "primary" (default) draws a 25%-white divider on the
     *  chevron; "secondary" uses a currentColor-based divider
     *  for outline / secondary button surfaces. */
    variant?: "primary" | "secondary";
    /** Display content of the primary half (icon + label). */
    primaryContent: ReactNode;
    /** Fires on click of the primary half (90%-case action). */
    onPrimaryClick: () => void;
    /** Disable both halves (e.g. while a previous create is
     *  in-flight). */
    disabled?: boolean;
    /** Tooltip + aria-label for the chevron (e.g. "Weitere
     *  Buch-Arten"). */
    chevronTooltip: string;
    /** Dropdown items rendered when the chevron opens. */
    dropdownItems: SplitButtonDropdownItem[];
    /** Wraps the whole group; useful for E2E discovery + parity
     *  with the original Dashboard ``new-book-group`` testid. */
    groupTestId?: string;
    /** Testid on the primary half. */
    primaryTestId?: string;
    /** Testid on the chevron half. */
    chevronTestId?: string;
    /** Prefix used to generate each DropdownMenu.Item's testid:
     *  ``{itemTestIdPrefix}-{item.id}``. */
    itemTestIdPrefix?: string;
}

export function SplitButton({
    buttonClass,
    variant = "primary",
    primaryContent,
    onPrimaryClick,
    disabled = false,
    chevronTooltip,
    dropdownItems,
    groupTestId,
    primaryTestId,
    chevronTestId,
    itemTestIdPrefix,
}: SplitButtonProps) {
    const chevronVariantClass =
        variant === "primary" ? styles.variantPrimary : styles.variantSecondary;

    return (
        <div className={styles.splitButtonGroup} data-testid={groupTestId}>
            <button
                type="button"
                className={buttonClass}
                onClick={onPrimaryClick}
                disabled={disabled}
                data-testid={primaryTestId}
            >
                {primaryContent}
            </button>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className={`${buttonClass} ${styles.chevron} ${chevronVariantClass}`}
                        disabled={disabled}
                        title={chevronTooltip}
                        aria-label={chevronTooltip}
                        data-testid={chevronTestId}
                    >
                        <ChevronDown size={14} />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        className="hamburger-menu-content"
                        align="end"
                        sideOffset={4}
                    >
                        {dropdownItems.map((item) => (
                            <DropdownMenu.Item
                                key={item.id}
                                className="hamburger-menu-item"
                                data-testid={
                                    itemTestIdPrefix
                                        ? `${itemTestIdPrefix}-${item.id.replace(/_/g, "-")}`
                                        : undefined
                                }
                                onSelect={() => item.onSelect()}
                            >
                                {item.content}
                            </DropdownMenu.Item>
                        ))}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}

export default SplitButton;
