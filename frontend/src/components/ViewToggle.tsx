/**
 * Two-button grid/list view toggle for the books and articles
 * dashboards. Mirrors the radiogroup pattern used by the existing
 * theme picker and conflict-resolution dialog: ``aria-pressed`` on
 * each button + ``role="radiogroup"`` on the wrapper for screen
 * readers.
 */
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

export type ViewMode = "grid" | "list";

interface Props {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
    "data-testid"?: string;
}

export default function ViewToggle({ mode, onChange, "data-testid": testId }: Props) {
    const { t } = useI18n();

    const wrapperStyle: React.CSSProperties = {
        display: "inline-flex",
        gap: 0,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--bg-card)",
    };

    const btnStyle = (active: boolean): React.CSSProperties => ({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 10px",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "white" : "var(--text-muted)",
        border: "none",
        cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease",
    });

    return (
        <div
            role="radiogroup"
            aria-label={t("ui.dashboard.view_toggle_label", "Ansicht umschalten")}
            style={wrapperStyle}
            data-testid={testId ?? "view-toggle"}
        >
            <button
                type="button"
                role="radio"
                aria-checked={mode === "grid"}
                aria-label={t("ui.dashboard.view_grid", "Kachel-Ansicht")}
                title={t("ui.dashboard.view_grid", "Kachel-Ansicht")}
                onClick={() => onChange("grid")}
                style={btnStyle(mode === "grid")}
                data-testid="view-toggle-grid"
            >
                <LayoutGrid size={16} />
            </button>
            <button
                type="button"
                role="radio"
                aria-checked={mode === "list"}
                aria-label={t("ui.dashboard.view_list", "Listen-Ansicht")}
                title={t("ui.dashboard.view_list", "Listen-Ansicht")}
                onClick={() => onChange("list")}
                style={btnStyle(mode === "list")}
                data-testid="view-toggle-list"
            >
                <ListIcon size={16} />
            </button>
        </div>
    );
}
