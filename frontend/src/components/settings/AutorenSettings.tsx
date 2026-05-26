import {AuthorSettings} from "./AuthorSettings";
import {AuthorsDatabase} from "./AuthorsDatabase";

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
 * AuthorSettings + AuthorsDatabase keep their own
 * SectionHeader + card shells; this wrapper is intentionally
 * thin so the existing per-component tests + testids stay
 * untouched.
 */
export function AutorenSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    return (
        <div data-testid="autoren-settings">
            <AuthorSettings config={config} onSave={onSave} saving={saving}/>
            <AuthorsDatabase/>
        </div>
    );
}
