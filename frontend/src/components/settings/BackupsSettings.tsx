/**
 * Settings > Backups tab — workspace-wide backup utilities.
 *
 * Per BOOKDASHBOARD-CLEANUP-01 (2026-05-18), the Version-History
 * + Compare-Backups affordances move from BookDashboard into a
 * dedicated Settings tab. The Dashboard mixed workspace utilities
 * with the book list; users navigating to "manage my books"
 * shouldn't have to scroll past backup-history rows to reach the
 * action they came for.
 *
 * Industry-pattern precedent: Bear / Scrivener ship a dedicated
 * Backups tab in Preferences. Bibliogon's own ``authors_database``
 * tab is the in-repo precedent for "specialised utility tab
 * extracted from a feature area".
 *
 * Scaffold commit (C1) — full content lands in C2 (migration of
 * Version-History + Compare-Backups logic from Dashboard.tsx).
 * Render an explanatory placeholder until the migration commit so
 * the tab is not visually empty during the intermediate state.
 */

import {useI18n} from "../../hooks/useI18n";

const sectionStyle: React.CSSProperties = {
    padding: 16,
    border: "1px solid var(--border, #ddd)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2, #fafafa)",
};

export function BackupsSettings() {
    const {t} = useI18n();
    return (
        <div
            data-testid="backups-settings"
            style={{display: "flex", flexDirection: "column", gap: 16}}
        >
            <h2 style={{margin: 0}}>
                {t("ui.settings.tab_backups", "Backups")}
            </h2>
            <div style={sectionStyle}>
                <p
                    data-testid="backups-settings-placeholder"
                    style={{margin: 0, color: "var(--text-muted)"}}
                >
                    {t(
                        "ui.backups.placeholder",
                        "Backup-Verlauf und Vergleichswerkzeug folgen in Kürze.",
                    )}
                </p>
            </div>
        </div>
    );
}
