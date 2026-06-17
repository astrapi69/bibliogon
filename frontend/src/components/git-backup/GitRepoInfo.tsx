import { useState } from "react";
import { ExternalLink, GitBranch, RefreshCw } from "lucide-react";

import { api, ApiError } from "../../api/client";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES, FEATURE_REASON } from "../../features/featureConfig";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useRemoteDefaultBranch } from "../../hooks/useRemoteDefaultBranch";
import { useI18n } from "../../hooks/useI18n";
import { notify } from "../../utils/notify";

/**
 * Reusable Git-repository info card: the repository URL as an external
 * link plus the active branch + sync status. Optionally renders a Pull
 * ("Aktualisieren") button.
 *
 * Shared by the Git-backup page (#358) and the metadata Git-Repository
 * field (#359) so the URL/branch/status look is identical on both
 * surfaces and they read from the same data source ({@link useGitStatus}).
 *
 * The URL is supplied by the caller (it lives in the book metadata and
 * is editable there); branch + sync state come from {@link useGitStatus},
 * which is `/api`-silent in Dexie mode. When no local clone exists (Dexie
 * mode, or API mode before cloning) the branch line falls back to the
 * GitHub default branch resolved from the public API (#363). Git
 * operations (the Pull button) are `DESKTOP_ONLY`: in Dexie mode the
 * button is disabled with the desktop-app reason, while the URL link
 * stays active in both modes (policy #78).
 */
