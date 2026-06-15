import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Menu } from "lucide-react";
import type React from "react";

/** A single selectable navigation entry. */
export interface NavigationSidebarItem {
    /** Stable identifier passed to {@link NavigationSidebarProps.onSelect}. */
    id: string;
    /** Display label (already i18n-resolved by the caller). */
    label: string;
    /** Optional leading icon (e.g. a Lucide glyph). */
    icon?: React.ReactNode;
    /** When true, the item renders muted and is not clickable. */
    disabled?: boolean;
    /** Optional trailing badge text (e.g. a count). */
    badge?: string;
    /** ``data-testid`` for the desktop button. The mobile item reuses
     *  it suffixed with ``-mobile``. */
    testId?: string;
}

/** A labelled group of navigation entries. */
export interface NavigationSidebarGroup {
    /** Optional visible group header (rendered as an ``<h2>``). Groups
     *  without a label render only their items. */
    label?: string;
    items: NavigationSidebarItem[];
}

export interface NavigationSidebarProps {
    /** The grouped navigation entries. */
    groups: NavigationSidebarGroup[];
    /** The currently active item id. */
    activeId: string;
    /** Called with an item id when the user selects it. */
    onSelect: (id: string) => void;
    /** Tailwind breakpoint prefix at which the desktop sidebar replaces
     *  the mobile hamburger. Default ``"md"`` (768px), matching the
     *  Settings page. Supported: ``"sm" | "md" | "lg" | "xl" | "2xl"``. */
    hamburgerBreakpoint?: string;
    /** Accessible label for the ``<nav>`` + hamburger trigger. */
    ariaLabel?: string;
}

const DESKTOP_VISIBLE: Record<string, string> = {
    sm: "hidden sm:flex",
    md: "hidden md:flex",
    lg: "hidden lg:flex",
    xl: "hidden xl:flex",
    "2xl": "hidden 2xl:flex",
};

const MOBILE_VISIBLE: Record<string, string> = {
    sm: "flex sm:hidden",
    md: "flex md:hidden",
    lg: "flex lg:hidden",
    xl: "flex xl:hidden",
    "2xl": "flex 2xl:hidden",
};

/**
 * A generic responsive section-navigation: a desktop vertical sidebar
 * (>= the chosen breakpoint) AND a mobile hamburger popover (< the
 * breakpoint), both driven from a single ``groups`` array. Both
 * surfaces are always mounted; CSS ``display`` (Tailwind responsive
 * classes) toggles which is visible — no JS breakpoint detection.
 *
 * The look matches Bibliogon's Settings menu 1:1 via theme tokens
 * (220px sidebar with sticky positioning supplied by the caller's
 * column, group ``<h2>`` headers, ``text-indent`` sub-items, an active
 * state of ``--bg-hover`` background + ``--accent`` text + weight 600 +
 * ``aria-current="page"``). The hamburger is a Radix DropdownMenu whose
 * items auto-close on select (no ``e.preventDefault()``, per the
 * Menu-Dialog-Lifecycle rule) and mark the active entry with a Check.
 *
 * It is props-driven with no app imports, so it is reusable across
 * pages: the consumer owns active-state + routing, this component is a
 * dumb renderer.
 *
 * @example
 * ```tsx
 * const groups: NavigationSidebarGroup[] = [
 *   { label: "Content", items: [{ id: "general", label: "General", testId: "tab-general" }] },
 * ];
 * <NavigationSidebar
 *   groups={groups}
 *   activeId={activeTab}
 *   onSelect={setActiveTab}
 *   ariaLabel="Section navigation"
 * />
 * ```
 */
export function NavigationSidebar({
    groups,
    activeId,
    onSelect,
    hamburgerBreakpoint = "md",
    ariaLabel,
}: NavigationSidebarProps) {
    const desktopVisible = DESKTOP_VISIBLE[hamburgerBreakpoint] ?? DESKTOP_VISIBLE.md;
    const mobileVisible = MOBILE_VISIBLE[hamburgerBreakpoint] ?? MOBILE_VISIBLE.md;

    const flatItems = groups.flatMap((g) => g.items);
    const activeLabel = flatItems.find((i) => i.id === activeId)?.label ?? "";

    return (
        <>
            {/* Desktop sidebar */}
            <nav
                className={`${desktopVisible} flex-col gap-1`}
                aria-label={ariaLabel}
                data-testid="navigation-sidebar"
            >
                {groups.map((group, groupIdx) => {
                    const headingId = group.label
                        ? `navigation-sidebar-heading-${groupIdx}`
                        : undefined;
                    return (
                        <div
                            key={group.label ?? `group-${groupIdx}`}
                            className="flex flex-col gap-1"
                            data-testid={`navigation-sidebar-section-${groupIdx}`}
                        >
                            {group.label ? (
                                <h2
                                    id={headingId}
                                    className="m-0 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] leading-[1.4] text-[var(--text-muted)] font-[var(--font-body)]"
                                >
                                    {group.label}
                                </h2>
                            ) : null}
                            <ul
                                className="m-0 flex list-none flex-col gap-0.5 p-0"
                                aria-labelledby={headingId}
                            >
                                {group.items.map((item) => {
                                    const isActive = item.id === activeId;
                                    const linkClass = [
                                        "flex w-full items-center gap-2 text-left",
                                        "min-h-[44px] px-3 py-2 rounded-[var(--radius-sm)]",
                                        "indent-[12px] cursor-pointer border-0 bg-transparent",
                                        "text-sm font-[var(--font-body)]",
                                        "transition-colors duration-100",
                                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                                        isActive
                                            ? "bg-[var(--bg-hover)] text-[var(--accent)] font-semibold"
                                            : "font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                                        item.disabled ? "cursor-not-allowed opacity-50" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ");
                                    return (
                                        <li key={item.id} className="m-0 p-0">
                                            <button
                                                type="button"
                                                className={linkClass}
                                                data-testid={item.testId}
                                                aria-current={isActive ? "page" : undefined}
                                                disabled={item.disabled}
                                                onClick={() => onSelect(item.id)}
                                            >
                                                {item.icon}
                                                <span className="flex-1">{item.label}</span>
                                                {item.badge ? (
                                                    <span className="rounded-[4px] bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--text-muted)]">
                                                        {item.badge}
                                                    </span>
                                                ) : null}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* Mobile hamburger */}
            <div className={`${mobileVisible} my-3`} data-testid="navigation-sidebar-mobile">
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn btn-secondary inline-flex min-h-[44px] items-center gap-1.5 text-sm"
                            data-testid="navigation-sidebar-mobile-trigger"
                            aria-label={ariaLabel}
                        >
                            <Menu size={16} />
                            <span>{activeLabel}</span>
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            className="hamburger-menu-content"
                            align="start"
                            sideOffset={4}
                        >
                            {groups.map((group, groupIdx) => (
                                <div key={group.label ?? `group-${groupIdx}`}>
                                    {groupIdx > 0 ? (
                                        <DropdownMenu.Separator className="hamburger-menu-separator" />
                                    ) : null}
                                    {group.items.map((item) => (
                                        <DropdownMenu.Item
                                            key={item.id}
                                            className="hamburger-menu-item min-h-[44px]"
                                            data-testid={item.testId ? `${item.testId}-mobile` : undefined}
                                            disabled={item.disabled}
                                            onSelect={() => onSelect(item.id)}
                                        >
                                            {item.icon}
                                            <span className="flex-1">{item.label}</span>
                                            {item.id === activeId ? <Check size={14} /> : null}
                                        </DropdownMenu.Item>
                                    ))}
                                </div>
                            ))}
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
            </div>
        </>
    );
}
