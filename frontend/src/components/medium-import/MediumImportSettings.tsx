/**
 * Settings form for the medium-import plugin.
 *
 * Reuses the existing generic plugin-config endpoints
 * (api.settings.getPlugin / updatePlugin) — no plugin-specific
 * settings endpoint exists, none is needed. The endpoint merges
 * incoming keys into the plugin's settings dict, so partial saves
 * are safe.
 *
 * Save is button-driven (no instant-on-change) per Q7. The four
 * fields mirror plugin.yaml keys 1:1: download_images,
 * image_download_timeout_seconds, skip_existing_canonical_urls,
 * default_status.
 */
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import styles from "./MediumImportSettings.module.css";

const PLUGIN_NAME = "medium-import";

const STATUS_OPTIONS = ["draft", "published", "archived"] as const;
type Status = (typeof STATUS_OPTIONS)[number];

interface SettingsState {
    download_images: boolean;
    image_download_timeout_seconds: number;
    skip_existing_canonical_urls: boolean;
    default_status: Status;
}

const DEFAULTS: SettingsState = {
    download_images: true,
    image_download_timeout_seconds: 30,
    skip_existing_canonical_urls: true,
    default_status: "published",
};

function coerceStatus(value: unknown): Status {
    if (typeof value === "string" && (STATUS_OPTIONS as readonly string[]).includes(value)) {
        return value as Status;
    }
    return DEFAULTS.default_status;
}

function readState(raw: Record<string, unknown> | undefined): SettingsState {
    const settings = (raw?.settings ?? {}) as Record<string, unknown>;
    const timeout = Number(settings.image_download_timeout_seconds);
    return {
        download_images:
            typeof settings.download_images === "boolean"
                ? settings.download_images
                : DEFAULTS.download_images,
        image_download_timeout_seconds:
            Number.isFinite(timeout) && timeout > 0
                ? Math.round(timeout)
                : DEFAULTS.image_download_timeout_seconds,
        skip_existing_canonical_urls:
            typeof settings.skip_existing_canonical_urls === "boolean"
                ? settings.skip_existing_canonical_urls
                : DEFAULTS.skip_existing_canonical_urls,
        default_status: coerceStatus(settings.default_status),
    };
}

export default function MediumImportSettings() {
    const { t } = useI18n();
    const [state, setState] = useState<SettingsState>(DEFAULTS);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.settings
            .getPlugin(PLUGIN_NAME)
            .then((raw) => {
                if (cancelled) return;
                setState(readState(raw));
                setLoaded(true);
            })
            .catch((err) => {
                if (cancelled) return;
                // Plugin might not have a config yet; leave defaults in place.
                if (err instanceof ApiError && err.status === 404) {
                    setLoaded(true);
                    return;
                }
                setError(
                    t(
                        "ui.medium_import.settings.load_failed",
                        "Einstellungen konnten nicht geladen werden",
                    ),
                );
            });
        return () => {
            cancelled = true;
        };
    }, [t]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await api.settings.updatePlugin(PLUGIN_NAME, {
                download_images: state.download_images,
                image_download_timeout_seconds: state.image_download_timeout_seconds,
                skip_existing_canonical_urls: state.skip_existing_canonical_urls,
                default_status: state.default_status,
            });
            setSavedAt(Date.now());
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.medium_import.settings.save_failed",
                          "Speichern fehlgeschlagen",
                      );
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const showSaved = savedAt !== null && Date.now() - savedAt < 4000;

    return (
        <div className={styles.wrap} data-testid="medium-import-settings">
            <div className={styles.checkboxField}>
                <input
                    id="medium-import-download-images"
                    type="checkbox"
                    className={styles.checkbox}
                    checked={state.download_images}
                    onChange={(e) =>
                        setState((s) => ({ ...s, download_images: e.target.checked }))
                    }
                    data-testid="medium-import-settings-download-images"
                />
                <label
                    htmlFor="medium-import-download-images"
                    className={styles.checkboxLabel}
                >
                    <span className={styles.label}>
                        {t(
                            "ui.medium_import.settings.download_images",
                            "Bilder lokal herunterladen",
                        )}
                    </span>
                    <span className={styles.hint}>
                        {t(
                            "ui.medium_import.settings.download_images_hint",
                            "Empfohlen. Speichert Bilder im Bibliogon-Speicher statt das Medium-CDN zu referenzieren.",
                        )}
                    </span>
                </label>
            </div>

            <div className={styles.field}>
                <label
                    className={styles.label}
                    htmlFor="medium-import-timeout"
                >
                    {t(
                        "ui.medium_import.settings.timeout_seconds",
                        "Timeout pro Bild-Download (Sekunden)",
                    )}
                </label>
                <input
                    id="medium-import-timeout"
                    type="number"
                    min={1}
                    max={600}
                    step={1}
                    className={styles.input}
                    value={state.image_download_timeout_seconds}
                    onChange={(e) => {
                        const next = Number(e.target.value);
                        setState((s) => ({
                            ...s,
                            image_download_timeout_seconds: Number.isFinite(next)
                                ? Math.max(1, Math.round(next))
                                : DEFAULTS.image_download_timeout_seconds,
                        }));
                    }}
                    data-testid="medium-import-settings-timeout"
                />
            </div>

            <div className={styles.checkboxField}>
                <input
                    id="medium-import-skip-existing"
                    type="checkbox"
                    className={styles.checkbox}
                    checked={state.skip_existing_canonical_urls}
                    onChange={(e) =>
                        setState((s) => ({
                            ...s,
                            skip_existing_canonical_urls: e.target.checked,
                        }))
                    }
                    data-testid="medium-import-settings-skip-existing"
                />
                <label
                    htmlFor="medium-import-skip-existing"
                    className={styles.checkboxLabel}
                >
                    <span className={styles.label}>
                        {t(
                            "ui.medium_import.settings.skip_existing",
                            "Bereits importierte Artikel überspringen",
                        )}
                    </span>
                    <span className={styles.hint}>
                        {t(
                            "ui.medium_import.settings.skip_existing_hint",
                            "Artikel mit derselben Medium-URL werden nicht erneut importiert.",
                        )}
                    </span>
                </label>
            </div>

            <div className={styles.field}>
                <label className={styles.label} htmlFor="medium-import-default-status">
                    {t(
                        "ui.medium_import.settings.default_status",
                        "Standardstatus für importierte Artikel",
                    )}
                </label>
                <select
                    id="medium-import-default-status"
                    className={styles.select}
                    value={state.default_status}
                    onChange={(e) =>
                        setState((s) => ({
                            ...s,
                            default_status: coerceStatus(e.target.value),
                        }))
                    }
                    data-testid="medium-import-settings-default-status"
                >
                    {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                            {t(`ui.medium_import.settings.status_${s}`, s)}
                        </option>
                    ))}
                </select>
            </div>

            <div className={styles.actions}>
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={saving || !loaded}
                    data-testid="medium-import-settings-save"
                >
                    {saving
                        ? t("ui.medium_import.settings.saving", "Speichert …")
                        : t("ui.medium_import.settings.save", "Einstellungen speichern")}
                </button>
                {showSaved && (
                    <span className={styles.savedBadge} role="status">
                        {t("ui.medium_import.settings.saved", "Gespeichert")}
                    </span>
                )}
                {error && (
                    <span className={styles.errorBadge} role="alert">
                        {error}
                    </span>
                )}
            </div>
        </div>
    );
}
