import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Menu as MenuIcon, ChevronDown, ChevronRight } from "lucide-react";

/**
 * A single selectable entry in an {@link EditorMenuGroup}.
 *
 * An entry is one of three shapes:
 *  - a normal action (`id` + `label`, optionally `icon` / `shortcut`),
 *  - a one-level submenu (`submenu` set) rendered as an inline accordion,
 *  - a separator (`separator: true`) rendered as a divider (no `id`/`label`).
 *
 * Submenus are limited to a single nesting level: a `submenu` entry's own
 * children must not themselves carry a `submenu`.
 */
export interface EditorMenuItem {
    /** Stable action id passed to `onAction`. Omitted for separators. */
    id?: string;
    /** Already-translated display label. Omitted for separators. */
    label?: string;
    /** Optional leading icon (e.g. a Lucide glyph). */
    icon?: ReactNode;
    /** Already-formatted shortcut hint (e.g. "Ctrl+Z"), right-aligned + dimmed. */
    shortcut?: string;
    /** One level of nested items, rendered as an inline accordion flyout. */
    submenu?: EditorMenuItem[];
    /** When true this entry is a divider; `id`/`label` are ignored. */
    separator?: boolean;
}

/** A labelled, non-clickable group of {@link EditorMenuItem}s. */
export interface EditorMenuGroup {
    /** Already-translated group heading (rendered as a non-interactive label). */
    label: string;
    /** The group's entries, in display order. */
    items: EditorMenuItem[];
}

export interface EditorMenuProps {
    /** The menu structure: ordered groups, each with ordered items. */
    groups: EditorMenuGroup[];
    /** Fired with an item's `id` when an enabled action is chosen. The menu
     *  closes immediately after. */
    onAction: (actionId: string) => void;
    /** Map of `actionId -> reason`. Listed actions render disabled with the
     *  reason as a tooltip (e.g. "KI-Anbieter konfigurieren"). */
    disabled?: Record<string, string>;
    /** Already-translated accessible label for the hamburger trigger. */
    triggerLabel: string;
    /** testid namespace. The trigger is `${testIdPrefix}-trigger`; each action
     *  is `${testIdPrefix}-item-${id}`; each group label is
     *  `${testIdPrefix}-group-${index}`. */
    testIdPrefix?: string;
}

/**
 * Generic, app-agnostic structured editor menu (issue #322).
 *
 * A hamburger trigger opens a grouped dropdown organised like the menus in
 * VS Code / Google Docs / Scrivener: non-clickable group headings, separators
 * between logical blocks, leading icons, right-aligned dimmed shortcut hints,
 * and disabled items that explain *why* via a tooltip. One level of submenu is
 * supported, rendered as an inline accordion (no flyout) so it works the same
 * on desktop and touch. Every interactive row is at least 44px tall.
 *
 * Dependency-light by design (a controlled button + a panel rendered through a
 * React portal, not a Radix overlay). The portal lets the panel escape a
 * clipping ancestor (e.g. the editor sidebar's `overflow: hidden`) while
 * staying fully assertable in Vitest — mirroring `ComboboxSelect`. Closes on
 * outside click, Escape, and scroll/resize; choosing an enabled action fires
 * `onAction` and closes the menu.
 *
 * Carries no app-specific imports: the consumer supplies the (already
 * translated) group/item labels, shortcut strings, icons, the `disabled`
 * reason map, and the `onAction` dispatcher. The panel is width-capped to the
 * viewport so it stays usable on narrow screens.
 *
 * @example
 * ```tsx
 * <EditorMenu
 *   triggerLabel={t("ui.editor_menu.open", "Menü")}
 *   testIdPrefix="book-editor-menu"
 *   disabled={{ "ai-template": t("ui.feature.requires_ai_key", "…") }}
 *   onAction={(id) => handlers[id]?.()}
 *   groups={[
 *     { label: t("ui.editor_menu.file", "Datei"), items: [
 *       { id: "save", label: t("ui.editor_menu.save", "Speichern"), icon: <Save size={16} /> },
 *       { separator: true },
 *       { label: t("ui.editor_menu.export", "Exportieren"), submenu: [...] },
 *     ]},
 *   ]}
 * />
 * ```
 */
