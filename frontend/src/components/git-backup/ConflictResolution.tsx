import { Check, Download, Upload, AlertTriangle } from "lucide-react";
import { useDialog } from "../shared/AppDialog";
import { useI18n } from "../../hooks/useI18n";

export function ConflictResolution({
    kind,
    busy,
    files,
    resolutions,
    onResolutionChange,
    onMerge,
    onResolve,
    onAbort,
    onAcceptLocal,
    onCancel,
}: {
    kind: "push_rejected" | "diverged";
    busy: boolean;
    files: string[];
    resolutions: Record<string, "mine" | "theirs">;
    onResolutionChange: (path: string, side: "mine" | "theirs") => void;
    onMerge: () => void;
    onResolve: () => void;
    onAbort: () => void;
    onAcceptLocal: () => void;
    onCancel: () => void;
}) {
    const { t } = useI18n();
    const dialog = useDialog();
    const inResolution = files.length > 0;

    const title = inResolution
        ? t("ui.git.conflict_resolve_title", "Konflikte pro Datei auflösen")
        : kind === "push_rejected"
          ? t("ui.git.conflict_push_rejected_title", "Push abgelehnt")
          : t("ui.git.conflict_diverged_title", "Divergierte Historie");

    const body = inResolution
        ? t(
              "ui.git.conflict_resolve_body",
              "Pro betroffener Datei: lokale oder Remote-Version behalten. Danach wird ein Merge-Commit erzeugt.",
          )
        : kind === "push_rejected"
          ? t(
                "ui.git.conflict_push_rejected_body",
                "Das Remote hat neuere Commits, die lokal nicht vorhanden sind. Entscheide, welche Seite gewinnt:",
            )
          : t(
                "ui.git.conflict_diverged_body",
                "Beide Seiten haben eigene Commits. Wähle: mergen (bei Konflikten pro Datei entscheiden), Remote ignorieren (Force Push), oder abbrechen.",
            );

    return (
        <div
            style={{
                margin: "0 16px 16px",
                padding: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)",
            }}
            data-testid="git-conflict-resolution"
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                }}
            >
                <AlertTriangle size={16} style={{ color: "var(--accent)" }} />
                <strong style={{ fontSize: "0.9375rem" }}>{title}</strong>
            </div>
            <p
                style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    marginBottom: 10,
                }}
            >
                {body}
            </p>

            {inResolution ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <ul
                        style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                        }}
                        data-testid="git-conflict-file-list"
                    >
                        {files.map((path) => (
                            <li
                                key={path}
                                style={{
                                    padding: 8,
                                    background: "var(--bg-secondary)",
                                    borderRadius: "var(--radius-sm)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    fontSize: "0.8125rem",
                                }}
                                data-testid="git-conflict-file"
                            >
                                <code
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.75rem",
                                        flex: 1,
                                        minWidth: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {path}
                                </code>
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        cursor: "pointer",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name={`resolution-${path}`}
                                        checked={resolutions[path] === "mine"}
                                        onChange={() => onResolutionChange(path, "mine")}
                                        disabled={busy}
                                        data-testid={`git-conflict-mine-${path}`}
                                    />
                                    {t("ui.git.keep_mine", "Lokal")}
                                </label>
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        cursor: "pointer",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name={`resolution-${path}`}
                                        checked={resolutions[path] === "theirs"}
                                        onChange={() => onResolutionChange(path, "theirs")}
                                        disabled={busy}
                                        data-testid={`git-conflict-theirs-${path}`}
                                    />
                                    {t("ui.git.keep_theirs", "Remote")}
                                </label>
                            </li>
                        ))}
                    </ul>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={onResolve}
                            disabled={busy}
                            data-testid="git-conflict-resolve-btn"
                        >
                            <Check size={14} /> {t("ui.git.apply_resolution", "Auflösung anwenden")}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={onAbort}
                            disabled={busy}
                            data-testid="git-conflict-abort-btn"
                        >
                            {t("ui.git.abort_merge", "Merge abbrechen")}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={onMerge}
                        disabled={busy}
                        data-testid="git-conflict-merge"
                    >
                        <Download size={14} /> {t("ui.git.merge", "Mergen")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                            const ok = await dialog.confirm(
                                t("ui.git.confirm_accept_local_title", "Auf Remote erzwingen?"),
                                t(
                                    "ui.git.confirm_accept_local",
                                    "Lokale Version auf Remote erzwingen? Die Remote-Commits werden überschrieben und sind danach weg.",
                                ),
                                "danger",
                            );
                            if (ok) {
                                onAcceptLocal();
                            }
                        }}
                        disabled={busy}
                        data-testid="git-conflict-accept-local"
                    >
                        <Upload size={14} />{" "}
                        {t("ui.git.accept_local", "Lokal erzwingen (Force Push)")}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
                        {t("ui.common.cancel", "Abbrechen")}
                    </button>
                </div>
            )}
        </div>
    );
}
