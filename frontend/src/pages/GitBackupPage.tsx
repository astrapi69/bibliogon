import { useParams } from "react-router-dom";
import { GitCommit, GitBranch, RefreshCw } from "lucide-react";
import { PageLayout } from "../components/PageLayout";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { FeatureNotice } from "../features/FeatureNotice";
import { useGoBack } from "../hooks/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { useGitBackup } from "../hooks/useGitBackup";
import { SyncBadge } from "../components/git-backup/SyncBadge";
import { GitRemoteConfig } from "../components/git-backup/GitRemoteConfig";
import { ConflictResolution } from "../components/git-backup/ConflictResolution";

/**
 * Git-backup page (Dialog->Pages migration C8), per-book at
 * `/books/:bookId/git-backup`. Was GitBackupDialog; converted in place
 * (Dialog chrome -> PageLayout). Self-loads the repo status on mount.
 */
export default function GitBackupPage() {
    const { t } = useI18n();
    const gitBackup = useFeature(FEATURES.GIT_BACKUP);
    const offline = !gitBackup.isActive;
    const { bookId = "" } = useParams<{ bookId: string }>();
    const goBack = useGoBack(bookId ? `/book/${bookId}` : "/");
    const {
        status,
        commits,
        remote,
        sync,
        message,
        setMessage,
        remoteUrlDraft,
        setRemoteUrlDraft,
        remotePatDraft,
        setRemotePatDraft,
        editingRemote,
        setEditingRemote,
        busy,
        conflictKind,
        setConflictKind,
        conflictFiles,
        setConflictFiles,
        resolutions,
        setResolutions,
        refresh,
        handleInit,
        handleCommit,
        handleSaveRemote,
        handleDeleteRemote,
        handlePush,
        handleMergeRemote,
        handleResolveMerge,
        handleAbortMerge,
        handlePull,
    } = useGitBackup(bookId, offline);

    if (!gitBackup.isActive) {
        return (
            <PageLayout
                title={t("ui.git.title", "Git-Sicherung")}
                testId="git-backup-page"
                maxWidth="lg"
                onBack={goBack}
                backLabel={t("ui.common.back", "Zurück")}
            >
                <FeatureNotice reason={gitBackup.reason} testId="git-backup-disabled" />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title={t("ui.git.title", "Git-Sicherung")}
            testId="git-backup-page"
            maxWidth="lg"
            onBack={goBack}
            backLabel={t("ui.common.back", "Zurück")}
        >
            <>
                {status && !status.initialized && (
                    <div style={{ padding: 16 }}>
                        <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
                            {t(
                                "ui.git.not_initialized",
                                "Für dieses Buch ist noch kein Repository vorhanden. Initialisiere es, um Commits zu erstellen.",
                            )}
                        </p>
                        <button
                            className="btn btn-primary"
                            onClick={handleInit}
                            disabled={busy}
                            data-testid="git-init-btn"
                        >
                            <GitBranch size={14} /> {t("ui.git.init", "Repository initialisieren")}
                        </button>
                    </div>
                )}

                {status && status.initialized && (
                    <div
                        style={{
                            padding: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                        }}
                    >
                        {/* Header: HEAD + sync status + refresh */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: "0.8125rem",
                                flexWrap: "wrap",
                            }}
                        >
                            <span className="muted">HEAD:</span>
                            <code style={{ fontFamily: "var(--font-mono)" }}>
                                {status.head_short_hash}
                            </code>
                            {status.dirty && (
                                <span style={{ color: "var(--accent)", fontWeight: 500 }}>
                                    {t("ui.git.dirty", "ungespeicherte Änderungen")} (
                                    {status.uncommitted_files})
                                </span>
                            )}
                            {sync && <SyncBadge sync={sync} />}
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={refresh}
                                title={t("ui.common.refresh", "Aktualisieren")}
                                style={{ marginLeft: "auto" }}
                                data-testid="git-refresh-btn"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>

                        <GitRemoteConfig
                            remote={remote}
                            busy={busy}
                            editingRemote={editingRemote}
                            remoteUrlDraft={remoteUrlDraft}
                            remotePatDraft={remotePatDraft}
                            onEdit={() => setEditingRemote(true)}
                            onCancelEdit={() => {
                                setEditingRemote(false);
                                setRemoteUrlDraft(remote?.url ?? "");
                                setRemotePatDraft("");
                            }}
                            onUrlChange={setRemoteUrlDraft}
                            onPatChange={setRemotePatDraft}
                            onSave={handleSaveRemote}
                            onDeleteRemote={handleDeleteRemote}
                            onPush={() => handlePush()}
                            onPull={handlePull}
                        />

                        {/* Commit block */}
                        <div className="field">
                            <label className="label">
                                {t("ui.git.commit_message", "Commit-Nachricht")}
                            </label>
                            <input
                                className="input"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={t(
                                    "ui.git.commit_message_placeholder",
                                    "Was hat sich geändert?",
                                )}
                                disabled={busy}
                                data-testid="git-commit-message"
                            />
                            <button
                                className="btn btn-primary"
                                onClick={handleCommit}
                                disabled={busy}
                                style={{ marginTop: 8 }}
                                data-testid="git-commit-btn"
                            >
                                <GitCommit size={14} /> {t("ui.git.commit", "Commit")}
                            </button>
                        </div>

                        <div>
                            <h3
                                style={{
                                    fontSize: "0.9375rem",
                                    fontWeight: 600,
                                    marginBottom: 8,
                                }}
                            >
                                {t("ui.git.history", "Verlauf")} ({commits.length})
                            </h3>
                            {commits.length === 0 ? (
                                <p className="muted-sm">
                                    {t("ui.git.no_commits", "Noch keine Commits.")}
                                </p>
                            ) : (
                                <ul
                                    style={{
                                        listStyle: "none",
                                        padding: 0,
                                        margin: 0,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 8,
                                    }}
                                >
                                    {commits.map((c) => (
                                        <li
                                            key={c.hash}
                                            style={{
                                                padding: 10,
                                                background: "var(--bg-secondary)",
                                                borderRadius: "var(--radius-sm)",
                                                fontSize: "0.8125rem",
                                            }}
                                            data-testid="git-commit-entry"
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    alignItems: "baseline",
                                                }}
                                            >
                                                <code
                                                    style={{
                                                        fontFamily: "var(--font-mono)",
                                                        color: "var(--accent)",
                                                    }}
                                                >
                                                    {c.short_hash}
                                                </code>
                                                <span style={{ fontWeight: 500 }}>
                                                    {c.message.split("\n")[0]}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    marginTop: 2,
                                                    color: "var(--text-muted)",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {c.author} — {new Date(c.date).toLocaleString()}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                {conflictKind && (
                    <ConflictResolution
                        kind={conflictKind}
                        busy={busy}
                        files={conflictFiles}
                        resolutions={resolutions}
                        onResolutionChange={(path, side) =>
                            setResolutions((prev) => ({ ...prev, [path]: side }))
                        }
                        onMerge={handleMergeRemote}
                        onResolve={handleResolveMerge}
                        onAbort={handleAbortMerge}
                        onAcceptLocal={() => handlePush(true)}
                        onCancel={() => {
                            setConflictKind(null);
                            setConflictFiles([]);
                            setResolutions({});
                        }}
                    />
                )}
            </>
        </PageLayout>
    );
}
