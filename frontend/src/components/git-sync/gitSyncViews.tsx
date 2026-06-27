/**
 * Read-only presentational views for the Git-Sync page (#207 god-file split).
 *
 * Extracted verbatim from pages/GitSyncPage.tsx: the notices, mapping
 * summary, unified-commit banner + result rows, the check-upstream button,
 * and the last-result banner, plus the shared `<dl>` style consts. These are
 * pure display components driven entirely by props — no state, no API calls.
 * data-testids are unchanged so the page renders the identical DOM.
 */

import type { CSSProperties } from "react";
import { AlertTriangle, GitBranch, Check, GitMerge } from "lucide-react";
import {
    GitSyncCommitResult,
    GitSyncMappingStatus,
    GitSyncUnifiedCommitResult,
} from "../../api/client";
import { useI18n } from "../../hooks/useI18n";

export function UnmappedNotice() {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-unmapped"
            style={{
                padding: 16,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                marginTop: 8,
            }}
        >
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
                {t(
                    "ui.git_sync.unmapped_body",
                    "Dieses Buch wurde nicht über die Git-URL-Importfunktion erstellt. Es gibt kein verbundenes Repository für den Sync.",
                )}
            </p>
        </div>
    );
}

export function CloneMissingNotice() {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-clone-missing"
            style={{
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                marginTop: 12,
                fontSize: "0.875rem",
            }}
        >
            <strong
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--accent-hover)",
                }}
            >
                <AlertTriangle size={14} />
                {t("ui.git_sync.clone_missing_heading", "Lokaler Klon nicht gefunden")}
            </strong>
            <p
                style={{
                    margin: "6px 0 0 0",
                    color: "var(--text-muted)",
                }}
            >
                {t(
                    "ui.git_sync.clone_missing_body",
                    "Der zuvor geklonte Repository-Pfad existiert nicht mehr. Bitte das Buch über die Git-URL-Importfunktion erneut importieren, um die Verbindung herzustellen.",
                )}
            </p>
        </div>
    );
}

export function MappingSummary({ status }: { status: GitSyncMappingStatus }) {
    const { t } = useI18n();
    return (
        <dl
            data-testid="git-sync-summary"
            style={{
                margin: "8px 0 12px 0",
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                columnGap: 12,
                rowGap: 4,
                fontSize: "0.8125rem",
            }}
        >
            <dt style={dt}>{t("ui.git_sync.repo_url_label", "Repository")}</dt>
            <dd data-testid="git-sync-repo-url" style={dd}>
                {status.repo_url}
            </dd>
            <dt style={dt}>{t("ui.git_sync.branch_label", "Branch")}</dt>
            <dd data-testid="git-sync-branch" style={dd}>
                {status.branch}
            </dd>
            <dt style={dt}>{t("ui.git_sync.last_imported_label", "Zuletzt importiert (SHA)")}</dt>
            <dd data-testid="git-sync-last-imported" style={ddMono}>
                {status.last_imported_commit_sha?.slice(0, 12)}
            </dd>
            {status.last_committed_at && (
                <>
                    <dt style={dt}>
                        {t("ui.git_sync.last_committed_label", "Letzter Sync-Commit")}
                    </dt>
                    <dd data-testid="git-sync-last-committed" style={dd}>
                        {new Date(status.last_committed_at).toLocaleString()}
                    </dd>
                </>
            )}
        </dl>
    );
}

export function UnifiedCommitBanner() {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-unified-banner"
            style={{
                marginTop: 6,
                padding: 10,
                background: "var(--accent-light, var(--bg-card))",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                fontSize: "0.8125rem",
                color: "var(--accent-hover)",
            }}
        >
            <GitBranch size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
            {t(
                "ui.git_sync.unified_banner",
                "Dieses Buch hat zusaetzlich Bibliogon-Git aktiv. 'Commit überall' macht beide Commits in einem Schritt.",
            )}
        </div>
    );
}

export function UnifiedResult({ result }: { result: GitSyncUnifiedCommitResult }) {
    const { t } = useI18n();
    const renderRow = (
        label: string,
        sub: GitSyncUnifiedCommitResult["core_git"],
        testid: string,
    ) => (
        <li
            data-testid={testid}
            data-status={sub.status}
            style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "4px 0",
            }}
        >
            <strong style={{ minWidth: 110 }}>{label}:</strong>
            <span
                style={{
                    fontSize: "0.75rem",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background:
                        sub.status === "ok"
                            ? "var(--success-light, var(--bg-card))"
                            : sub.status === "failed"
                              ? "var(--accent-light)"
                              : "var(--bg-card)",
                    color:
                        sub.status === "ok"
                            ? "var(--success, #16a34a)"
                            : sub.status === "failed"
                              ? "var(--accent-hover)"
                              : "var(--text-muted)",
                    border: "1px solid var(--border)",
                }}
            >
                {sub.status}
            </span>
            {sub.commit_sha && (
                <code
                    style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                    }}
                >
                    {sub.commit_sha.slice(0, 12)}
                </code>
            )}
            {sub.detail && (
                <span
                    style={{
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {sub.detail}
                </span>
            )}
        </li>
    );

    return (
        <ul
            data-testid="git-sync-unified-result"
            style={{
                listStyle: "none",
                padding: 10,
                margin: "12px 0 0 0",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: "0.8125rem",
            }}
        >
            {renderRow(
                t("ui.git_sync.subsystem_core", "Bibliogon-Git"),
                result.core_git,
                "git-sync-unified-row-core",
            )}
            {renderRow(
                t("ui.git_sync.subsystem_plugin", "Externes Repo"),
                result.plugin_git_sync,
                "git-sync-unified-row-plugin",
            )}
        </ul>
    );
}

export function CheckUpstreamButton({ onClick }: { onClick: () => void }) {
    const { t } = useI18n();
    return (
        <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClick}
            data-testid="git-sync-check-upstream"
            style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
            }}
        >
            <GitMerge size={14} />
            {t("ui.git_sync.check_upstream", "Auf Änderungen vom Repo prüfen")}
        </button>
    );
}

export function LastResult({ result }: { result: GitSyncCommitResult }) {
    const { t } = useI18n();
    return (
        <div
            data-testid="git-sync-last-result"
            style={{
                marginTop: 12,
                padding: 10,
                background: "var(--success-light, var(--bg-card))",
                border: "1px solid var(--success, #16a34a)",
                borderRadius: 4,
                fontSize: "0.8125rem",
                color: "var(--success, #16a34a)",
            }}
        >
            <Check size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
            {t("ui.git_sync.commit_success_detail", "Commit {sha} auf {branch}")
                .replace("{sha}", result.commit_sha.slice(0, 12))
                .replace("{branch}", result.branch)}
            {result.pushed && (
                <span style={{ marginLeft: 8 }}>{t("ui.git_sync.commit_pushed", "(gepusht)")}</span>
            )}
        </div>
    );
}

const dt: CSSProperties = {
    fontWeight: 500,
    color: "var(--text-secondary)",
};

const dd: CSSProperties = {
    margin: 0,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    wordBreak: "break-all",
};

const ddMono: CSSProperties = {
    ...dd,
    fontFamily: "var(--font-mono, monospace)",
};
