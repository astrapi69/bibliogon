/**
 * Pins the chapter snapshots/version view (CHAPTER-SNAPSHOTS-01 C2;
 * extracted from ChapterVersionsModal in the Dialog->Pages migration C6):
 * - Manual snapshots render a "Snapshot" badge + name; auto rows a v-badge.
 * - Take Snapshot calls createSnapshot with the typed name + reloads.
 * - Restore confirms first; on cancel restoreVersion is never called.
 * - Delete is only offered for manual rows and confirms (danger).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import ChapterVersionsView from "./ChapterVersionsView";
import type { ChapterVersionSummary } from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, f: string) => f,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

const mockConfirm = vi.fn();
vi.mock("../shared/AppDialog", () => ({
  useDialog: () => ({ confirm: mockConfirm }),
}));

vi.mock("../../utils/platform/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

const listVersions = vi.fn();
const createSnapshot = vi.fn();
const restoreVersion = vi.fn();
const deleteVersion = vi.fn();
const diffVersion = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    chapters: {
      listVersions: (...a: unknown[]) => listVersions(...a),
      createSnapshot: (...a: unknown[]) => createSnapshot(...a),
      restoreVersion: (...a: unknown[]) => restoreVersion(...a),
      deleteVersion: (...a: unknown[]) => deleteVersion(...a),
      diffVersion: (...a: unknown[]) => diffVersion(...a),
    },
  },
}));

const AUTO: ChapterVersionSummary = {
  id: "auto1",
  chapter_id: "ch1",
  title: "Chapter One",
  version: 3,
  name: null,
  is_manual: false,
  created_at: "2026-06-01T10:00:00Z",
};
const MANUAL: ChapterVersionSummary = {
  id: "man1",
  chapter_id: "ch1",
  title: "Chapter One",
  version: 4,
  name: "Before restructure",
  is_manual: true,
  created_at: "2026-06-01T11:00:00Z",
};

function renderModal() {
  return render(
    <ChapterVersionsView bookId="b1" chapterId="ch1" onRestored={vi.fn()} />,
  );
}

describe("ChapterVersionsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listVersions.mockResolvedValue([MANUAL, AUTO]);
    createSnapshot.mockResolvedValue({ ...MANUAL, id: "man2" });
    restoreVersion.mockResolvedValue({});
    deleteVersion.mockResolvedValue(undefined);
    diffVersion.mockResolvedValue({
      version_id: MANUAL.id,
      title_changed: true,
      snapshot_title: "Old Title",
      current_title: "New Title",
      lines: [
        { type: "unchanged", text: "alpha" },
        { type: "removed", text: "beta" },
        { type: "added", text: "gamma" },
      ],
    });
    mockConfirm.mockResolvedValue(true);
  });

  it("renders a manual snapshot badge + name and an auto version badge", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    expect(
      screen.getByTestId(`chapter-version-manual-${MANUAL.id}`),
    ).toBeTruthy();
    expect(screen.getByText("Before restructure")).toBeTruthy();
    // Auto row shows a v-badge, no manual badge.
    expect(
      screen.queryByTestId(`chapter-version-manual-${AUTO.id}`),
    ).toBeNull();
    expect(screen.getByText("v3")).toBeTruthy();
  });

  it("offers Delete only for manual snapshots", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    expect(
      screen.getByTestId(`chapter-version-delete-${MANUAL.id}`),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(`chapter-version-delete-${AUTO.id}`),
    ).toBeNull();
  });

  it("takes a named snapshot and reloads the list", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    fireEvent.change(screen.getByTestId("chapter-snapshot-name"), {
      target: { value: "Milestone" },
    });
    fireEvent.click(screen.getByTestId("chapter-snapshot-create"));
    await waitFor(() =>
      expect(createSnapshot).toHaveBeenCalledWith("b1", "ch1", "Milestone"),
    );
    // Reload fires again after creation (1 on mount + 1 after create).
    await waitFor(() =>
      expect(listVersions.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("restores only after confirmation", async () => {
    mockConfirm.mockResolvedValue(false);
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    fireEvent.click(screen.getByTestId(`chapter-version-restore-${AUTO.id}`));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(restoreVersion).not.toHaveBeenCalled();
  });

  it("restores when confirmed", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    fireEvent.click(screen.getByTestId(`chapter-version-restore-${AUTO.id}`));
    await waitFor(() =>
      expect(restoreVersion).toHaveBeenCalledWith("b1", "ch1", AUTO.id),
    );
  });

  it("deletes a manual snapshot with a danger confirm", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    fireEvent.click(screen.getByTestId(`chapter-version-delete-${MANUAL.id}`));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockConfirm.mock.calls[0][2]).toBe("danger");
    await waitFor(() =>
      expect(deleteVersion).toHaveBeenCalledWith("b1", "ch1", MANUAL.id),
    );
  });

  it("shows a line diff with added/removed lines and a title-change note", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    fireEvent.click(screen.getByTestId(`chapter-version-diff-${MANUAL.id}`));
    const panel = await screen.findByTestId("chapter-version-diff");
    expect(diffVersion).toHaveBeenCalledWith("b1", "ch1", MANUAL.id);
    expect(
      screen.getByTestId("chapter-version-diff-title-change"),
    ).toBeTruthy();
    expect(panel.textContent).toContain("+ gamma");
    expect(panel.textContent).toContain("- beta");
    // The list is hidden while the diff panel is open.
    expect(screen.queryByTestId("chapter-versions-list")).toBeNull();
  });

  it("returns from the diff panel to the list", async () => {
    renderModal();
    await screen.findByTestId("chapter-versions-list");
    fireEvent.click(screen.getByTestId(`chapter-version-diff-${MANUAL.id}`));
    await screen.findByTestId("chapter-version-diff");
    fireEvent.click(screen.getByTestId("chapter-version-diff-back"));
    await screen.findByTestId("chapter-versions-list");
    expect(screen.queryByTestId("chapter-version-diff")).toBeNull();
  });
});