export function GitRepoInfo({
    bookId,
    url,
    showPull = false,
    onChangeUrl,
    testIdPrefix = "git-repo-info",
}: {
    bookId: string;
    url: string | null;
    showPull?: boolean;
    onChangeUrl?: () => void;
    testIdPrefix?: string;
}) {
    const { t } = useI18n();
    const gitBackup = useFeature(FEATURES.GIT_BACKUP);
    const git = useGitStatus(bookId);
    const [pulling, setPulling] = useState(false);

    const gitOpsAvailable = gitBackup.isActive;
    const hasLocalBranch = gitOpsAvailable && git.initialized;
    const localLoading = gitOpsAvailable && git.loading;
    // The repo URL can be set in the metadata while no local clone has
    // been initialized yet (the branch line then falls back to the
    // remote default branch, #363). Pull requires an initialized local
    // clone, so the button stays disabled until one exists — otherwise
    // it 409s with `repo_not_initialized` (#375).
    const needsLocalClone = gitOpsAvailable && !git.loading && !git.initialized;
    const pullDisabled = !gitOpsAvailable || pulling || localLoading || needsLocalClone;
    const pullDisabledTitle = !gitOpsAvailable
        ? t(FEATURE_REASON.REQUIRES_DESKTOP_APP, "Benötigt Desktop-App")
        : needsLocalClone
          ? t(
                "ui.git.not_cloned",
                "Das Repository ist konfiguriert, aber lokal noch nicht eingerichtet. Initialisiere einen lokalen Klon, um Commits zu erstellen.",
            )
          : undefined;
    // Only resolve the remote default branch when no local branch is
    // available — a present local clone never triggers a network call.
    const remoteBranch = useRemoteDefaultBranch(url, !hasLocalBranch && !localLoading);

    if (!url) return null;

    function statusLabel(): string {
        switch (git.syncState) {
            case "in_sync":
                return t("ui.git.status_in_sync", "Aktuell");
            case "remote_ahead":
                return t("ui.git.status_behind", "{n} Commits hinter origin").replace(
                    "{n}",
                    String(git.behind ?? 0),
                );
            case "local_ahead":
                return t("ui.git.status_ahead", "{n} Commits voraus").replace(
                    "{n}",
                    String(git.ahead ?? 0),
                );
            case "diverged":
                return t("ui.git.status_diverged", "divergiert");
            case "never_synced":
                return t("ui.git.status_never_synced", "noch nicht synchronisiert");
            case "no_remote":
            default:
                return t("ui.git.status_no_remote", "kein Remote");
        }
    }

    function branchText(): string {
        if (localLoading) {
            return t("ui.git.branch_loading", "Branch: wird geladen …");
        }
        if (hasLocalBranch) {
            const name = git.branch ?? "—";
            return `${t("ui.git.branch_prefix", "Branch")}: ${name} · ${statusLabel()}`;
        }
        switch (remoteBranch.status) {
            case "unsupported":
                return t(
                    "ui.git.branch_non_github",
                    "Branch: nicht verfügbar (nur GitHub unterstützt)",
                );
            case "loading":
                return t("ui.git.branch_loading", "Branch: wird geladen …");
            case "ok":
                return t("ui.git.branch_remote_line", "Branch: {branch} (Remote)").replace(
                    "{branch}",
                    remoteBranch.branch,
                );
            case "error":
            case "idle":
            default:
                return t("ui.git.branch_unavailable_remote", "Branch: nicht verfügbar");
        }
    }

    async function handlePull() {
        setPulling(true);
        try {
            const res = await api.git.pull(bookId);
            notify.success(
                res.updated
                    ? t("ui.git.pull_ok", "Repository aktualisiert")
                    : t("ui.git.pull_no_changes", "Bereits aktuell"),
            );
            await git.refresh();
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "diverged") {
                notify.warning(
                    t(
                        "ui.git.pull_diverged",
                        "Lokale und entfernte Änderungen weichen ab — bitte über die Git-Sicherung auflösen.",
                    ),
                );
                return;
            }
            if (
                err instanceof ApiError &&
                (err.detailBody?.code === "repo_not_initialized" ||
                    err.detailBody?.code === "remote_not_configured")
            ) {
                notify.warning(
                    t(
                        "ui.git.not_cloned",
                        "Das Repository ist konfiguriert, aber lokal noch nicht eingerichtet. Initialisiere einen lokalen Klon, um Commits zu erstellen.",
                    ),
                );
                return;
            }
            if (err instanceof ApiError && err.detailBody?.code === "remote_auth") {
                notify.error(
                    t("ui.git.auth_failed", "Authentifizierung fehlgeschlagen. PAT prüfen."),
                    err,
                );
                return;
            }
            const detail =
                err instanceof ApiError
                    ? err.detail || err.message
                    : err instanceof Error
                      ? err.message
                      : String(err);
            notify.error(
                t("ui.git.pull_failed", "Pull fehlgeschlagen: {error}").replace("{error}", detail),
                err,
            );
        } finally {
            setPulling(false);
        }
    }

    return (
        <div
            data-testid={testIdPrefix}
            className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
        >
            <div className="flex items-center gap-2">
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`${testIdPrefix}-url`}
                    className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[0.8125rem] text-[var(--accent)] underline"
                    title={url}
                >
                    {url}
                </a>
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    data-testid={`${testIdPrefix}-open`}
                    title={t("ui.git.open_repository", "Repository öffnen")}
                    aria-label={t("ui.git.open_repository", "Repository öffnen")}
                >
                    <ExternalLink size={14} />
                </a>
            </div>

            <div
                className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-muted)]"
                data-testid={`${testIdPrefix}-branch`}
            >
                <GitBranch size={12} />
                <span>{branchText()}</span>
            </div>

            {(showPull || onChangeUrl) && (
                <div className="flex flex-wrap items-center gap-2">
                    {showPull && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handlePull}
                            disabled={pullDisabled}
                            title={pullDisabledTitle}
                            data-testid={`${testIdPrefix}-pull`}
                        >
                            <RefreshCw size={14} /> {t("ui.git.pull_button", "Aktualisieren")}
                        </button>
                    )}
                    {onChangeUrl && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={onChangeUrl}
                            data-testid={`${testIdPrefix}-change-url`}
                        >
                            {t("ui.git.change_url", "Repository-URL ändern")}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
