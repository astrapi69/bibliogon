import {useI18n} from "../../hooks/useI18n";
import styles from "./SettingsSidebar.module.css";

export interface SidebarItem {
    value: string;
    label: string;
    testId: string;
}

export interface SidebarGroup {
    key: string;
    items: SidebarItem[];
}

interface Props {
    groups: SidebarGroup[];
    activeTab: string;
    onChange: (next: string) => void;
}

// SETT-L-1 C1: replaces the horizontal Radix.Tabs bar (13 tabs
// produced a horizontal scrollbar at 900px max-width). Group
// labels render plain in C1; C3 layers visual treatment +
// Danger-Zone red accent on top of this structural shell.
export function SettingsSidebar({groups, activeTab, onChange}: Props) {
    const {t} = useI18n();
    return (
        <nav
            className={styles.sidebar}
            aria-label={t("ui.settings.sidebar_nav", "Einstellungs-Navigation")}
            data-testid="settings-sidebar"
        >
            {groups.map((group) => (
                <ul
                    key={group.key}
                    className={styles.group}
                    data-testid={`settings-sidebar-group-${group.key}`}
                >
                    {group.items.map((item) => {
                        const isActive = item.value === activeTab;
                        return (
                            <li key={item.value} className={styles.item}>
                                <button
                                    type="button"
                                    className={`${styles.link}${isActive ? ` ${styles.linkActive}` : ""}`}
                                    data-testid={item.testId}
                                    aria-current={isActive ? "page" : undefined}
                                    onClick={() => onChange(item.value)}
                                >
                                    {item.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ))}
        </nav>
    );
}
