/**
 * Panel + grid CRUD handlers for the comic-book editor (#207 god-file
 * split). Extracted verbatim from useComicBookEditor.ts: the grid-template
 * overflow handler, panel add/delete/update, image upload, panel reorder,
 * and the cross-page move. The parent hook owns the state; this sub-hook
 * receives the slice these handlers need. Behaviour is byte-identical.
 */

import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  ApiError,
  type ComicPanelOut,
  type Page,
} from "../../../api/client";
import { getStorage } from "../../../storage";
import { useI18n } from "../../../hooks/useI18n";
import { notify } from "../../../utils/platform/notify";

import {
  COMIC_GRID_MAX_PANELS,
  resolveComicGridTemplate,
  type ComicGridTemplate,
} from "../ComicPanelGrid";
import { type MovePageEntry } from "../MovePanelToPageMenu";
import type { ComicPanelData } from "../ComicPanel";
import { useDialog } from "../../shared/AppDialog";

interface ComicPanelCrudArgs {
  bookId: string;
  activePageId: string | null;
  pages: Page[];
  panels: ComicPanelOut[];
  selectedPanelId: string | null;
  setPanels: Dispatch<SetStateAction<ComicPanelOut[]>>;
  setSelectedPanelId: Dispatch<SetStateAction<string | null>>;
  setSelectedBubbleId: Dispatch<SetStateAction<string | null>>;
  setPagesError: Dispatch<SetStateAction<string | null>>;
  refreshPages: () => Promise<Page[]>;
  refreshPanelsAndBubbles: (pageId: string) => Promise<void>;
  refreshAssets: () => Promise<void>;
}

