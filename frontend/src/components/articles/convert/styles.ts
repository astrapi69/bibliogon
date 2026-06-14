/**
 * Step-body + sortable-row styles for ConvertToBookWizard. Dialog
 * chrome (overlay, content, title), step indicator, back/skip/next
 * nav and close-button styles live in WizardShell. Only step-body-
 * specific styles remain here. Extracted from ConvertToBookWizard.tsx;
 * values are byte-identical.
 */

export const styles: Record<string, React.CSSProperties> = {
    // CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 Bug #1: the dialog
    // used to grow / shrink with each step's content amount. The
    // shell already caps the WHOLE dialog at maxHeight 90vh; we
    // constrain the step body itself so the dialog dimensions stay
    // visually stable across all 6 steps. minHeight covers the
    // smallest-natural step (metadata, front-matter, etc.); maxHeight
    // + overflowY scrolls inside the largest-natural step (selection
    // list, review). Picked from a per-step audit; conservative
    // enough that no step needs more than mild internal scroll.
    stepContent: {
        minHeight: 380,
        maxHeight: 520,
        overflowY: "auto",
    },
    hint: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
    },
    row: {
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginBottom: 12,
        flexWrap: "wrap",
    },
    label: {
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    select: {
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        fontSize: "0.875rem",
    },
    countBadge: {
        marginLeft: "auto",
        padding: "4px 10px",
        background: "var(--surface-2, var(--bg-secondary))",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    tagBar: {
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 12,
    },
    list: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        maxHeight: 320,
        overflowY: "auto",
    },
    toggleRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
    },
    fieldHint: {
        color: "var(--text-muted)",
        fontSize: "0.75rem",
        marginTop: 2,
        display: "block",
    },
    fieldError: {
        color: "var(--danger)",
        fontSize: "0.75rem",
        marginTop: 2,
        display: "block",
    },
    infoBox: {
        background: "var(--surface-2, var(--bg-secondary))",
        padding: 10,
        borderRadius: "var(--radius-sm, 4px)",
        marginTop: 8,
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    errorBanner: {
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
        padding: 12,
        borderRadius: "var(--radius-sm, 4px)",
        marginBottom: 16,
        fontSize: "0.8125rem",
        display: "grid",
        gap: 4,
    },
    reviewList: {
        display: "grid",
        gridTemplateColumns: "max-content 1fr",
        gap: "6px 16px",
        marginBottom: 16,
        fontSize: "0.875rem",
    },
}

export const rowStyles: Record<string, React.CSSProperties> = {
    row: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
    },
    dragHandle: {
        display: "flex",
        cursor: "grab",
        color: "var(--text-muted)",
    },
    title: {
        flex: 1,
        fontSize: "0.875rem",
        color: "var(--text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    removeBtn: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        padding: 4,
    },
}
