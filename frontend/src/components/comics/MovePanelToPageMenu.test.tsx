/**
 * MovePanelToPageMenu tests (COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 2).
 *
 * Pins the cross-page move menu contract:
 * - trigger disabled when no panel is selected
 * - open loads entries lazily + renders capacity ("2/4 Panels")
 * - full pages are disabled with a "(voll)" hint
 * - picking a non-full target fires onMove(pageId) + closes the menu
 * - empty target set shows the no-targets message
 *
 * This is a plain custom dropdown (not Radix), so happy-dom handles
 * the open/close + portal-free list without the brittleness that
 * the Radix-DropdownMenu lessons-learned warns about.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { MovePanelToPageMenu, type MovePageEntry } from "./MovePanelToPageMenu";

const ENTRIES: MovePageEntry[] = [
  { pageId: "pgA", position: 2, count: 1, max: 4 },
  { pageId: "pgFull", position: 3, count: 4, max: 4 },
];

describe("MovePanelToPageMenu", () => {
  it("disables the trigger when disabled is true", () => {
    render(
      <MovePanelToPageMenu
        disabled
        loadEntries={vi.fn(async () => [])}
        onMove={vi.fn()}
      />,
    );
    expect(
      (screen.getByTestId("comic-book-editor-move-panel") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("loads + renders page entries with capacity on open", async () => {
    const loadEntries = vi.fn(async () => ENTRIES);
    render(<MovePanelToPageMenu loadEntries={loadEntries} onMove={vi.fn()} />);
    fireEvent.click(screen.getByTestId("comic-book-editor-move-panel"));
    await screen.findByTestId("comic-book-editor-move-panel-target-pgA");
    expect(loadEntries).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("comic-book-editor-move-panel-target-pgA").textContent,
    ).toContain("1/4");
  });

  it("disables a full page entry and marks it data-full", async () => {
    render(
      <MovePanelToPageMenu
        loadEntries={vi.fn(async () => ENTRIES)}
        onMove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("comic-book-editor-move-panel"));
    const fullEntry = (await screen.findByTestId(
      "comic-book-editor-move-panel-target-pgFull",
    )) as HTMLButtonElement;
    expect(fullEntry.disabled).toBe(true);
    expect(fullEntry.getAttribute("data-full")).toBe("true");
  });

  it("fires onMove with the target id and closes the menu on pick", async () => {
    const onMove = vi.fn();
    render(
      <MovePanelToPageMenu
        loadEntries={vi.fn(async () => ENTRIES)}
        onMove={onMove}
      />,
    );
    fireEvent.click(screen.getByTestId("comic-book-editor-move-panel"));
    const entry = await screen.findByTestId(
      "comic-book-editor-move-panel-target-pgA",
    );
    fireEvent.click(entry);
    await waitFor(() => expect(onMove).toHaveBeenCalledWith("pgA"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("comic-book-editor-move-panel-menu"),
      ).toBeNull(),
    );
  });

  it("shows the no-targets message when there are no other pages", async () => {
    render(
      <MovePanelToPageMenu
        loadEntries={vi.fn(async () => [])}
        onMove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("comic-book-editor-move-panel"));
    await screen.findByTestId("comic-book-editor-move-panel-empty");
  });
});
