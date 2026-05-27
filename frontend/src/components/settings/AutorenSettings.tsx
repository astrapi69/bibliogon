import {AuthorSettings} from "./AuthorSettings";
import {AuthorsDatabase} from "./AuthorsDatabase";
import {useI18n} from "../../hooks/useI18n";

/**
 * Settings > Autoren tab — combined author profile + authors
 * database surface.
 *
 * Consolidates the previously-separate "Autor" tab (real name +
 * pen names, persisted under ``config.author.*``) and
 * "Autoren-Datenbank" tab (CRUD over known authors via
 * ``api.authors.*``) into a single tab with two stacked
 * sections.
 *
 * Task 3.7 (UX clarification — Path C): the two sections share
 * the same tab but are intentionally separate at the data layer:
 *
 * - **AuthorSettings** persists to ``config.author.*`` (app
 *   config / settings YAML overlay); identifies the active user.
 * - **AuthorsDatabase** persists to the DB ``authors`` table;
 *   catalogue of OTHER authors that the convert-to-Book wizard
 *   datalist (Bug 8 Phase 2) reads as autocomplete suggestions.
 *
 * The two are NOT auto-synced (per the ``Author`` model docstring:
 * "standalone catalogue"). A pen-name in your profile does NOT
 * surface as a citation suggestion, and vice versa — by design.
 *
 * The intro paragraph + the visible divider make the boundary
 * explicit so the user doesn't perceive the two sections as
 * accidental duplication.
 */
export function AutorenSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    return (
        <div data-testid="autoren-settings">
            <p
                data-testid="autoren-settings-intro"
                style={{
                    margin: "0 0 16px 0",
                    padding: "12px 16px",
                    background: "var(--surface-2, #fafafa)",
                    border: "1px solid var(--border, #ddd)",
                    borderRadius: 8,
                    fontSize: "0.875rem",
                    color: "var(--text-secondary, #555)",
                }}
            >
                {t(
                    "ui.settings.autoren_intro",
                    "Zwei getrennte Bereiche: oben dein eigenes Autorenprofil (gilt nur für dich), unten der Katalog anderer Autoren als Quelle für Autocomplete-Vorschläge. Sie sind absichtlich getrennt — Pseudonyme in deinem Profil tauchen nicht automatisch im Katalog auf.",
                )}
            </p>
            <AuthorSettings config={config} onSave={onSave} saving={saving}/>
            <hr
                data-testid="autoren-settings-divider"
                style={{
                    margin: "32px 0",
                    border: "none",
                    borderTop: "1px solid var(--border, #ddd)",
                }}
            />
            <AuthorsDatabase/>
        </div>
    );
}
