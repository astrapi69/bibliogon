import type {ReactNode} from "react";
import styles from "../../pages/Settings.module.css";

/**
 * Composition component for Settings section headings.
 *
 * Pairs the canonical ``sectionTitle`` style with an optional
 * 1-2 line description below the heading (Notion / Linear
 * convention). Sections without a description render exactly the
 * same shape as the previous bare ``<h2 className=
 * "sectionTitle">`` — no visual regression at call sites that
 * haven't filed a description yet.
 *
 * ``icon`` slots an inline element BEFORE the title (used by
 * SshKeySection's Key icon and DangerZoneSettings' AlertTriangle
 * icon). The icon's caller is responsible for sizing + colour;
 * SectionHeader does no styling beyond layout.
 */
export function SectionHeader({
    title,
    description,
    icon,
    testId,
}: {
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    testId?: string;
}) {
    return (
        <div data-testid={testId}>
            <h2 className={styles.sectionTitle}>
                {icon}
                {title}
            </h2>
            {description ? (
                <p className={styles.sectionDescription}>{description}</p>
            ) : null}
        </div>
    );
}
