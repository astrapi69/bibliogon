/**
 * Bubble CRUD + drag handlers for the comic-book editor (#207 god-file
 * split). Extracted verbatim from useComicBookEditor.ts: add / delete /
 * update a speech bubble, plus the anchor-drag and tail-drag persisters.
 * The parent hook owns the state; this sub-hook receives the slice these
 * handlers need. Behaviour is byte-identical.
 */

import { useCallback, type Dispatch, type SetStateAction } from "react";

import { ApiError } from "../../../api/client";
import { getStorage } from "../../../storage";
import type { ComicBubbleData } from "../ComicBubble";

interface ComicBubbleCrudArgs {
  bookId: string;
  activePageId: string | null;
  selectedPanelId: string | null;
  selectedBubbleId: string | null;
  setSelectedBubbleId: Dispatch<SetStateAction<string | null>>;
  setPagesError: Dispatch<SetStateAction<string | null>>;
  refreshPanelsAndBubbles: (pageId: string) => Promise<void>;
}

export function useComicBubbleCrud({
  bookId,
  activePageId,
  selectedPanelId,
  selectedBubbleId,
  setSelectedBubbleId,
  setPagesError,
  refreshPanelsAndBubbles,
}: ComicBubbleCrudArgs) {
  const handleAddBubble = useCallback(async () => {
    if (!selectedPanelId || !activePageId) return;
    try {
      const newBubble = await getStorage().comics.createBubble(bookId, selectedPanelId, {
        bubble_type: "speech",
        anchor: { x_pct: 25, y_pct: 25 },
      });
      await refreshPanelsAndBubbles(activePageId);
      // Auto-select the new bubble — same rationale as
      // handleAddPanel: visible feedback + the side-pane
      // LayoutConfigComicBubble immediately becomes available
      // for editing.
      setSelectedBubbleId(newBubble.id);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [
    activePageId,
    bookId,
    refreshPanelsAndBubbles,
    selectedPanelId,
    setSelectedBubbleId,
    setPagesError,
  ]);

  const handleDeleteBubble = useCallback(async () => {
    if (!selectedBubbleId || !activePageId) return;
    try {
      await getStorage().comics.deleteBubble(bookId, selectedBubbleId);
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
    selectedBubbleId,
    setSelectedBubbleId,
    setPagesError,
  ]);

  const handleUpdateBubble = useCallback(
    async (partial: Partial<ComicBubbleData>) => {
      if (!selectedBubbleId || !activePageId) return;
      try {
        await getStorage().comics.updateBubble(
          bookId,
          selectedBubbleId,
          partial as Record<string, unknown>,
        );
        await refreshPanelsAndBubbles(activePageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      refreshPanelsAndBubbles,
      selectedBubbleId,
      setPagesError,
    ],
  );

  /** Bubble drag-end handler: persists the new anchor and selects
   *  the dragged bubble (so the side-pane's anchor sliders update
   *  to match the dragged position via the controlled-input
   *  binding). Drag-end fires once per drag, AFTER the 5px
   *  threshold has been crossed. */
  const handleBubbleDragEnd = useCallback(
    async (bubbleId: string, x_pct: number, y_pct: number) => {
      if (!activePageId) return;
      setSelectedBubbleId(bubbleId);
      try {
        await getStorage().comics.updateBubble(bookId, bubbleId, {
          anchor: { x_pct, y_pct },
        });
        await refreshPanelsAndBubbles(activePageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      refreshPanelsAndBubbles,
      setSelectedBubbleId,
      setPagesError,
    ],
  );

  /** Tail-handle drag-end handler: persists the derived
   *  (tail_direction, tail_position_pct, tail_length_px) triple
   *  for the dragged bubble. Same select-then-persist shape as
   *  handleBubbleDragEnd so the side-pane tail sliders reflect
   *  the new values via controlled-input binding. */
  const handleBubbleTailDragEnd = useCallback(
    async (
      bubbleId: string,
      direction: string,
      positionPct: number,
      lengthPx: number,
    ) => {
      if (!activePageId) return;
      setSelectedBubbleId(bubbleId);
      try {
        await getStorage().comics.updateBubble(bookId, bubbleId, {
          tail_direction: direction,
          tail_position_pct: positionPct,
          tail_length_px: lengthPx,
        });
        await refreshPanelsAndBubbles(activePageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      refreshPanelsAndBubbles,
      setSelectedBubbleId,
      setPagesError,
    ],
  );

  return {
    handleAddBubble,
    handleDeleteBubble,
    handleUpdateBubble,
    handleBubbleDragEnd,
    handleBubbleTailDragEnd,
  };
}
