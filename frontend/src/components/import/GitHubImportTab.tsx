/**
 * GitHub source for the unified offline import dialog (#353).
 *
 * Imports files directly from a public (or token-authenticated private) GitHub
 * repository through the GitHub REST API — no git binary, so it works in the
 * backendless PWA. The user pastes a repo URL, navigates the tree, checks
 * files, and imports them through the existing client-side detect/import path
 * (via `getStorage()`, zero `/api`). The network gate
 * ({@link FEATURES.GITHUB_IMPORT}) disables the tab only when the browser is
 * offline.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { ArrowUp, FileText, Folder, FolderGit2, Loader2 } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { notify } from "../../utils/platform/notify";
import { FEATURES } from "../../features/featureConfig";
import { FeatureNotice } from "../../features/FeatureNotice";
import { getGitHubToken, setGitHubToken } from "../../import/githubToken";
import { TokenInput } from "../../lib/components/TokenInput";
import {
    GitHubNotFoundError,
    GitHubRateLimitError,
    listGitHubContents,
    parseGitHubUrl,
    runGitHubImport,
    type GitHubEntry,
    type GitHubImportSummary,
    type GitHubRepoRef,
} from "../../import/githubImport";

export interface GitHubImportTabProps {
    onImported?: () => void;
    onClose: () => void;
}

function parentPath(path: string): string {
    const clean = path.replace(/\/+$/g, "");
    const idx = clean.lastIndexOf("/");
    return idx >= 0 ? clean.slice(0, idx) : "";
}

export default function GitHubImportTab({ onImported, onClose }: GitHubImportTabProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const feature = useFeature(FEATURES.GITHUB_IMPORT);

    const [urlInput, setUrlInput] = useState("");
    const [token, setToken] = useState<string>(() => getGitHubToken());
    const [showToken, setShowToken] = useState(false);

    const [repoRef, setRepoRef] = useState<GitHubRepoRef | null>(null);
    const [rootPath, setRootPath] = useState("");
    const [currentPath, setCurrentPath] = useState("");
    const [entries, setEntries] = useState<GitHubEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [selected, setSelected] = useState<Record<string, GitHubEntry>>({});
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [summary, setSummary] = useState<GitHubImportSummary | null>(null);

    if (!feature.isActive) {
        return (
            <div className="p-5">
                <FeatureNotice reason={feature.reason} testId="github-import-offline" />
            </div>
        );
    }

    const errorMessage = (err: unknown): string => {
        if (err instanceof GitHubRateLimitError) {
            const when = err.resetAt ? ` (${err.resetAt.toLocaleTimeString()})` : "";
            return (
                t(
                    "ui.github_import.error_rate_limit",
                    "GitHub-Anfragelimit erreicht. Mit einem Token erhöhst du das Limit.",
                ) + when
            );
        }
        if (err instanceof GitHubNotFoundError) {
            return t("ui.github_import.error_not_found", "Repository oder Pfad nicht gefunden.");
        }
        return err instanceof Error ? err.message : String(err);
    };

    const loadDir = async (ref: GitHubRepoRef, path: string) => {
        setLoading(true);
        setLoadError(null);
        try {
            const contents = await listGitHubContents(ref, path, token || null);
            setEntries(contents);
            setCurrentPath(path);
        } catch (err) {
            setLoadError(errorMessage(err));
            setEntries([]);
        } finally {
            setLoading(false);
        }
    };

    const handleLoad = async () => {
        const ref = parseGitHubUrl(urlInput);
        if (!ref) {
            setLoadError(
                t(
                    "ui.github_import.error_invalid_url",
                    "Ungültige GitHub-URL. Beispiel: https://github.com/user/repo",
                ),
            );
            return;
        }
        setGitHubToken(token);
        setRepoRef(ref);
        setRootPath(ref.path);
        setSelected({});
        setSummary(null);
        await loadDir(ref, ref.path);
    };

    const toggleSelect = (entry: GitHubEntry) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (next[entry.path]) delete next[entry.path];
            else next[entry.path] = entry;
            return next;
        });
    };

    const selectAllHere = () => {
        setSelected((prev) => {
            const next = { ...prev };
            for (const entry of entries) {
                if (entry.type === "file") next[entry.path] = entry;
            }
            return next;
        });
    };

    const selectedList = Object.values(selected);

    const handleImport = async () => {
        if (selectedList.length === 0) return;
        setImporting(true);
        setProgress({ done: 0, total: selectedList.length });
        try {
            const result = await runGitHubImport(selectedList, {
                token: token || null,
                onProgress: (done, total) => setProgress({ done, total }),
            });
            setSummary(result);
            if (result.importedCount > 0) {
                notify.success(
                    t("ui.github_import.success", "{count} Datei(en) importiert.").replace(
                        "{count}",
                        String(result.importedCount),
                    ),
                );
                onImported?.();
            } else {
                notify.error(
                    t("ui.github_import.nothing_imported", "Keine Datei wurde importiert."),
                );
            }
        } catch (err) {
            notify.error(
                t("ui.github_import.import_failed", "Import fehlgeschlagen: {error}").replace(
                    "{error}",
                    errorMessage(err),
                ),
            );
        } finally {
            setImporting(false);
            setProgress(null);
        }
    };

    const relativeCrumb = currentPath
        ? currentPath.slice(rootPath ? rootPath.length : 0).replace(/^\/+/, "")
        : "";

    return (
        <div className="flex flex-col">
            <div className="flex flex-col gap-3 p-5">
                <label className="text-sm font-medium" htmlFor="github-import-url">
                    {t("ui.github_import.url_label", "GitHub-Repository-URL")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        id="github-import-url"
                        data-testid="github-import-url"
                        className="input min-h-[44px] flex-1"
                        type="text"
                        placeholder="https://github.com/user/repo"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void handleLoad();
                            }
                        }}
                    />
                    <button
                        className="btn btn-primary min-h-[44px]"
                        data-testid="github-import-load"
                        onClick={() => void handleLoad()}
                        disabled={loading || urlInput.trim() === ""}
                    >
                        {loading
                            ? t("ui.github_import.loading", "Lade …")
                            : t("ui.github_import.load_btn", "Laden")}
                    </button>
                </div>

                <button
                    className="self-start text-xs text-[var(--text-muted)] underline"
                    data-testid="github-import-token-toggle"
                    onClick={() => setShowToken((s) => !s)}
                    type="button"
                >
                    {t("ui.github_import.token_toggle", "Privates Repo? Token hinzufügen")}
                </button>
                {showToken && (
                    <div className="flex flex-col gap-1">
                        <TokenInput
                            testId="github-import-token"
                            className="min-h-[44px]"
                            placeholder={t(
                                "ui.github_import.token_placeholder",
                                "GitHub Personal Access Token (optional)",
                            )}
                            value={token}
                            onChange={setToken}
                            showLabel={t("ui.common.show", "Anzeigen")}
                            hideLabel={t("ui.common.hide", "Ausblenden")}
                        />
                        <p className="m-0 text-xs text-[var(--text-muted)]">
                            {t(
                                "ui.github_import.token_hint",
                                "Wird nur lokal gespeichert und nur an GitHub gesendet. Erhöht das Anfragelimit und erlaubt private Repos.",
                            )}
                        </p>
                    </div>
                )}

                {loadError && (
                    <p
                        className="m-0 text-sm text-[var(--danger)]"
                        data-testid="github-import-error"
                        role="alert"
                    >
                        {loadError}
                    </p>
                )}

                {repoRef && !loadError && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                            <FolderGit2 size={16} />
                            <span className="font-mono" data-testid="github-import-repo">
                                {repoRef.owner}/{repoRef.repo}
                                {relativeCrumb ? `/${relativeCrumb}` : ""}
                            </span>
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                className="btn btn-secondary btn-sm min-h-[44px]"
                                data-testid="github-import-up"
                                onClick={() => void loadDir(repoRef, parentPath(currentPath))}
                                disabled={loading || currentPath === rootPath}
                            >
                                <ArrowUp size={14} className="mr-1 inline" />
                                {t("ui.github_import.up", "Eine Ebene hoch")}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm min-h-[44px]"
                                data-testid="github-import-select-all"
                                onClick={selectAllHere}
                                disabled={loading || entries.every((e) => e.type !== "file")}
                            >
                                {t("ui.github_import.select_all", "Alle Dateien wählen")}
                            </button>
                        </div>

                        <ul
                            className="m-0 max-h-64 list-none overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-0"
                            data-testid="github-import-list"
                        >
                            {loading && (
                                <li className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)]">
                                    <Loader2 size={16} className="animate-spin" />
                                    {t("ui.github_import.loading", "Lade …")}
                                </li>
                            )}
                            {!loading && entries.length === 0 && (
                                <li className="px-3 py-2 text-sm text-[var(--text-muted)]">
                                    {t("ui.github_import.empty", "Dieser Ordner ist leer.")}
                                </li>
                            )}
                            {!loading &&
                                entries.map((entry) =>
                                    entry.type === "dir" ? (
                                        <li key={entry.path}>
                                            <button
                                                className="flex min-h-[44px] w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                                                data-testid={`github-import-dir-${entry.name}`}
                                                onClick={() => void loadDir(repoRef, entry.path)}
                                            >
                                                <Folder
                                                    size={16}
                                                    className="text-[var(--accent)]"
                                                />
                                                <span className="font-medium">{entry.name}</span>
                                            </button>
                                        </li>
                                    ) : (
                                        <li key={entry.path}>
                                            <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface-2)]">
                                                <input
                                                    type="checkbox"
                                                    data-testid={`github-import-file-${entry.name}`}
                                                    checked={!!selected[entry.path]}
                                                    onChange={() => toggleSelect(entry)}
                                                />
                                                <FileText
                                                    size={16}
                                                    className="text-[var(--text-muted)]"
                                                />
                                                <span>{entry.name}</span>
                                            </label>
                                        </li>
                                    ),
                                )}
                        </ul>
                    </div>
                )}

                {progress && (
                    <p
                        className="m-0 text-sm text-[var(--text-muted)]"
                        data-testid="github-import-progress"
                        role="status"
                    >
                        {t("ui.github_import.progress", "Importiere {done}/{total} …")
                            .replace("{done}", String(progress.done))
                            .replace("{total}", String(progress.total))}
                    </p>
                )}

                {summary && (
                    <div
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm"
                        data-testid="github-import-summary"
                    >
                        {t(
                            "ui.github_import.summary",
                            "{imported} importiert, {skipped} übersprungen, {errors} Fehler.",
                        )
                            .replace("{imported}", String(summary.importedCount))
                            .replace("{skipped}", String(summary.skippedCount))
                            .replace("{errors}", String(summary.errorCount))}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
                <button
                    className="btn btn-secondary btn-sm min-h-[44px]"
                    data-testid="github-import-close"
                    onClick={onClose}
                >
                    {t("ui.offline_import.cancel_btn", "Abbrechen")}
                </button>
                {summary ? (
                    <button
                        className="btn btn-primary btn-sm min-h-[44px]"
                        data-testid="github-import-done"
                        onClick={() => {
                            if (summary.createdBookId) {
                                navigate(`/book/${summary.createdBookId}`);
                            }
                            onClose();
                        }}
                    >
                        {t("ui.github_import.done_btn", "Fertig")}
                    </button>
                ) : (
                    <button
                        className="btn btn-primary btn-sm min-h-[44px]"
                        data-testid="github-import-confirm"
                        onClick={() => void handleImport()}
                        disabled={importing || selectedList.length === 0}
                    >
                        {importing
                            ? t("ui.github_import.importing", "Importiere …")
                            : t("ui.github_import.import_btn", "{count} importieren").replace(
                                  "{count}",
                                  String(selectedList.length),
                              )}
                    </button>
                )}
            </div>
        </div>
    );
}
