import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {Check, Menu} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import type {SidebarGroup} from "./SettingsSidebar";

interface Props {
    groups: SidebarGroup[];
    activeTab: string;
    onChange: (next: string) => void;
}

// SETT-L-1 C2: the mobile-only hamburger that replaces the
// sidebar at <=768px. Shares the ``groups`` data structure with
// SettingsSidebar so testids + labels stay in lock-step.
// DropdownMenu.Separator surfaces the group boundaries on
// mobile even though the desktop-style group headers are not
// rendered inside the popover.
export function SettingsMobileMenu({groups, activeTab, onChange}: Props) {
    const {t} = useI18n();
    const flatItems = groups.flatMap((g) => g.items);
    const activeLabel = flatItems.find((i) => i.value === activeTab)?.label ?? "";
    return (
        <div className="settings-tabs-mobile">
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        className="btn btn-secondary settings-tabs-mobile-trigger"
                        data-testid="settings-tabs-mobile-trigger"
                        aria-label={t("ui.settings.open_tab_menu", "Tab-Menü öffnen")}
                    >
                        <Menu size={16}/>
                        <span>{activeLabel}</span>
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content className="hamburger-menu-content" align="start" sideOffset={4}>
                        {groups.map((group, groupIdx) => (
                            <div key={group.key}>
                                {groupIdx > 0 ? <DropdownMenu.Separator className="hamburger-menu-separator"/> : null}
                                {group.items.map((d) => (
                                    <DropdownMenu.Item
                                        key={d.value}
                                        className="hamburger-menu-item"
                                        data-testid={`${d.testId}-mobile`}
                                        onSelect={() => onChange(d.value)}
                                    >
                                        {d.label}
                                        {d.value === activeTab ? <Check size={14}/> : null}
                                    </DropdownMenu.Item>
                                ))}
                            </div>
                        ))}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}
