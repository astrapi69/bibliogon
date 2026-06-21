import { useEffect, useState } from "react";
import {
    api,
    ApiError,
    GitCommitEntry,
    GitRemoteConfig as GitRemoteConfigType,
    GitRepoStatus,
    GitSyncStatus,
    GitMergeResult,
} from "../api/client";
import { useI18n } from "./useI18n";
import { notify } from "../utils/platform/notify";

function describeError(err: unknown): string {
    if (err instanceof ApiError) return err.detail || err.message;
    if (err instanceof Error) return err.message;
    return String(err);
}

/**
 * Owns all state + handlers for the Git-backup page. Self-loads the
 * repo status on mount (skipped when offline). Returns every piece of
 * state and handler the page renders.
 */
export function useGitBackup(bookId: string, offline: boolean) {
    const { t } = useI18n();
    const [status, setStatus] = useState<GitRepoStatus | null>(null);
    const [commits, setCommits] = useState<GitCommitEntry[]>([]);
    const [remote, setRemote] = useState<GitRemoteConfigType | null>(null);
    const [sync, setSync] = useState<GitSyncStatus | null>(null);
    const [message, setMessage] = useState("");
    const [remoteUrlDraft, setRemoteUrlDraft] = useState("");
    const [remotePatDraft, setRemotePatDraft] = useState("");
    const [editingRemote, setEditingRemote] = useState(false);
    const [busy, setBusy] = useState(false);
    const [conflictKind, setConflictKind] = useState<"push_rejected" | "diverged" | null>(null);
    const [conflictFiles, setConflictFiles] = useState<string[]>([]);
    const [resolutions, setResolutions] = useState<Record<string, "mine" | "theirs">>({});

    useEffect(() => {
        if (offline) return;
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, offline]);

    async function refresh() {
        try {
            const st = await api.git.status(bookId);
            setStatus(st);
            if (st.initialized) {
                const [logEntries, rc, ss] = await Promise.all([
                    api.git.log(bookId, 50),
                    api.git.getRemote(bookId),
                    api.git.syncStatus(bookId),
                ]);
                setCommits(logEntries);
                setRemote(rc);
                setSync(ss);
                setRemoteUrlDraft(rc.url ?? "");
                setRemotePatDraft("");
            } else {
                setCommits([]);
                setRemote(null);
                setSync(null);
            }
        } catch (err) {
            notify.error(describeError(err), err);
        }
    }

    async function handleInit() {
        setBusy(true);
        try {
            await api.git.init(bookId);
            notify.success(t("ui.git.init_ok", "Repository initialisiert"));
            await refresh();
        } catch (err) {
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handleCommit() {
        setBusy(true);
        try {
            const entry = await api.git.commit(bookId, message);
            notify.success(t("ui.git.commit_ok", "Commit erstellt") + `: ${entry.short_hash}`);
            setMessage("");
            await refresh();
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "nothing_to_commit") {
                notify.warning(t("ui.git.nothing_to_commit", "Keine Änderungen zu committen"));
                return;
            }
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handleSaveRemote() {
        if (!remoteUrlDraft.trim()) {
            notify.warning(t("ui.git.remote_url_required", "Remote-URL erforderlich"));
            return;
        }
        setBusy(true);
        try {
            await api.git.setRemote(bookId, remoteUrlDraft.trim(), remotePatDraft || null);
            notify.success(t("ui.git.remote_saved", "Remote gespeichert"));
            setEditingRemote(false);
            setRemotePatDraft("");
            await refresh();
        } catch (err) {
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handleDeleteRemote() {
        setBusy(true);
        try {
            await api.git.deleteRemote(bookId);
            notify.success(t("ui.git.remote_deleted", "Remote entfernt"));
            await refresh();
        } catch (err) {
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handlePush(force: boolean = false) {
        setBusy(true);
        try {
            await api.git.push(bookId, force);
            notify.success(
                force
                    ? t("ui.git.force_push_ok", "Force Push erfolgreich — Remote überschrieben")
                    : t("ui.git.push_ok", "Push erfolgreich"),
            );
            setConflictKind(null);
            await refresh();
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "remote_rejected") {
                // Open conflict dialog with both resolution options.
                setConflictKind("push_rejected");
                return;
            }
            if (err instanceof ApiError && err.detailBody?.code === "remote_auth") {
                notify.error(
                    t("ui.git.auth_failed", "Authentifizierung fehlgeschlagen. PAT prüfen."),
                    err,
                );
                return;
            }
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handleMergeRemote() {
        setBusy(true);
        try {
            const res: GitMergeResult = await api.git.merge(bookId);
            if (res.status === "merged" || res.status === "already_up_to_date") {
                notify.success(t("ui.git.merge_ok", "Merge erfolgreich"));
                setConflictKind(null);
                setConflictFiles([]);
                setResolutions({});
                await refresh();
                return;
            }
            if (res.status === "conflicts") {
                setConflictKind("diverged");
                setConflictFiles(res.files ?? []);
                const initial: Record<string, "mine" | "theirs"> = {};
                for (const path of res.files ?? []) initial[path] = "mine";
                setResolutions(initial);
                notify.warning(t("ui.git.conflicts_found", "Konflikte gefunden — wähle pro Datei"));
            }
        } catch (err) {
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handleResolveMerge() {
        setBusy(true);
        try {
            await api.git.resolveConflict(bookId, resolutions);
            notify.success(t("ui.git.merge_resolved", "Konflikte aufgelöst"));
            setConflictKind(null);
            setConflictFiles([]);
            setResolutions({});
            await refresh();
        } catch (err) {
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handleAbortMerge() {
        setBusy(true);
        try {
            await api.git.abortMerge(bookId);
            notify.success(t("ui.git.merge_aborted", "Merge abgebrochen"));
            setConflictKind(null);
            setConflictFiles([]);
            setResolutions({});
            await refresh();
        } catch (err) {
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    async function handlePull() {
        setBusy(true);
        try {
            const res = await api.git.pull(bookId);
            if (res.updated) {
                notify.success(t("ui.git.pull_ok", "Pull erfolgreich"));
            } else {
                notify.success(t("ui.git.pull_no_changes", "Bereits aktuell"));
            }
            setConflictKind(null);
            await refresh();
        } catch (err) {
            if (err instanceof ApiError && err.detailBody?.code === "diverged") {
                setConflictKind("diverged");
                return;
            }
            if (err instanceof ApiError && err.detailBody?.code === "remote_auth") {
                notify.error(
                    t("ui.git.auth_failed", "Authentifizierung fehlgeschlagen. PAT prüfen."),
                    err,
                );
                return;
            }
            notify.error(describeError(err), err);
        } finally {
            setBusy(false);
        }
    }

    return {
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
    };
}
