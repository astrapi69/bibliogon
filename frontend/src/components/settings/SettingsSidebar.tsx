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
    // C3: optional visible group header (rendered as <h2>). Groups
    // without a label render only their items — used by the
    // single-item Danger Zone group where a header would duplicate
    // the item label.
    label?: string;
    // C3: "danger" tints the items + adds extra top spacing so the
    // group reads as a visually-distinct destructive section.
    variant?: "default" | "danger";
}

interface Props {
    groups: SidebarGroup[];
    activeTab: string;
    onChange: (next: string) => void;
}

// SETT-L-1: replaces the horizontal Radix.Tabs bar. C1 wired the
// structural shell; C3 adds visible group headers + Danger-Zone
// red accent.
export function SettingsSidebar({groups, activeTab, onChange}: Props) {
    const {t} = useI18n();
    return (
        <nav
            className={styles.sidebar}
            aria-label={t("ui.settings.sidebar_nav", "Einstellungs-Navigation")}
            data-testid="settings-sidebar"
        >
            {groups.map((group) => {
                const isDanger = group.variant === "danger";
                const headingId = group.label ? `settings-sidebar-heading-${group.key}` : undefined;
                return (
                    <div
                        key={group.key}
                        className={`${styles.section}${isDanger ? ` ${styles.sectionDanger}` : ""}`}
                        data-testid={`settings-sidebar-section-${group.key}`}
                    >
                        {group.label ? (
                            <h2
                                id={headingId}
                                className={styles.groupLabel}
                                data-testid={`settings-sidebar-group-label-${group.key}`}
                            >
                                {group.label}
                            </h2>
                        ) : null}
                        <ul
                            className={styles.group}
                            data-testid={`settings-sidebar-group-${group.key}`}
                            aria-labelledby={headingId}
                        >
                            {group.items.map((item) => {
                                const isActive = item.value === activeTab;
                                // Indent the sub-item label one level deeper
                                // than the category header (.groupLabel) so the
                                // two levels read as a hierarchy. Tailwind-first:
                                // ``indent-[12px]`` (text-indent) is a property
                                // the .link module class doesn't set, so the
                                // layered utility applies cleanly over the
                                // unlayered module padding. text-indent keeps the
                                // full-width 44px touch target intact (only the
                                // label shifts, not the click box).
                                const linkClass = [
                                    styles.link,
                                    "indent-[12px]",
                                    isActive ? styles.linkActive : "",
                                    isDanger ? styles.linkDanger : "",
                                ].filter(Boolean).join(" ");
                                return (
                                    <li key={item.value} className={styles.item}>
                                        <button
                                            type="button"
                                            className={linkClass}
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
                    </div>
                );
            })}
        </nav>
    );
}
