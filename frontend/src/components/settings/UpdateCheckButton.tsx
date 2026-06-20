/**
 * "Check for new version" control for Settings > About (#366).
 *
 * The SW update banner is passive (it only shows once a worker is already
 * waiting). This gives the user an ACTIVE check: it calls
 * {@link checkForUpdateNow} (which runs `registration.update()` under the hood
 * via the shared {@link swUpdateManager} from #324) and renders the classified
 * result inline — up to date, a new version found (with an "Update" button that
 * reuses {@link applyUpdate}: skipWaiting + reload), a failure hint, or the
 * dev-mode notice when no service worker is registered. The last-check time is
 * persisted in localStorage and shown as a relative "x ago".
 */

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useI18n } from "../../hooks/useI18n";
import { useStorageMode } from "../../storage/useStorageMode";
import { notify } from "../../utils/notify";
import {
    applyUpdate,
    checkForUpdateNow,
    subscribeToUpdates,
    type UpdateCheckResult,
} from "../../shared/utils/swUpdateManager";
import {
    checkForUpdate,
    INSTALL_COMMAND,
    type UpdateCheckResult as GithubUpdateResult,
} from "../../lib/utils/updateChecker";

const LAST_CHECK_KEY = "bibliogon.sw_last_check";

/** Build-time app version (vite `define`, from package.json). */
const APP_VERSION = __APP_VERSION__;

/** Max characters of release notes shown inline before the "read more" link. */
const NOTES_PREVIEW_LIMIT = 500;

type Status = "idle" | "checking" | "up-to-date" | "available" | "error" | "unsupported";

