/**
 * Shared inline styles for the Step-3 Preview panel + its
 * sub-sections. Extracted from PreviewPanel.tsx to keep the
 * file under the cohesion threshold; values are byte-identical.
 */

export const sectionStyle: React.CSSProperties = {
    marginTop: 14,
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-card)",
};

export const sectionHeadingStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "0.9375rem",
    fontWeight: 600,
};

export const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 2,
};

export const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontSize: "0.875rem",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
};

export const errorStyle: React.CSSProperties = {
    margin: "2px 0 0 0",
    fontSize: "0.75rem",
    color: "var(--danger)",
};

export const muteStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
};

export const idStyle: React.CSSProperties = {
    marginTop: 6,
    fontSize: "0.625rem",
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    wordBreak: "break-all",
};
