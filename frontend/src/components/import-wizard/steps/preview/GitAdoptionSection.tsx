import { useI18n } from "../../../../hooks/useI18n";
import type {
    DetectedGitRepo,
    GitAdoption,
} from "../../../../api/import";
import { humanSize } from "./model";
import {
    muteStyle,
    sectionHeadingStyle,
    sectionStyle,
} from "./styles";

/**
 * Git adoption selector: 3-way radio for a ``.git/`` found in the source.
 *
 * Backend values per protocol.py:
 * - ``start_fresh``: default; the .git/ is ignored; a fresh repo is
 *   created on the first local edit.
 * - ``adopt_with_remote``: copy .git/ and keep its remote URL.
 * - ``adopt_without_remote``: copy .git/ and strip the remote
 *   (sanitized already on the backend; this choice only confirms it).
 *
 * Surfaces security warnings from the inspect pass so the user knows
 * what sanitization will happen (credential helper stripped, custom
 * hooks dropped, etc.) before confirming adoption.
 */
export function GitAdoptionSection({
    info,
    choice,
    onChange,
}: {
    info: DetectedGitRepo;
    choice: GitAdoption;
    onChange: (c: GitAdoption) => void;
}) {
    const { t } = useI18n();
    const options: {
        value: GitAdoption;
        labelKey: string;
        fallback: string;
        descKey: string;
        descFallback: string;
        disabled?: boolean;
    }[] = [
        {
            value: "start_fresh",
            labelKey: "ui.import_wizard.git_start_fresh",
            fallback: "Start fresh",
            descKey: "ui.import_wizard.git_start_fresh_desc",
            descFallback:
                "Ignore the imported .git/ directory. A new repo will be created on the first local edit.",
        },
        {
            value: "adopt_with_remote",
            labelKey: "ui.import_wizard.git_adopt_with_remote",
            fallback: "Adopt history + remote",
            descKey: "ui.import_wizard.git_adopt_with_remote_desc",
            descFallback:
                "Keep commits, branches and the remote URL. Credentials are stripped before adoption.",
            disabled: !info.remote_url,
        },
        {
            value: "adopt_without_remote",
            labelKey: "ui.import_wizard.git_adopt_without_remote",
            fallback: "Adopt history only",
            descKey: "ui.import_wizard.git_adopt_without_remote_desc",
            descFallback:
                "Keep commits and branches. Discard the remote URL so you can wire up a fresh one.",
        },
    ];

    return (
        <section
            data-testid="preview-section-git-adoption"
            style={sectionStyle}
        >
            <h4 style={sectionHeadingStyle}>
                {t("ui.import_wizard.section_git", "Git history")}
            </h4>
            <p style={{ ...muteStyle, margin: "4px 0 8px 0" }}>
                {t(
                    "ui.import_wizard.git_detected_hint",
                    "The import source contains a .git/ directory. Pick whether to adopt its history into the new book.",
                )}
            </p>
            <ul
                data-testid="preview-git-summary"
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "0 0 10px 0",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 4,
                }}
            >
                {info.current_branch && (
                    <li data-testid="preview-git-branch">
                        {t("ui.import_wizard.git_branch", "Branch")}:{" "}
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                            {info.current_branch}
                        </span>
                    </li>
                )}
                {info.commit_count !== null && (
                    <li data-testid="preview-git-commits">
                        {t("ui.import_wizard.git_commits", "Commits")}:{" "}
                        {info.commit_count}
                    </li>
                )}
                {info.head_sha && (
                    <li data-testid="preview-git-head">
                        HEAD:{" "}
                        <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            title={info.head_sha}
                        >
                            {info.head_sha.slice(0, 10)}
                        </span>
                    </li>
                )}
                {info.remote_url && (
                    <li data-testid="preview-git-remote">
                        {t("ui.import_wizard.git_remote", "Remote")}:{" "}
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                wordBreak: "break-all",
                            }}
                            title={info.remote_url}
                        >
                            {info.remote_url}
                        </span>
                    </li>
                )}
                <li data-testid="preview-git-size">
                    {t("ui.import_wizard.git_size", "Size")}:{" "}
                    {humanSize(info.size_bytes)}
                </li>
                {info.has_lfs && (
                    <li data-testid="preview-git-lfs">
                        {t("ui.import_wizard.git_has_lfs", "LFS detected")}
                    </li>
                )}
                {info.has_submodules && (
                    <li data-testid="preview-git-submodules">
                        {t(
                            "ui.import_wizard.git_has_submodules",
                            "Submodules present (not adopted)",
                        )}
                    </li>
                )}
                {info.is_shallow && (
                    <li data-testid="preview-git-shallow">
                        {t("ui.import_wizard.git_is_shallow", "Shallow clone")}
                    </li>
                )}
                {info.is_corrupted && (
                    <li
                        data-testid="preview-git-corrupted"
                        style={{ color: "var(--danger)" }}
                    >
                        {t(
                            "ui.import_wizard.git_is_corrupted",
                            "Repository appears corrupted (fsck failed)",
                        )}
                    </li>
                )}
            </ul>
            {info.security_warnings.length > 0 && (
                <ul
                    data-testid="preview-git-security-warnings"
                    style={{
                        listStyle: "disc",
                        padding: "4px 8px 4px 20px",
                        margin: "0 0 10px 0",
                        background: "var(--bg-warning, var(--bg-hover))",
                        border: "1px solid var(--warning, var(--border))",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                    }}
                >
                    {info.security_warnings.map((warning, i) => (
                        <li key={i} data-testid="preview-git-security-warning">
                            {warning}
                        </li>
                    ))}
                </ul>
            )}
            <div
                role="radiogroup"
                aria-label={t(
                    "ui.import_wizard.section_git",
                    "Git history",
                )}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
                {options.map((opt) => {
                    const selected = choice === opt.value;
                    return (
                        <label
                            key={opt.value}
                            data-testid={`preview-git-option-${opt.value}`}
                            data-selected={selected ? "true" : "false"}
                            style={{
                                display: "flex",
                                gap: 8,
                                padding: 8,
                                border: selected
                                    ? "2px solid var(--accent)"
                                    : "1px solid var(--border)",
                                borderRadius: 6,
                                background: selected
                                    ? "var(--bg-hover)"
                                    : "var(--bg-primary)",
                                cursor: opt.disabled ? "not-allowed" : "pointer",
                                opacity: opt.disabled ? 0.55 : 1,
                            }}
                        >
                            <input
                                type="radio"
                                name="preview-git-adoption"
                                value={opt.value}
                                checked={selected}
                                disabled={opt.disabled}
                                onChange={() => onChange(opt.value)}
                                data-testid={`preview-git-radio-${opt.value}`}
                                style={{ marginTop: 3 }}
                            />
                            <span>
                                <span
                                    style={{
                                        fontWeight: 500,
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    {t(opt.labelKey, opt.fallback)}
                                </span>
                                <span
                                    style={{
                                        display: "block",
                                        fontSize: "0.75rem",
                                        color: "var(--text-muted)",
                                        marginTop: 2,
                                    }}
                                >
                                    {t(opt.descKey, opt.descFallback)}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}
