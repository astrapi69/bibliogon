/**
 * MovePanelToPageMenu - cross-page panel move via an action menu
 * (COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 2).
 *
 * The user-adjudicated alternative to drag-to-thumbnail: dragging a
 * panel from the canvas onto a PageThumbnails entry would require a
 * single shared DndContext over both subtrees and a refactor of the
 * PageThumbnails component that the picture-book PageEditor also
 * uses (a parallel surface). That refactor was judged dispropor-
 * tionate to the feature value, so cross-page move is a menu action
 * instead.
 *
 * Self-contained dropdown: the trigger button toggles a small menu
 * of the book's OTHER pages, each showing its capacity ("Seite 3 -
 * 2/4 Panels"). Full pages are disabled with a "(voll)" hint.
 * Entries are loaded lazily on open via ``loadEntries`` (the parent
 * fetches each page's panel count), so a stale count can't gate the
 * move. Selecting a target calls ``onMove`` with the target page id;
 * the parent runs the ComicPanelUpdate page_id PATCH + source
 * re-normalisation.
 *
 * Testid namespace: comic-book-editor-move-panel (trigger),
 * comic-book-editor-move-panel-menu (dropdown),
 * comic-book-editor-move-panel-target-{pageId} (each entry),
 * comic-book-editor-move-panel-empty / -loading (states).
 */

import { useCallback, useState } from "react";
import { MoveRight } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";

export interface MovePageEntry {
  pageId: string;
  position: number;
  count: number;
  max: number;
}

interface Props {
  disabled?: boolean;
  /** Loaded lazily on open - the parent fetches each other-page's
   *  panel count + resolves its template max. */
  loadEntries: () => Promise<MovePageEntry[]>;
  onMove: (pageId: string) => void | Promise<void>;
}

export function MovePanelToPageMenu({ disabled, loadEntries, onMove }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<MovePageEntry[]>([]);

  const handleToggle = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      setEntries(await loadEntries());
    } finally {
      setLoading(false);
    }
  }, [open, loadEntries]);

  const handlePick = useCallback(
    async (pageId: string) => {
      await onMove(pageId);
      setOpen(false);
    },
    [onMove],
  );

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        data-testid="comic-book-editor-move-panel"
        disabled={disabled}
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoveRight
          size={14}
          style={{ verticalAlign: "-2px", marginRight: 4 }}
        />
        {t("ui.comic_book_editor.move_panel", "Auf andere Seite verschieben")}
      </button>
      {open && (
        <div
          role="menu"
          data-testid="comic-book-editor-move-panel-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            minWidth: 220,
            background: "var(--bg-card, #fff)",
            border: "1px solid var(--border, #ddd)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            padding: 4,
          }}
        >
          {loading ? (
            <div
              data-testid="comic-book-editor-move-panel-loading"
              style={{
                padding: "8px 10px",
                color: "var(--text-secondary, #555)",
              }}
            >
              {t("ui.common.loading", "Lädt …")}
            </div>
          ) : entries.length === 0 ? (
            <div
              data-testid="comic-book-editor-move-panel-empty"
              style={{
                padding: "8px 10px",
                color: "var(--text-secondary, #555)",
              }}
            >
              {t(
                "ui.comic_book_editor.move_panel_no_targets",
                "Keine weiteren Seiten vorhanden",
              )}
            </div>
          ) : (
            entries.map((entry) => {
              const full = entry.count >= entry.max;
              const label = t(
                "ui.comic_book_editor.move_panel_target",
                "Seite {n} - {count}/{max} Panels",
              )
                .replace("{n}", String(entry.position))
                .replace("{count}", String(entry.count))
                .replace("{max}", String(entry.max));
              return (
                <button
                  key={entry.pageId}
                  type="button"
                  role="menuitem"
                  data-testid={`comic-book-editor-move-panel-target-${entry.pageId}`}
                  data-full={full ? "true" : "false"}
                  disabled={full}
                  onClick={() => void handlePick(entry.pageId)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    border: "none",
                    borderRadius: 4,
                    background: "transparent",
                    color: full
                      ? "var(--text-muted, #999)"
                      : "var(--text, #222)",
                    cursor: full ? "not-allowed" : "pointer",
                  }}
                >
                  {label}
                  {full &&
                    ` ${t("ui.comic_book_editor.move_panel_full", "(voll)")}`}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default MovePanelToPageMenu;