export function useComicPanelCrud({
  bookId,
  activePageId,
  pages,
  panels,
  selectedPanelId,
  setPanels,
  setSelectedPanelId,
  setSelectedBubbleId,
  setPagesError,
  refreshPages,
  refreshPanelsAndBubbles,
  refreshAssets,
}: ComicPanelCrudArgs) {
  const { t } = useI18n();
  const dialog = useDialog();

  // Handler for ComicGridTemplatePicker. Writes ``comic_grid_template``
  // into the active page's ``layout_config`` while preserving any
  // sibling keys (future Phase 3 #6 panel-gutter, etc.).
  //
  // COMIC-PANEL-OVERFLOW-HANDLER-01 (2026-05-28): when the target
  // template's panel cap is BELOW the current panel count, the
  // user is asked to choose between (A) "Move excess panels to
  // new automatically-created pages", (B) "Delete excess panels
  // permanently" (destructive, confirmed), or (C) cancel the
  // layout switch entirely. No silent hiding — data ghosts are
  // forbidden per the user-stated discipline.
  const handleChangeGridTemplate = useCallback(
    async (template: ComicGridTemplate) => {
      if (!activePageId) return;
      const activePage = pages.find((p) => p.id === activePageId);
      if (!activePage) return;
      const priorConfig =
        (activePage.layout_config as Record<string, unknown> | null) ?? {};

      // Count current panels on the active page; compare
      // against the target template's max.
      const currentPanelCount = panels.length;
      const targetMax = COMIC_GRID_MAX_PANELS[template];
      const excess = Math.max(0, currentPanelCount - targetMax);

      // Persists the new template (and optionally refreshes
      // panels) without re-checking overflow. Used after the
      // overflow has been resolved (or there was no overflow).
      const persistTemplateChange = async () => {
        await getStorage().pages.update(bookId, activePageId, {
          layout_config: {
            ...priorConfig,
            comic_grid_template: template,
          },
        });
        await refreshPages();
        if (activePageId) {
          await refreshPanelsAndBubbles(activePageId);
        }
      };

      try {
        if (excess === 0) {
          await persistTemplateChange();
          return;
        }

        // Build the confirmation choice. dialog.choose
        // returns the chosen value's string, or null on
        // cancel.
        const message = t(
          "ui.comic_book_editor.overflow_message",
          `Die ausgewählte Vorlage erlaubt nur ${targetMax} Panel(s), aber die Seite hat ${currentPanelCount}. ${excess} überzählige Panel(s) müssen verschoben oder gelöscht werden.`,
        )
          .replace("{target}", String(targetMax))
          .replace("{current}", String(currentPanelCount))
          .replace("{excess}", String(excess));

        const choice = await dialog.choose(
          t(
            "ui.comic_book_editor.overflow_title",
            "Zu viele Panels für diese Vorlage",
          ),
          message,
          [
            {
              value: "move",
              label: t(
                "ui.comic_book_editor.overflow_move",
                "Auf neue Seiten verschieben",
              ),
            },
            {
              value: "delete",
              label: t("ui.comic_book_editor.overflow_delete", "Löschen"),
              variant: "danger",
            },
          ],
          t("ui.common.cancel", "Abbrechen"),
        );

        if (choice === null) {
          // Cancel: layout switch not performed.
          return;
        }

        // Sort panels by position so "excess" picks the
        // LAST N panels — most recently added — and keeps
        // the earliest panels in their place.
        const sortedPanels = [...panels].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );
        const excessPanels = sortedPanels.slice(targetMax);

        if (choice === "delete") {
          // Explicit destructive confirmation per the
          // spec — second prompt with explicit warning
          // about bubbles + images being permanently
          // lost.
          const reallyDelete = await dialog.confirm(
            t(
              "ui.comic_book_editor.overflow_delete_confirm_title",
              "Wirklich endgültig löschen?",
            ),
            t(
              "ui.comic_book_editor.overflow_delete_confirm_message",
              `${excess} Panels mit allen Inhalten (Sprechblasen, Bilder) werden endgültig gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.`,
            ).replace("{excess}", String(excess)),
            "danger",
          );
          if (!reallyDelete) return;
          // Sequential delete preserves error visibility
          // per panel; parallel would mask which panel
          // failed.
          for (const p of excessPanels) {
            await getStorage().comics.deletePanel(bookId, p.id);
          }
          notify.success(
            t(
              "ui.comic_book_editor.overflow_delete_toast",
              `${excess} Panels gelöscht.`,
            ).replace("{excess}", String(excess)),
          );
        } else {
          // Move path: distribute excess across new
          // pages, each with target template, filling
          // targetMax per page.
          const newPagesCount = Math.ceil(excess / targetMax);
          const newPageIds: string[] = [];
          for (let i = 0; i < newPagesCount; i++) {
            const newPage = await getStorage().pages.create(bookId, {
              layout: "comic_panel_grid",
              layout_config: {
                comic_grid_template: template,
              },
            });
            newPageIds.push(newPage.id);
          }
          // For each excess panel, PATCH page_id +
          // position to its slot on the new page.
          for (let i = 0; i < excessPanels.length; i++) {
            const targetPageIndex = Math.floor(i / targetMax);
            const positionInTargetPage = i % targetMax;
            await getStorage().comics.updatePanel(bookId, excessPanels[i].id, {
              page_id: newPageIds[targetPageIndex],
              position: positionInTargetPage,
            });
          }
          notify.success(
            t(
              "ui.comic_book_editor.overflow_move_toast",
              `${excess} Panels auf ${newPagesCount} neue Seite(n) verschoben.`,
            )
              .replace("{excess}", String(excess))
              .replace("{pages}", String(newPagesCount)),
          );
        }

        // Either path: now persist the layout switch on
        // the active page + refresh.
        await persistTemplateChange();
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      pages,
      panels,
      refreshPages,
      refreshPanelsAndBubbles,
      dialog,
      t,
      setPagesError,
    ],
  );

  const handleAddPanel = useCallback(async () => {
    if (!activePageId) return;
    // Defense-in-depth against keyboard shortcuts or DOM-
    // manipulation that bypass the button's disabled attr: the
    // capacity check is also enforced here.
    const activePageRow = pages.find((p) => p.id === activePageId);
    const template = resolveComicGridTemplate(
      (activePageRow?.layout_config ?? null) as Record<string, unknown> | null,
    );
    if (panels.length >= COMIC_GRID_MAX_PANELS[template]) return;
    try {
      const newPanel = await getStorage().comics.createPanel(bookId, activePageId, {
        bounds: { x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100 },
      });
      await refreshPanelsAndBubbles(activePageId);
      // Auto-select the new panel so (a) the user gets visible
      // feedback that the click worked and (b) Add-Bubble
      // immediately enables without a separate panel-click.
      setSelectedPanelId(newPanel.id);
      setSelectedBubbleId(null);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [
    activePageId,
    bookId,
    pages,
    panels.length,
    refreshPanelsAndBubbles,
    setSelectedPanelId,
    setSelectedBubbleId,
    setPagesError,
  ]);

  const handleDeletePanel = useCallback(async () => {
    if (!selectedPanelId || !activePageId) return;
    try {
      await getStorage().comics.deletePanel(bookId, selectedPanelId);
      setSelectedPanelId(null);
      setSelectedBubbleId(null);
      await refreshPanelsAndBubbles(activePageId);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [
    activePageId,
    bookId,
    refreshPanelsAndBubbles,
    selectedPanelId,
    setSelectedPanelId,
    setSelectedBubbleId,
    setPagesError,
  ]);

  const handleUpdatePanel = useCallback(
    async (partial: Partial<ComicPanelData>) => {
      if (!selectedPanelId || !activePageId) return;
      try {
        await getStorage().comics.updatePanel(
          bookId,
          selectedPanelId,
          partial as Record<string, unknown>,
        );
        await refreshPanelsAndBubbles(activePageId);
        // Image upload + clear paths change the asset set:
        // refresh the URL map so the new image surfaces in
        // the editor body (ComicPanelGrid) and the cleared
        // image vanishes.
        if ("image_asset_id" in partial) {
          await refreshAssets();
        }
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      refreshAssets,
      refreshPanelsAndBubbles,
      selectedPanelId,
      setPagesError,
    ],
  );

  const handleUploadPanelImage = useCallback(
    async (panelId: string, file: File) => {
      if (!activePageId) return;
      try {
        const asset = await getStorage().assets.upload(bookId, file, "figure");
        await getStorage().comics.updatePanel(bookId, panelId, {
          image_asset_id: asset.id,
        });
        await refreshPanelsAndBubbles(activePageId);
        await refreshAssets();
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [activePageId, bookId, refreshAssets, refreshPanelsAndBubbles, setPagesError],
  );

  // COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 1: same-page panel
  // reorder. ``panelIds`` is the full ordered id-list emitted by
  // ComicPanelGrid's dnd-kit SortableContext on drop. Optimistically
  // re-index positions so the grid (which sorts by position)
  // reflects the new order immediately, then reconcile with the
  // server's two-phase reorder response. On failure, re-fetch.
  const handlePanelReorder = useCallback(
    async (panelIds: string[]) => {
      if (!activePageId) return;
      setPanels((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        return panelIds
          .map((id, idx) => {
            const panel = byId.get(id);
            return panel ? { ...panel, position: idx + 1 } : undefined;
          })
          .filter((p): p is ComicPanelOut => Boolean(p));
      });
      try {
        const reordered = await getStorage().comics.reorderPanels(
          bookId,
          activePageId,
          panelIds,
        );
        setPanels(reordered);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
        await refreshPanelsAndBubbles(activePageId);
      }
    },
    [activePageId, bookId, refreshPanelsAndBubbles, setPanels, setPagesError],
  );

  // COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 2: cross-page move via the
  // "Move to page" action menu. Capacity per OTHER page is fetched
  // lazily on menu-open so a stale count can't gate the move.
  const loadMoveEntries = useCallback(async (): Promise<MovePageEntry[]> => {
    const otherPages = pages.filter((p) => p.id !== activePageId);
    const entries = await Promise.all(
      otherPages.map(async (p) => {
        const targetPanels = await getStorage().comics.listPanels(bookId, p.id);
        const template = resolveComicGridTemplate(
          (p.layout_config as Record<string, unknown> | null) ?? null,
        );
        return {
          pageId: p.id,
          position: p.position,
          count: targetPanels.length,
          max: COMIC_GRID_MAX_PANELS[template],
        };
      }),
    );
    return entries.sort((a, b) => a.position - b.position);
  }, [pages, activePageId, bookId]);

  // Move the selected panel to another page: PATCH page_id + append
  // position, then re-normalise the source page's positions to 1..N
  // via the C1 reorder endpoint so no gap survives the move.
  const handleMovePanel = useCallback(
    async (targetPageId: string) => {
      if (!selectedPanelId || !activePageId) return;
      const sourcePageId = activePageId;
      const movedPanelId = selectedPanelId;
      try {
        const targetPanels = await getStorage().comics.listPanels(bookId, targetPageId);
        await getStorage().comics.updatePanel(bookId, movedPanelId, {
          page_id: targetPageId,
          position: targetPanels.length + 1,
        });
        const remaining = panels
          .filter((p) => p.id !== movedPanelId)
          .sort((a, b) => a.position - b.position)
          .map((p) => p.id);
        if (remaining.length > 0) {
          await getStorage().comics.reorderPanels(bookId, sourcePageId, remaining);
        }
        setSelectedPanelId(null);
        setSelectedBubbleId(null);
        await refreshPanelsAndBubbles(sourcePageId);
        const targetPosition =
          pages.find((p) => p.id === targetPageId)?.position ?? "?";
        notify.success(
          t(
            "ui.comic_book_editor.move_panel_success",
            "Panel auf Seite {n} verschoben",
          ).replace("{n}", String(targetPosition)),
        );
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
        await refreshPanelsAndBubbles(sourcePageId);
      }
    },
    [
      selectedPanelId,
      activePageId,
      bookId,
      panels,
      pages,
      refreshPanelsAndBubbles,
      t,
      setSelectedPanelId,
      setSelectedBubbleId,
      setPagesError,
    ],
  );

  return {
    handleChangeGridTemplate,
    handleAddPanel,
    handleDeletePanel,
    handleUpdatePanel,
    handleUploadPanelImage,
    handlePanelReorder,
    loadMoveEntries,
    handleMovePanel,
  };
}
