import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GitSyncDiffDialog from "../components/import/GitSyncDiffDialog";
import {
    UnmappedNotice,
    CloneMissingNotice,
    MappingSummary,
    UnifiedCommitBanner,
    UnifiedResult,
    CheckUpstreamButton,
    LastResult,
} from "../components/git-sync/gitSyncViews";
import { CredentialsSection, CommitForm } from "../components/git-sync/gitSyncForms";
import {
    api,
    ApiError,
    GitSyncCommitResult,
    GitSyncMappingStatus,
    GitSyncUnifiedCommitResult,
} from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/platform/notify";
import { PageLayout } from "../components/shared/PageLayout";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { FeatureNotice } from "../features/FeatureNotice";
import { useGoBack } from "../hooks/navigation/useGoBack";

/**
 * PGS-02 commit-to-repo page (Dialog->Pages migration C8), per-book at
 * `/books/:bookId/git-sync`. Was GitSyncDialog; converted in place
 * (Dialog chrome -> PageLayout). Self-loads the sync mapping on mount.
 * The nested diff sub-dialog (GitSyncDiffDialog) stays a Dialog.
 *
 * Presentational views + forms live in components/git-sync/ (#207
 * god-file split); this file is the container (data load + commit flow).
 */
export default function GitSyncPage() {
    const { t } = useI18n();
    const gitSync = useFeature(FEATURES.GIT_SYNC);
    const offline = !gitSync.isActive;
    const { bookId = "" } = useParams<{ bookId: string }>();
    const goBack = useGoBack(bookId ? `/book/${bookId}` : "/");
    const [status, setStatus] = useState<GitSyncMappingStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [message, setMessage] = useState("");
    const [push, setPush] = useState(false);
    const [lastResult, setLastResult] = useState<GitSyncCommitResult | null>(null);
    const [unifiedResult, setUnifiedResult] = useState<GitSyncUnifiedCommitResult | null>(null);
    const [unifying, setUnifying] = useState(false);
    const [showDiff, setShowDiff] = useState(false);

    useEffect(() => {
        if (offline) return;
        void refresh();
        // Reset transient form state when the page mounts for a different
        // book; preserves last commit result during the same session.
        setMessage("");
        setPush(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, offline]);

    async function refresh(): Promise<void> {
        setLoading(true);
        try {
            const next = await api.gitSync.status(bookId);
            setStatus(next);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(t("ui.git_sync.status_error", "Konnte Git-Status nicht laden."), err);
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleCommit(): Promise<void> {
        if (!status?.mapped) return;
        setCommitting(true);
        setLastResult(null);
        try {
            const result = await api.gitSync.commit(bookId, {
                message: message.trim() || null,
                push,
            });
            setLastResult(result);
            notify.success(t("ui.git_sync.commit_success", "Commit erstellt"));
            await refresh();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 409) {
                    notify.warning(t("ui.git_sync.no_changes", "Keine Änderungen zu committen."));
                } else if (err.status === 410) {
                    notify.warning(
                        t(
                            "ui.git_sync.clone_missing",
                            "Lokaler Klon fehlt. Bitte das Buch erneut aus dem Repo importieren.",
                        ),
                    );
                } else if (err.status === 401) {
                    notify.error(
                        t(
                            "ui.git_sync.push_auth_failed",
                            "Push fehlgeschlagen: keine Berechtigung. Bitte SSH-Key oder Credentials prüfen.",
                        ),
                        err,
                    );
                } else if (err.status === 502) {
                    notify.error(
                        t(
                            "ui.git_sync.push_network_failed",
                            "Push fehlgeschlagen: Remote nicht erreichbar.",
                        ),
                        err,
                    );
                } else {
                    notify.error(t("ui.git_sync.commit_error", "Commit fehlgeschlagen."), err);
                }
            }
        } finally {
            setCommitting(false);
        }
    }

    async function handleUnifiedCommit(): Promise<void> {
        if (!status?.mapped) return;
        setUnifying(true);
        setLastResult(null);
        setUnifiedResult(null);
        try {
            const result = await api.gitSync.unifiedCommit(bookId, {
                message: message.trim() || null,
                push_plugin: push,
            });
            setUnifiedResult(result);
            // Per-subsystem status defines the toast tier - if either side
            // failed, surface a single warning toast with both lines so
            // the user does not have to read the inline summary block.
            const anyFailed =
                result.core_git.status === "failed" || result.plugin_git_sync.status === "failed";
            if (anyFailed) {
                notify.warning(
                    t("ui.git_sync.unified_partial", "Commit teils erfolgreich. Details unten."),
                );
            } else {
                notify.success(
                    t("ui.git_sync.unified_success", "Commit auf beiden Seiten erstellt."),
                );
            }
            await refresh();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 503) {
                    notify.warning(
                        t(
                            "ui.git_sync.unified_lock_busy",
                            "Anderer Commit läuft gerade. Bitte kurz warten.",
                        ),
                    );
                } else {
                    notify.error(
                        t("ui.git_sync.unified_error", "Unified-Commit fehlgeschlagen."),
                        err,
                    );
                }
            }
        } finally {
            setUnifying(false);
        }
    }

    if (!gitSync.isActive) {
        return (
            <PageLayout
                title={t("ui.git_sync.title", "Sync zu Git-Repository")}
                testId="git-sync-page"
                maxWidth="lg"
                onBack={goBack}
                backLabel={t("ui.common.back", "Zurück")}
            >
                <FeatureNotice reason={gitSync.reason} testId="git-sync-disabled" />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title={t("ui.git_sync.title", "Sync zu Git-Repository")}
            testId="git-sync-page"
            maxWidth="lg"
            onBack={goBack}
            backLabel={t("ui.common.back", "Zurück")}
        >
            <>
                {loading && !status ? (
                    <div
                        data-testid="git-sync-loading"
                        style={{ padding: 16, color: "var(--text-muted)" }}
                    >
                        {t("ui.common.loading", "Laedt...")}
                    </div>
                ) : !status?.mapped ? (
                    <UnmappedNotice />
                ) : (
                    <>
                        <MappingSummary status={status} />
                        <CredentialsSection
                            bookId={bookId}
                            hasCredential={status.has_credential}
                            onChanged={() => void refresh()}
                        />
                        {status.core_git_initialized && <UnifiedCommitBanner />}
                        {status.dirty === null ? (
                            <CloneMissingNotice />
                        ) : (
                            <>
                                <CommitForm
                                    dirty={status.dirty}
                                    message={message}
                                    onMessageChange={setMessage}
                                    push={push}
                                    onPushChange={setPush}
                                    committing={committing}
                                    onSubmit={handleCommit}
                                    unifiedAvailable={status.core_git_initialized}
                                    unifying={unifying}
                                    onUnifiedSubmit={handleUnifiedCommit}
                                />
                                <CheckUpstreamButton onClick={() => setShowDiff(true)} />
                            </>
                        )}
                        {lastResult && <LastResult result={lastResult} />}
                        {unifiedResult && <UnifiedResult result={unifiedResult} />}
                    </>
                )}
                <GitSyncDiffDialog
                    open={showDiff}
                    bookId={bookId}
                    onClose={() => setShowDiff(false)}
                    onResolved={() => void refresh()}
                />
            </>
        </PageLayout>
    );
}