export function EditorMenu({
    groups,
    onAction,
    disabled = {},
    triggerLabel,
    testIdPrefix = "editor-menu",
}: EditorMenuProps) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Position the portaled panel under the trigger. Computed in a layout effect
    // (after the trigger has laid out) so the panel escapes any `overflow:
    // hidden` ancestor (e.g. the editor sidebar) — a plain absolute child would
    // be clipped. The panel prefers right-alignment to the trigger but is
    // clamped into the viewport, so a trigger near the left edge (the sidebar)
    // opens rightward instead of spilling off-screen.
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const margin = 8;
        const panelWidth = Math.min(320, window.innerWidth - 2 * margin);
        const maxLeft = window.innerWidth - panelWidth - margin;
        const left = Math.max(margin, Math.min(rect.right - panelWidth, maxLeft));
        setCoords({ top: rect.bottom + 4, left });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const isInside = (target: Node) =>
            triggerRef.current?.contains(target) || panelRef.current?.contains(target);
        const handlePointerDown = (event: MouseEvent) => {
            if (!isInside(event.target as Node)) setOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        // A scroll/resize while open would misalign the fixed panel; close it.
        const handleReflow = () => setOpen(false);
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("scroll", handleReflow, true);
        window.addEventListener("resize", handleReflow);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("scroll", handleReflow, true);
            window.removeEventListener("resize", handleReflow);
        };
    }, [open]);

    const close = () => {
        setOpen(false);
        setExpanded(new Set());
    };

    const runAction = (id: string) => {
        if (disabled[id] !== undefined) return;
        onAction(id);
        close();
    };

    const toggleSubmenu = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // `appearance-none border-0 bg-transparent` strips the user-agent button
    // chrome (Preflight is omitted, so a bare <button> otherwise renders the
    // browser default light-grey box — invisible on the light card but glaring
    // on the dark panel). hover:bg-accent re-applies a themed hover fill.
    const rowClasses =
        "flex min-h-[44px] w-full appearance-none items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left text-sm";

    const renderAction = (item: EditorMenuItem, key: string, indented: boolean) => {
        const id = item.id as string;
        const reason = disabled[id];
        const isDisabled = reason !== undefined;
        return (
            <li key={key} role="none">
                <button
                    type="button"
                    role="menuitem"
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    title={reason}
                    data-testid={testIdPrefix ? `${testIdPrefix}-item-${id}` : undefined}
                    onClick={() => runAction(id)}
                    className={`${rowClasses} ${indented ? "pl-9" : ""} ${
                        isDisabled
                            ? "cursor-not-allowed text-muted-foreground opacity-60"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                    {item.icon ? (
                        <span className="flex w-4 shrink-0 items-center justify-center">
                            {item.icon}
                        </span>
                    ) : (
                        <span className="w-4 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {item.shortcut}
                        </span>
                    ) : null}
                </button>
            </li>
        );
    };

    const renderSubmenu = (item: EditorMenuItem, key: string) => {
        const isOpen = expanded.has(key);
        return (
            <li key={key} role="none">
                <button
                    type="button"
                    aria-expanded={isOpen}
                    data-testid={testIdPrefix ? `${testIdPrefix}-submenu-${key}` : undefined}
                    onClick={() => toggleSubmenu(key)}
                    className={`${rowClasses} text-foreground hover:bg-accent hover:text-accent-foreground`}
                >
                    {item.icon ? (
                        <span className="flex w-4 shrink-0 items-center justify-center">
                            {item.icon}
                        </span>
                    ) : (
                        <span className="w-4 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {isOpen ? (
                        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                    ) : (
                        <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                    )}
                </button>
                {isOpen ? (
                    <ul role="menu" className="list-none">
                        {(item.submenu ?? []).map((sub, subIndex) =>
                            sub.separator
                                ? renderSeparator(`${key}-sep-${subIndex}`)
                                : renderAction(sub, `${key}-${sub.id}`, true),
                        )}
                    </ul>
                ) : null}
            </li>
        );
    };

    const renderSeparator = (key: string) => (
        <li key={key} role="separator" aria-orientation="horizontal">
            <hr className="my-1 border-t border-border" />
        </li>
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={triggerLabel}
                title={triggerLabel}
                data-testid={testIdPrefix ? `${testIdPrefix}-trigger` : undefined}
                onClick={() => setOpen((prev) => !prev)}
                className="btn-icon flex min-h-[44px] min-w-[44px] items-center justify-center"
            >
                <MenuIcon size={18} />
            </button>
            {open
                ? createPortal(
                      <div
                          ref={panelRef}
                          role="menu"
                          aria-label={triggerLabel}
                          data-testid={testIdPrefix ? `${testIdPrefix}-panel` : undefined}
                          style={{ top: coords.top, left: coords.left }}
                          className="fixed z-[2100] max-h-[min(80vh,40rem)] w-[min(20rem,calc(100vw-1rem))] overflow-auto rounded-[var(--radius-md)] border border-border bg-card py-1 shadow-[var(--shadow-lg)]"
                      >
                          {groups.map((group, groupIndex) => (
                              <div
                                  key={group.label || groupIndex}
                                  role="group"
                                  aria-label={group.label}
                              >
                                  {groupIndex > 0 ? (
                                      <hr className="my-1 border-t border-border" />
                                  ) : null}
                                  <div
                                      data-testid={
                                          testIdPrefix
                                              ? `${testIdPrefix}-group-${groupIndex}`
                                              : undefined
                                      }
                                      className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                  >
                                      {group.label}
                                  </div>
                                  <ul role="none" className="list-none">
                                      {group.items.map((item, itemIndex) => {
                                          if (item.separator) {
                                              return renderSeparator(
                                                  `${groupIndex}-sep-${itemIndex}`,
                                              );
                                          }
                                          if (item.submenu) {
                                              return renderSubmenu(
                                                  item,
                                                  `${groupIndex}-${item.id ?? item.label ?? itemIndex}`,
                                              );
                                          }
                                          return renderAction(
                                              item,
                                              `${groupIndex}-${item.id}`,
                                              false,
                                          );
                                      })}
                                  </ul>
                              </div>
                          ))}
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}

export default EditorMenu;
