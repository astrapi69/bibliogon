/**
 * Shared inline styles + the localizer type for the Settings > About
 * sub-sections. Extracted from AboutSettings.tsx (#675) so each section
 * component imports the same surface without re-declaring it.
 */

/** Localizer signature: `(key, fallback) => translated`. */
export type T = (key: string, fallback: string) => string;

export const sectionStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid var(--border, #ddd)",
  borderRadius: 8,
  backgroundColor: "var(--surface-2, #fafafa)",
};

export const dlStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  gap: "4px 16px",
  fontSize: "0.9rem",
  margin: 0,
};

export const externalLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};