function readLastCheck(): number | null {
    try {
        const raw = localStorage.getItem(LAST_CHECK_KEY);
        const value = raw ? Number(raw) : NaN;
        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

function writeLastCheck(timestamp: number): void {
    try {
        localStorage.setItem(LAST_CHECK_KEY, String(timestamp));
    } catch {
        // localStorage may be unavailable (private mode); the relative
        // "last check" simply won't persist across reloads.
    }
}

/** Format the gap between two timestamps as a localized relative string. */
export function formatRelativeTime(from: number, now: number, lang: string): string {
    const seconds = Math.round((now - from) / 1000);
    let rtf: Intl.RelativeTimeFormat;
    try {
        rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    } catch {
        rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    }
    if (Math.abs(seconds) < 60) return rtf.format(-seconds, "second");
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
    const days = Math.round(hours / 24);
    return rtf.format(-days, "day");
}

function statusFromResult(result: UpdateCheckResult): Status {
    switch (result) {
        case "update-available":
            return "available";
        case "up-to-date":
            return "up-to-date";
        case "unsupported":
            return "unsupported";
        default:
            return "error";
    }
}

export function UpdateCheckButton() {
    const { t, lang } = useI18n();
    const { mode } = useStorageMode();
    // Desktop builds (PyInstaller / Docker) run in API mode and have no
    // Service Worker, so they check GitHub Releases instead of the SW.
    const isDesktop = mode === "api";
    const [status, setStatus] = useState<Status>("idle");
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [lastCheck, setLastCheck] = useState<number | null>(() => readLastCheck());
    const [updating, setUpdating] = useState(false);
    const [ghResult, setGhResult] = useState<GithubUpdateResult | null>(null);

    useEffect(
        () =>
            subscribeToUpdates((available) => {
                setUpdateAvailable(available);
                if (available) setStatus((prev) => (prev === "checking" ? prev : "available"));
            }),
        [],
    );

    const handleCheck = async () => {
        setStatus("checking");
        const now = Date.now();
        if (isDesktop) {
            const result = await checkForUpdate(APP_VERSION);
            setGhResult(result);
            writeLastCheck(now);
            setLastCheck(now);
            setStatus(
                result.status === "update-available"
                    ? "available"
                    : result.status === "up-to-date"
                      ? "up-to-date"
                      : "error",
            );
            return;
        }
        const result = await checkForUpdateNow();
        writeLastCheck(now);
        setLastCheck(now);
        setStatus(statusFromResult(result));
    };

    const handleApply = () => {
        setUpdating(true);
        applyUpdate();
    };

    const handleCopyInstall = async () => {
        try {
            await navigator.clipboard.writeText(INSTALL_COMMAND);
            notify.success(t("ui.about.update_install_copied", "Installationsbefehl kopiert"));
        } catch {
            notify.error(t("ui.about.update_install_copy_failed", "Kopieren fehlgeschlagen"));
        }
    };

    const notesPreview = ghResult?.releaseNotes
        ? ghResult.releaseNotes.slice(0, NOTES_PREVIEW_LIMIT)
        : "";
    const notesTruncated = (ghResult?.releaseNotes?.length ?? 0) > NOTES_PREVIEW_LIMIT;

    const showApply = !isDesktop && (status === "available" || updateAvailable);
    const checking = status === "checking";

    return (
        <div className="mt-4 flex flex-col gap-2" data-testid="about-update-check">
            <button
                type="button"
                className="btn btn-secondary min-h-[44px] self-start"
                data-testid="about-check-update"
                onClick={() => void handleCheck()}
                disabled={checking}
            >
                {checking ? (
                    <>
                        <Loader2 size={16} className="spin mr-1 inline" />
                        {t("ui.about.check_update_checking", "Prüfe …")}
                    </>
                ) : (
                    <>
                        <RefreshCw size={16} className="mr-1 inline" />
                        {t("ui.about.check_update_button", "Auf neue Version prüfen")}
                    </>
                )}
            </button>

            {isDesktop ? (
                status === "available" && ghResult ? (
                    <div
                        className="flex flex-col gap-2"
                        data-testid="about-update-status"
                        role="status"
                    >
                        <span className="text-sm font-medium text-[var(--text)]">
                            {t(
                                "ui.about.update_available_desktop",
                                "Neue Version verfügbar: {version}",
                            ).replace("{version}", ghResult.latestVersion ?? "")}
                        </span>
                        {notesPreview ? (
                            <div
                                className="max-w-none text-sm text-[var(--text-muted)]"
                                data-testid="about-update-notes"
                            >
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {notesPreview}
                                </ReactMarkdown>
                                {notesTruncated ? (
                                    <a
                                        className="text-[var(--accent)] underline"
                                        href={ghResult.releaseUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {t("ui.about.update_read_more", "Mehr lesen")}
                                    </a>
                                ) : null}
                            </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            <a
                                className="btn btn-primary btn-sm min-h-[44px]"
                                data-testid="about-update-release-link"
                                href={ghResult.releaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ExternalLink size={14} className="mr-1 inline" />
                                {t("ui.about.update_open_release", "Release-Seite öffnen")}
                            </a>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm min-h-[44px]"
                                data-testid="about-update-copy-install"
                                onClick={() => void handleCopyInstall()}
                            >
                                <Copy size={14} className="mr-1 inline" />
                                {t(
                                    "ui.about.update_copy_install",
                                    "Installationsbefehl kopieren",
                                )}
                            </button>
                        </div>
                    </div>
                ) : status === "up-to-date" ? (
                    <span
                        className="text-sm text-[var(--success)]"
                        data-testid="about-update-status"
                        role="status"
                    >
                        {t(
                            "ui.about.update_up_to_date_desktop",
                            "Du hast die neueste Version. ({version})",
                        ).replace("{version}", `v${APP_VERSION}`)}
                    </span>
                ) : status === "error" ? (
                    <span
                        className="text-sm text-[var(--danger)]"
                        data-testid="about-update-status"
                        role="alert"
                    >
                        {t(
                            "ui.about.update_check_failed",
                            "Prüfung fehlgeschlagen. Sind Sie online?",
                        )}
                    </span>
                ) : null
            ) : showApply ? (
                <div
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    data-testid="about-update-status"
                    role="status"
                >
                    <span className="text-sm text-[var(--text)]">
                        {t(
                            "ui.about.update_available",
                            "Eine neue Version ist verfügbar. Jetzt aktualisieren?",
                        )}
                    </span>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm min-h-[44px] self-start"
                        data-testid="about-update-apply"
                        onClick={handleApply}
                        disabled={updating}
                    >
                        {t("ui.about.update_apply_button", "Aktualisieren")}
                    </button>
                </div>
            ) : status === "up-to-date" ? (
                <span
                    className="text-sm text-[var(--success)]"
                    data-testid="about-update-status"
                    role="status"
                >
                    {t("ui.about.update_up_to_date", "Sie verwenden die aktuellste Version.")}
                </span>
            ) : status === "error" ? (
                <span
                    className="text-sm text-[var(--danger)]"
                    data-testid="about-update-status"
                    role="alert"
                >
                    {t("ui.about.update_check_failed", "Prüfung fehlgeschlagen. Sind Sie online?")}
                </span>
            ) : status === "unsupported" ? (
                <span
                    className="text-sm text-[var(--text-muted)]"
                    data-testid="about-update-status"
                    role="status"
                >
                    {t("ui.about.update_dev_mode", "Im Entwicklungsmodus nicht verfügbar.")}
                </span>
            ) : null}

            <span className="text-xs text-[var(--text-muted)]" data-testid="about-update-lastcheck">
                {lastCheck === null
                    ? t("ui.about.update_last_check_never", "Noch nie geprüft.")
                    : t("ui.about.update_last_check", "Letzte Prüfung: {time}").replace(
                          "{time}",
                          formatRelativeTime(lastCheck, Date.now(), lang),
                      )}
            </span>
        </div>
    );
}
