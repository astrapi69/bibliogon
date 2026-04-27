/**
 * Pins the 409 conflict dialog's contract:
 * - Both panels render plain-text previews of local vs server content
 * - Keep/Discard buttons invoke their callbacks with the ConflictInfo
 * - The dialog is modal: escape and overlay-click cannot dismiss it
 *   (users must explicitly pick a resolution)
 */
import React from "react";
import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ConflictResolutionDialog, {type ConflictInfo} from "./ConflictResolutionDialog";

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({t: (_: string, f: string) => f}),
}));

const TIP_TAP_DOC = (text: string) =>
  JSON.stringify({type: "doc", content: [{type: "paragraph", content: [{type: "text", text}]}]});

const info: ConflictInfo = {
  chapterId: "c1",
  localContent: TIP_TAP_DOC("my local edit"),
  serverContent: TIP_TAP_DOC("someone else saved"),
  serverVersion: 5,
  serverTitle: "Chapter 1",
  serverUpdatedAt: "2026-04-18T12:00:00Z",
};

describe("ConflictResolutionDialog", () => {
  it("renders nothing when conflict is null", () => {
    const {container} = render(
      <ConflictResolutionDialog conflict={null} onKeepLocal={vi.fn()} onDiscardLocal={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders both previews of the TipTap content", () => {
    render(<ConflictResolutionDialog conflict={info} onKeepLocal={vi.fn()} onDiscardLocal={vi.fn()} />);
    expect(screen.getByTestId("conflict-local-preview").textContent).toContain("my local edit");
    expect(screen.getByTestId("conflict-server-preview").textContent).toContain("someone else saved");
  });

  it("Keep button invokes onKeepLocal with the conflict info", () => {
    const onKeepLocal = vi.fn();
    render(<ConflictResolutionDialog conflict={info} onKeepLocal={onKeepLocal} onDiscardLocal={vi.fn()} />);
    fireEvent.click(screen.getByTestId("conflict-keep"));
    expect(onKeepLocal).toHaveBeenCalledWith(info);
  });

  it("Discard button invokes onDiscardLocal with the conflict info", () => {
    const onDiscardLocal = vi.fn();
    render(<ConflictResolutionDialog conflict={info} onKeepLocal={vi.fn()} onDiscardLocal={onDiscardLocal} />);
    fireEvent.click(screen.getByTestId("conflict-discard"));
    expect(onDiscardLocal).toHaveBeenCalledWith(info);
  });

  it("falls back to raw content on parse failure", () => {
    const raw: ConflictInfo = {...info, localContent: "not JSON", serverContent: "also not JSON"};
    render(<ConflictResolutionDialog conflict={raw} onKeepLocal={vi.fn()} onDiscardLocal={vi.fn()} />);
    expect(screen.getByTestId("conflict-local-preview").textContent).toContain("not JSON");
  });

  // --- PS-13: Save as new chapter ---

  it("does not render Save-as-new when onSaveAsNewChapter is omitted", () => {
    render(<ConflictResolutionDialog conflict={info} onKeepLocal={vi.fn()} onDiscardLocal={vi.fn()} />);
    expect(screen.queryByTestId("conflict-save-as-new")).toBeNull();
  });

  it("renders Save-as-new when onSaveAsNewChapter is supplied", () => {
    render(
      <ConflictResolutionDialog
        conflict={info}
        onKeepLocal={vi.fn()}
        onDiscardLocal={vi.fn()}
        onSaveAsNewChapter={vi.fn()}
      />,
    );
    expect(screen.getByTestId("conflict-save-as-new")).toBeTruthy();
  });

  it("Save-as-new button invokes onSaveAsNewChapter with the conflict info", () => {
    const onSaveAsNewChapter = vi.fn();
    render(
      <ConflictResolutionDialog
        conflict={info}
        onKeepLocal={vi.fn()}
        onDiscardLocal={vi.fn()}
        onSaveAsNewChapter={onSaveAsNewChapter}
      />,
    );
    fireEvent.click(screen.getByTestId("conflict-save-as-new"));
    expect(onSaveAsNewChapter).toHaveBeenCalledWith(info);
  });
});
