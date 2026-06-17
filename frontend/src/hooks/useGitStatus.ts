import { useCallback, useEffect, useState } from "react";

import { api, GitSyncStatus } from "../api/client";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";

/**
 * Backend-derived git status for a single book: active branch + sync
 * state (ahead/behind origin). The URL itself lives in the book
 * metadata and is supplied by the caller — this hook only owns the
 * parts that require a backend round-trip.
 *
 * Shared by the Git-backup page (#358) and the metadata Git-Repository
 * field (#359) so both surfaces show the same branch/status data.
 *
 * `available` reflects the `git-backup` feature: in Dexie mode (the
 * backendless PWA) git operations are `DESKTOP_ONLY`, so this hook
 * fires NO `/api` request and leaves branch/state null — consumers
 * render "nicht verfügbar (Desktop-App benötigt)" instead.
 */
export interface GitStatusInfo {
    branch: string | null;
    ahead: number | null;
    behind: number | null;
    syncState: GitSyncStatus["state"] | null;
    initialized: boolean;
    available: boolean;
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useGitStatus(bookId: string): GitStatusInfo {
    const gitBackup = useFeature(FEATURES.GIT_BACKUP);
    const available = gitBackup.isActive;
    const [branch, setBranch] = useState<string | null>(null);
    const [ahead, setAhead] = useState<number | null>(null);
    const [behind, setBehind] = useState<number | null>(null);
    const [syncState, setSyncState] = useState<GitSyncStatus["state"] | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!available || !bookId) {
            setBranch(null);
            setAhead(null);
            setBehind(null);
            setSyncState(null);
            setInitialized(false);
            return;
        }
        setLoading(true);
        try {
            const st = await api.git.status(bookId);
            setInitialized(st.initialized);
            setBranch(st.branch);
            if (st.initialized) {
                const ss = await api.git.syncStatus(bookId);
                setAhead(ss.ahead);
                setBehind(ss.behind);
                setSyncState(ss.state);
            } else {
                setAhead(null);
                setBehind(null);
                setSyncState(null);
            }
        } catch {
            setBranch(null);
            setAhead(null);
            setBehind(null);
            setSyncState(null);
            setInitialized(false);
        } finally {
            setLoading(false);
        }
    }, [available, bookId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { branch, ahead, behind, syncState, initialized, available, loading, refresh };
}
