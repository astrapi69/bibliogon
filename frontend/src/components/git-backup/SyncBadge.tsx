import { Check, Upload, Download, AlertTriangle } from "lucide-react";
import { GitSyncStatus } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";

export function SyncBadge({ sync }: { sync: GitSyncStatus }) {
    const { t } = useI18n();
    if (!sync.remote_configured) return null;
    if (sync.state === "in_sync") {
        return (
            <span
                style={{ color: "var(--accent)", fontSize: "0.75rem", fontWeight: 500 }}
                data-testid="git-sync-in-sync"
            >
                <Check size={12} style={{ verticalAlign: -1 }} /> {t("ui.git.in_sync", "synchron")}
            </span>
        );
    }
    if (sync.state === "local_ahead") {
        return (
            <span
                style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
                data-testid="git-sync-local-ahead"
            >
                <Upload size={12} style={{ verticalAlign: -1 }} /> {sync.ahead}{" "}
                {t("ui.git.ahead", "vorne")}
            </span>
        );
    }
    if (sync.state === "remote_ahead") {
        return (
            <span
                style={{ color: "var(--accent)", fontSize: "0.75rem", fontWeight: 500 }}
                data-testid="git-sync-remote-ahead"
            >
                <Download size={12} style={{ verticalAlign: -1 }} /> {sync.behind}{" "}
                {t("ui.git.behind", "hinten")}
            </span>
        );
    }
    if (sync.state === "diverged") {
        return (
            <span
                style={{ color: "var(--accent)", fontSize: "0.75rem", fontWeight: 500 }}
                data-testid="git-sync-diverged"
            >
                <AlertTriangle size={12} style={{ verticalAlign: -1 }} />{" "}
                {t("ui.git.diverged_short", "divergiert")}
            </span>
        );
    }
    return (
        <span
            style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
            data-testid="git-sync-never-synced"
        >
            {t("ui.git.never_synced", "noch nicht synchronisiert")}
        </span>
    );
}
